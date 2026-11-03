"""Small helpers the film's scene builders share: materials, box meshes, Geometry Nodes instancing."""
import bpy
import bmesh

import ph

# ---------------------------------------------------------------- collections


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def link(obj, collection):
    collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------- shader node plumbing


def _sock(sockets, name, kind=None):
    for s in sockets:
        if s.name == name and (kind is None or s.type == kind):
            return s
    raise KeyError(name)


class Nodes:
    """Thin wrapper so material code reads like a recipe."""

    def __init__(self, tree):
        self.t = tree
        self.n = tree.nodes
        self.l = tree.links

    def new(self, kind, **props):
        node = self.n.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.l.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        m = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        self._in(m.inputs[0], a)
        if b is not None:
            self._in(m.inputs[1], b)
        return m.outputs[0]

    def mix(self, blend, fac, a, b):
        m = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        self._in(_sock(m.inputs, "Factor", "VALUE"), fac)
        self._in(_sock(m.inputs, "A", "RGBA"), a)
        self._in(_sock(m.inputs, "B", "RGBA"), b)
        return _sock(m.outputs, "Result", "RGBA")

    def _in(self, sock, v):
        if hasattr(v, "is_output"):
            self.link(v, sock)
        else:
            sock.default_value = v

    def world_pos(self, scale):
        g = self.new("ShaderNodeNewGeometry")
        v = self.new("ShaderNodeVectorMath", operation="SCALE")
        self.link(g.outputs["Position"], v.inputs[0])
        v.inputs["Scale"].default_value = 1.0 / scale
        return v.outputs[0]

    def image(self, path, vector, srgb=True, box=True):
        t = self.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(path, check_existing=True)
        t.image.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
        if box:
            t.projection = "BOX"
            t.projection_blend = 0.25
        if vector is not None:
            self.link(vector, t.inputs["Vector"])
        return t

    def rand(self, obj=True):
        """0..1, different per piece: the 'rnd' face attribute of merged meshes, plus Object Info random for instances.
        obj=False: the attribute only, so pieces built into different meshes (a house's walls and its parapet) agree."""
        a = self.new("ShaderNodeAttribute", attribute_name="rnd")
        if not obj:
            return a.outputs["Fac"]
        o = self.new("ShaderNodeObjectInfo")
        return self.math("FRACT", self.math("ADD", a.outputs["Fac"], o.outputs["Random"]))

    def night(self):
        """The scene's 'night' value (0 day .. 1 evening), animated by the timeline."""
        v = self.new("ShaderNodeValue")
        d = v.outputs[0].driver_add("default_value").driver
        var = d.variables.new()
        var.name = "night"
        var.targets[0].id_type = "SCENE"
        var.targets[0].id = bpy.context.scene
        var.targets[0].data_path = '["night"]'
        d.expression = "night"
        return v.outputs[0]

    def ramp(self, fac, colors, constant=True):
        r = self.new("ShaderNodeValToRGB")
        r.color_ramp.interpolation = "CONSTANT" if constant else "LINEAR"
        els = r.color_ramp.elements
        while len(els) < len(colors):
            els.new(0.5)
        for i, c in enumerate(colors):
            els[i].position = i / len(colors)
            els[i].color = (*srgb(c), 1)
        self._in(r.inputs["Fac"], fac)
        return r.outputs["Color"]


def srgb(hex_):
    """0xRRGGBB (as seen on screen) -> linear RGB for Blender."""
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (ch((hex_ >> 16) & 255), ch((hex_ >> 8) & 255), ch(hex_ & 255))


def _material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, Nodes(nt)


def _out(nodes, shader):
    o = nodes.new("ShaderNodeOutputMaterial")
    nodes.link(shader, o.inputs["Surface"])


# ---------------------------------------------------------------- materials


def flat(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0, coat=0.0):
    m, nd = _material(name)
    if not nd:
        return m
    b = nd.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*srgb(color), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*srgb(emit), 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    _out(nd, b.outputs[0])
    return m


def pbr(name, asset, scale, tint=None, palette=None, rough_mul=1.0, bump=0.2, grime=0.0, metal=0.0, res="2k", obj=True, detail=0.75):
    """A Poly Haven surface projected in world space (metres per tile = scale), so any size of box keeps true scale.
    palette: a list of 0xRRGGBB picked per object/instance (Object Info > Random), multiplied over the texture's detail."""
    m, nd = _material(name)
    if not nd:
        return m
    maps = ph.texture(asset, res)
    vec = nd.world_pos(scale)
    b = nd.new("ShaderNodeBsdfPrincipled")
    b.inputs["Metallic"].default_value = metal
    col = nd.image(maps["diff"], vec).outputs["Color"]
    if palette or tint:
        # keep the texture's light and dark detail, swap its colour
        bw = nd.new("ShaderNodeRGBToBW")
        nd.link(col, bw.inputs[0])
        detail = nd.math("MULTIPLY", bw.outputs[0], 2.0)
        if palette:
            base = nd.ramp(nd.rand(obj), palette)
        else:
            base = (*srgb(tint), 1)
        dcol = nd.new("ShaderNodeCombineColor")
        for i in range(3):
            nd.link(detail, dcol.inputs[i])
        col = nd.mix("MULTIPLY", detail, base, dcol.outputs[0])
    if grime:
        # monsoon streaks: noise stretched down the walls
        gp = nd.new("ShaderNodeVectorMath", operation="MULTIPLY")
        geo = nd.new("ShaderNodeNewGeometry")
        nd.link(geo.outputs["Position"], gp.inputs[0])
        gp.inputs[1].default_value = (0.9, 0.9, 0.06)
        nz = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
        nz.inputs["Scale"].default_value = 3.0
        nz.inputs["Detail"].default_value = 6.0
        nd.link(gp.outputs[0], nz.inputs["Vector"])
        streak = nd.math("POWER", nd.math("SUBTRACT", nz.outputs["Fac"], 0.35, clamp=True), 1.5)
        dark = nd.math("MULTIPLY", streak, grime)
        col = nd.mix("MULTIPLY", dark, col, (0.25, 0.24, 0.22, 1))
    nd.link(col, b.inputs["Base Color"])
    if "rough" in maps:
        r = nd.image(maps["rough"], vec, srgb=False).outputs["Color"]
        nd.link(nd.math("MULTIPLY", r, rough_mul, clamp=True), b.inputs["Roughness"])
    if bump and "disp" in maps:
        h = nd.image(maps["disp"], vec, srgb=False).outputs["Color"]
        bn = nd.new("ShaderNodeBump")
        bn.inputs["Strength"].default_value = bump
        bn.inputs["Distance"].default_value = 0.02 * scale
        nd.link(h, bn.inputs["Height"])
        nd.link(bn.outputs["Normal"], b.inputs["Normal"])
    _out(nd, b.outputs[0])
    return m


def glass(name="glass", color=0xdfe8ee, rough=0.02, tint_dark=False):
    """Architectural glass: refracts for camera rays, lets shadow rays through (no caustic noise)."""
    m, nd = _material(name)
    if not nd:
        return m
    g = nd.new("ShaderNodeBsdfGlass")
    g.inputs["Color"].default_value = (*srgb(color), 1)
    g.inputs["Roughness"].default_value = rough
    g.inputs["IOR"].default_value = 1.45
    t = nd.new("ShaderNodeBsdfTransparent")
    t.inputs["Color"].default_value = (*srgb(color), 1)
    lp = nd.new("ShaderNodeLightPath")
    mx = nd.new("ShaderNodeMixShader")
    nd.link(lp.outputs["Is Shadow Ray"], mx.inputs[0])
    nd.link(g.outputs[0], mx.inputs[1])
    nd.link(t.outputs[0], mx.inputs[2])
    _out(nd, mx.outputs[0])
    return m


def water(name="water"):
    """Lake water: dark green-grey, glossy, with a slow ripple."""
    m, nd = _material(name)
    if not nd:
        return m
    b = nd.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*srgb(0x2b3a33), 1)
    b.inputs["Roughness"].default_value = 0.04
    b.inputs["Specular IOR Level"].default_value = 0.6
    nz = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
    nz.inputs["Scale"].default_value = 0.35
    nz.inputs["Detail"].default_value = 8.0
    nd.link(nd.world_pos(1.0), nz.inputs["Vector"])
    bump = nd.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    nd.link(nz.outputs["Fac"], bump.inputs["Height"])
    nd.link(bump.outputs["Normal"], b.inputs["Normal"])
    _out(nd, b.outputs[0])
    return m


def leaf(name, color):
    """Leaves: two-sided, a little translucent, colour varying per instance."""
    m, nd = _material(name)
    if not nd:
        return m
    b = nd.new("ShaderNodeBsdfPrincipled")
    col = nd.ramp(nd.rand(), [color, color + 0x0a0c02, color - 0x080a02, color + 0x101405], constant=False)
    nd.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.6
    t = nd.new("ShaderNodeBsdfTranslucent")
    nd.link(col, t.inputs["Color"])
    mx = nd.new("ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.25
    nd.link(b.outputs[0], mx.inputs[1])
    nd.link(t.outputs[0], mx.inputs[2])
    _out(nd, mx.outputs[0])
    return m


def palette_flat(name, palette, rough=0.7, metal=0.0):
    """One flat colour per object/instance, picked from a palette."""
    m, nd = _material(name)
    if not nd:
        return m
    b = nd.new("ShaderNodeBsdfPrincipled")
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    nd.link(nd.ramp(nd.rand(), palette), b.inputs["Base Color"])
    _out(nd, b.outputs[0])
    return m


def room_card(name="room_card"):
    """What you glimpse through other flats' windows: a dim room, and a warm lamp in about half of them at night."""
    m, nd = _material(name)
    if not nd:
        return m
    b = nd.new("ShaderNodeBsdfPrincipled")
    r = nd.rand()
    b.inputs["Base Color"].default_value = (*srgb(0x6b625a), 1)
    b.inputs["Roughness"].default_value = 0.9
    b.inputs["Emission Color"].default_value = (*srgb(0xffd6a6), 1)
    # by day a room is lit by its other windows (a faint glow stands in for that bounce); at night about half the lamps are on
    lit = nd.math("GREATER_THAN", r, 0.45)
    lamp = nd.math("MULTIPLY", nd.math("MULTIPLY", lit, nd.night()), nd.math("ADD", nd.math("MULTIPLY", r, 4.0), 2.0))
    nd.link(nd.math("ADD", lamp, nd.math("ADD", 0.05, nd.math("MULTIPLY", r, 0.12))), b.inputs["Emission Strength"])
    _out(nd, b.outputs[0])
    return m


# ---------------------------------------------------------------- geometry


class Boxes:
    """Collects axis-aligned boxes (min corner, max corner) and builds them as one mesh (one draw, one BVH)."""

    def __init__(self):
        self.v, self.f, self.r = [], [], []

    def add(self, x0, y0, z0, x1, y1, z1, rnd=0.0):
        if x1 < x0: x0, x1 = x1, x0
        if y1 < y0: y0, y1 = y1, y0
        if z1 < z0: z0, z1 = z1, z0
        i = len(self.v)
        self.v += [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        self.f += [(i, i + 3, i + 2, i + 1), (i + 4, i + 5, i + 6, i + 7), (i, i + 1, i + 5, i + 4),
                   (i + 1, i + 2, i + 6, i + 5), (i + 2, i + 3, i + 7, i + 6), (i + 3, i, i + 4, i + 7)]
        self.r += [rnd] * 6
        return self

    def cbox(self, cx, cy, cz, sx, sy, sz, rnd=0.0):
        """Centred box; cz is the bottom."""
        return self.add(cx - sx / 2, cy - sy / 2, cz, cx + sx / 2, cy + sy / 2, cz + sz, rnd)

    def build(self, name, mat, collection, smooth=False):
        if not self.v:
            return None
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        if any(self.r):
            me.attributes.new("rnd", "FLOAT", "FACE").data.foreach_set("value", self.r)
        me.materials.append(mat)
        if smooth:
            me.shade_smooth()
        return link(bpy.data.objects.new(name, me), collection)


def mesh_obj(name, verts, faces, mat, collection, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if mat:
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
    return link(bpy.data.objects.new(name, me), collection)


def prim(kind, name, mat, collection, **kw):
    """A bmesh primitive as a library mesh object (cylinders, spheres, cones)."""
    bm = bmesh.new()
    if kind == "cyl":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=kw.get("seg", 24), radius1=kw["r"], radius2=kw.get("r2", kw["r"]), depth=kw["h"])
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, kw["h"] / 2))
    elif kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=kw.get("seg", 24), v_segments=kw.get("seg", 24) // 2, radius=kw["r"])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if kw.get("smooth", True):
        me.shade_smooth()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), collection)


# ---------------------------------------------------------------- Geometry Nodes scatter


def _scatter_tree(name, pick):
    tree = bpy.data.node_groups.new(name, "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Source", in_out="INPUT", socket_type="NodeSocketCollection")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n, l = tree.nodes, tree.links
    gi, go = n.new("NodeGroupInput"), n.new("NodeGroupOutput")
    ci = n.new("GeometryNodeCollectionInfo")
    ci.transform_space = "ORIGINAL"
    ci.inputs["Separate Children"].default_value = pick
    ci.inputs["Reset Children"].default_value = pick
    l.new(gi.outputs["Source"], ci.inputs["Collection"])
    iop = n.new("GeometryNodeInstanceOnPoints")
    l.new(gi.outputs["Geometry"], iop.inputs["Points"])
    l.new(ci.outputs[0], iop.inputs["Instance"])
    rot = n.new("GeometryNodeInputNamedAttribute")
    rot.data_type = "FLOAT_VECTOR"
    rot.inputs["Name"].default_value = "rot"
    e2r = n.new("FunctionNodeEulerToRotation")
    l.new(rot.outputs["Attribute"], e2r.inputs[0])
    l.new(e2r.outputs[0], iop.inputs["Rotation"])
    scl = n.new("GeometryNodeInputNamedAttribute")
    scl.data_type = "FLOAT_VECTOR"
    scl.inputs["Name"].default_value = "scl"
    l.new(scl.outputs["Attribute"], iop.inputs["Scale"])
    if pick:
        iop.inputs["Pick Instance"].default_value = True
        var = n.new("GeometryNodeInputNamedAttribute")
        var.data_type = "INT"
        var.inputs["Name"].default_value = "var"
        l.new(var.outputs["Attribute"], iop.inputs["Instance Index"])
    l.new(iop.outputs["Instances"], go.inputs["Geometry"])
    return tree


_trees = {}


def scatter(name, source, points, collection):
    """Instances `source` (a collection; with child collections, each point picks one by 'var') at points.
    points: list of (x, y, z, rot_z, sx, sy, sz[, var]). One object, thousands of instances, shared memory."""
    if not points:
        return None
    pick = len(source.children) > 0
    me = bpy.data.meshes.new(name)
    me.from_pydata([p[:3] for p in points], [], [])
    rot = me.attributes.new("rot", "FLOAT_VECTOR", "POINT")
    rot.data.foreach_set("vector", [c for p in points for c in (0.0, 0.0, p[3])])
    scl = me.attributes.new("scl", "FLOAT_VECTOR", "POINT")
    scl.data.foreach_set("vector", [c for p in points for c in p[4:7]])
    if pick:
        var = me.attributes.new("var", "INT", "POINT")
        var.data.foreach_set("value", [int(p[7]) if len(p) > 7 else 0 for p in points])
    obj = link(bpy.data.objects.new(name, me), collection)
    key = "scatter_pick" if pick else "scatter"
    if key not in _trees:
        _trees[key] = _scatter_tree(key, pick)
    mod = obj.modifiers.new("scatter", "NODES")
    mod.node_group = _trees[key]
    ident = [s.identifier for s in _trees[key].interface.items_tree if getattr(s, "name", "") == "Source" and s.in_out == "INPUT"][0]
    mod[ident] = source
    return obj


def variants(name, objects_or_collections):
    """A collection whose children are one collection per variant (for scatter's pick-by-'var')."""
    parent = coll(name, ph.lib())
    for i, item in enumerate(objects_or_collections):
        if isinstance(item, bpy.types.Collection):
            if item.name not in parent.children:
                parent.children.link(item)
        else:
            c = coll(f"{name}_{i}", parent)
            for o in (item if isinstance(item, (list, tuple)) else [item]):
                for uc in list(o.users_collection):
                    uc.objects.unlink(o)
                c.objects.link(o)
    return parent


def lib_coll(name, objects):
    """Moves objects into a new collection under _lib (a source for scatter or collection instances)."""
    c = coll(name, ph.lib())
    for o in objects:
        for uc in list(o.users_collection):
            uc.objects.unlink(o)
        c.objects.link(o)
    return c


def instance(name, source, x, y, z, rot_z=0.0, s=1.0, collection=None):
    """One collection instance (an empty) of a library collection."""
    e = bpy.data.objects.new(name, None)
    e.instance_type = "COLLECTION"
    e.instance_collection = source
    e.location = (x, y, z)
    e.rotation_euler = (0, 0, rot_z)
    e.scale = (s, s, s)
    return link(e, collection or bpy.context.scene.collection)


def facade(name, palette, asset="painted_plaster_wall", scale=2.5, floor_h=3.0, base_z=0.45, grime=0.5, shopfront=False):
    """Painted plaster walls with windows drawn in world space: every house gets its own colour, window spacing and
    offset (from its 'rnd'), MS grilles on some, curtains in some panes, and about half the windows lit at night."""
    m, nd = _material(name)
    if not nd:
        return m
    maps = ph.texture(asset, "1k")
    geo = nd.new("ShaderNodeNewGeometry")
    sep_p = nd.new("ShaderNodeSeparateXYZ")
    nd.link(geo.outputs["Position"], sep_p.inputs[0])
    sep_n = nd.new("ShaderNodeSeparateXYZ")
    nd.link(geo.outputs["Normal"], sep_n.inputs[0])
    r = nd.rand(obj=False)
    # horizontal coordinate along the wall: y on walls facing east/west, x on walls facing north/south
    xn = nd.math("GREATER_THAN", nd.math("ABSOLUTE", sep_n.outputs["X"]), nd.math("ABSOLUTE", sep_n.outputs["Y"]))
    h = nd.math("ADD", nd.math("MULTIPLY", xn, sep_p.outputs["Y"]), nd.math("MULTIPLY", nd.math("SUBTRACT", 1.0, xn), sep_p.outputs["X"]))
    spacing = nd.math("ADD", 2.6, nd.math("MULTIPLY", r, 1.8))
    hu = nd.math("DIVIDE", nd.math("ADD", h, nd.math("MULTIPLY", r, 17.3)), spacing)
    u = nd.math("FRACT", hu)
    zv = nd.math("DIVIDE", nd.math("SUBTRACT", sep_p.outputs["Z"], base_z), floor_h)
    v = nd.math("FRACT", zv)
    side = nd.math("LESS_THAN", nd.math("ABSOLUTE", sep_n.outputs["Z"]), 0.5)
    def band(x, lo, hi):
        return nd.math("MULTIPLY", nd.math("GREATER_THAN", x, lo), nd.math("LESS_THAN", x, hi))
    ww = nd.math("ADD", 0.16, nd.math("MULTIPLY", r, 0.1))  # window half-margins vary per house
    win = nd.math("MULTIPLY", nd.math("MULTIPLY", band(u, ww, nd.math("SUBTRACT", 1.0, ww)), band(v, 0.27, 0.74)), side)
    fr = nd.math("MULTIPLY", nd.math("MULTIPLY", band(u, nd.math("SUBTRACT", ww, 0.035), nd.math("ADD", nd.math("SUBTRACT", 1.0, ww), 0.035)), band(v, 0.245, 0.765)), side)
    frame = nd.math("SUBTRACT", fr, win, clamp=True)
    if shopfront:  # ground floor of a shop: a rolling shutter across most of the frontage
        ground = nd.math("LESS_THAN", zv, 1.0)
        win = nd.math("MULTIPLY", win, nd.math("SUBTRACT", 1.0, ground))
    # per-window randomness
    cell = nd.new("ShaderNodeCombineXYZ")
    nd.link(nd.math("FLOOR", hu), cell.inputs[0])
    nd.link(nd.math("FLOOR", zv), cell.inputs[1])
    nd.link(nd.math("MULTIPLY", r, 91.0), cell.inputs[2])
    wn = nd.new("ShaderNodeTexWhiteNoise", noise_dimensions="3D")
    nd.link(cell.outputs[0], wn.inputs["Vector"])
    cr = wn.outputs["Value"]
    grille = nd.math("MULTIPLY", nd.math("MULTIPLY", win, nd.math("GREATER_THAN", r, 0.3)),
                     nd.math("LESS_THAN", nd.math("FRACT", nd.math("MULTIPLY", h, 8.0)), 0.16))
    curtain = nd.math("MULTIPLY", win, nd.math("GREATER_THAN", cr, 0.62))
    # wall paint over the plaster texture's detail
    vec = nd.world_pos(scale)
    tex = nd.image(maps["diff"], vec).outputs["Color"]
    bw = nd.new("ShaderNodeRGBToBW")
    nd.link(tex, bw.inputs[0])
    detail = nd.math("MULTIPLY", bw.outputs[0], 2.0)
    dcol = nd.new("ShaderNodeCombineColor")
    for i in range(3):
        nd.link(detail, dcol.inputs[i])
    wall = nd.mix("MULTIPLY", 0.7, nd.ramp(r, palette), dcol.outputs[0])
    if grime:
        gp = nd.new("ShaderNodeVectorMath", operation="MULTIPLY")
        nd.link(geo.outputs["Position"], gp.inputs[0])
        gp.inputs[1].default_value = (0.9, 0.9, 0.06)
        nz = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
        nz.inputs["Scale"].default_value = 3.0
        nz.inputs["Detail"].default_value = 5.0
        nd.link(gp.outputs[0], nz.inputs["Vector"])
        streak = nd.math("MULTIPLY", nd.math("POWER", nd.math("SUBTRACT", nz.outputs["Fac"], 0.35, clamp=True), 1.5), grime)
        wall = nd.mix("MULTIPLY", streak, wall, (0.25, 0.24, 0.22, 1))
    if shopfront:
        shutter = nd.math("MULTIPLY", nd.math("MULTIPLY", side, nd.math("LESS_THAN", zv, 0.83)), band(u, 0.06, 0.94))
        stripes = nd.math("ADD", 0.75, nd.math("MULTIPLY", 0.25, nd.math("LESS_THAN", nd.math("FRACT", nd.math("MULTIPLY", sep_p.outputs["Z"], 12.0)), 0.5)))
        sh = nd.new("ShaderNodeCombineColor")
        for i, k in enumerate((0.42, 0.43, 0.44)):
            nd.link(nd.math("MULTIPLY", stripes, k), sh.inputs[i])
        wall = nd.mix("MIX", shutter, wall, sh.outputs[0])
    col = nd.mix("MIX", frame, wall, (0.85, 0.86, 0.86, 1))
    col = nd.mix("MIX", win, col, (0.03, 0.035, 0.04, 1))
    col = nd.mix("MIX", curtain, col, nd.ramp(cr, [0xcdbfa8, 0x9fb1bd, 0xe4dccb, 0x8c6f5c, 0xb9a07a]))
    col = nd.mix("MIX", grille, col, (0.02, 0.02, 0.02, 1))
    b = nd.new("ShaderNodeBsdfPrincipled")
    nd.link(col, b.inputs["Base Color"])
    glassy = nd.math("MULTIPLY", win, nd.math("SUBTRACT", 1.0, nd.math("MAXIMUM", curtain, grille)))
    nd.link(nd.math("ADD", 0.85, nd.math("MULTIPLY", glassy, -0.8)), b.inputs["Roughness"])
    b.inputs["Emission Color"].default_value = (*srgb(0xffcf96), 1)
    lit = nd.math("MULTIPLY", nd.math("MULTIPLY", win, nd.math("GREATER_THAN", cr, 0.5)), nd.night())
    nd.link(nd.math("MULTIPLY", lit, 4.0), b.inputs["Emission Strength"])
    # recessed windows: the frame steps the surface in
    bump = nd.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.04
    nd.link(nd.math("SUBTRACT", 1.0, fr), bump.inputs["Height"])
    nd.link(bump.outputs["Normal"], b.inputs["Normal"])
    _out(nd, b.outputs[0])
    return m


def _plane_uv(nd, scale_xy):
    """World-space surface coordinates: (x, y) on floors, (along-wall, z) on walls; returns (u, v) sockets."""
    geo = nd.new("ShaderNodeNewGeometry")
    p = nd.new("ShaderNodeSeparateXYZ")
    nd.link(geo.outputs["Position"], p.inputs[0])
    n = nd.new("ShaderNodeSeparateXYZ")
    nd.link(geo.outputs["Normal"], n.inputs[0])
    flr = nd.math("GREATER_THAN", nd.math("ABSOLUTE", n.outputs["Z"]), 0.5)
    xn = nd.math("GREATER_THAN", nd.math("ABSOLUTE", n.outputs["X"]), nd.math("ABSOLUTE", n.outputs["Y"]))
    along = nd.math("ADD", nd.math("MULTIPLY", xn, p.outputs["Y"]), nd.math("MULTIPLY", nd.math("SUBTRACT", 1.0, xn), p.outputs["X"]))
    u = nd.math("ADD", nd.math("MULTIPLY", flr, p.outputs["X"]), nd.math("MULTIPLY", nd.math("SUBTRACT", 1.0, flr), along))
    v = nd.math("ADD", nd.math("MULTIPLY", flr, p.outputs["Y"]), nd.math("MULTIPLY", nd.math("SUBTRACT", 1.0, flr), p.outputs["Z"]))
    return nd.math("DIVIDE", u, scale_xy[0]), nd.math("DIVIDE", v, scale_xy[1])


def tiles(name, asset, scale, tint, rough=0.1, size=(0.8, 0.8), grout=0x9c9890):
    """Large glazed tiles laid in a grid over a stone texture, with recessed grout lines."""
    m, nd = _material(name)
    if not nd:
        return m
    maps = ph.texture(asset, "1k")
    u, v = _plane_uv(nd, size)
    fu, fv = nd.math("FRACT", u), nd.math("FRACT", v)
    gw = 0.004 / min(size)
    edge = nd.math("MAXIMUM", nd.math("MAXIMUM", nd.math("LESS_THAN", fu, gw), nd.math("GREATER_THAN", fu, 1 - gw)),
                   nd.math("MAXIMUM", nd.math("LESS_THAN", fv, gw), nd.math("GREATER_THAN", fv, 1 - gw)))
    tex = nd.image(maps["diff"], nd.world_pos(scale)).outputs["Color"]
    bw = nd.new("ShaderNodeRGBToBW")
    nd.link(tex, bw.inputs[0])
    det = nd.new("ShaderNodeCombineColor")
    for i in range(3):
        nd.link(nd.math("ADD", 0.6, nd.math("MULTIPLY", bw.outputs[0], 0.5)), det.inputs[i])
    col = nd.mix("MULTIPLY", 1.0, (*srgb(tint), 1), det.outputs[0])
    col = nd.mix("MIX", edge, col, (*srgb(grout), 1))
    b = nd.new("ShaderNodeBsdfPrincipled")
    nd.link(col, b.inputs["Base Color"])
    nd.link(nd.math("ADD", rough, nd.math("MULTIPLY", edge, 0.6)), b.inputs["Roughness"])
    b.inputs["Coat Weight"].default_value = 0.3
    bump = nd.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4
    bump.inputs["Distance"].default_value = 0.002
    nd.link(nd.math("SUBTRACT", 1.0, edge), bump.inputs["Height"])
    nd.link(bump.outputs["Normal"], b.inputs["Normal"])
    _out(nd, b.outputs[0])
    return m


def dhurrie(name):
    """A flat-woven cotton dhurrie: indigo, cream and rust bands with a fine weave."""
    m, nd = _material(name)
    if not nd:
        return m
    tc = nd.new("ShaderNodeTexCoord")
    wave = nd.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 3.0
    wave.inputs["Distortion"].default_value = 0.6
    nd.link(tc.outputs["Generated"], wave.inputs["Vector"])
    col = nd.ramp(wave.outputs["Fac"], [0x2b3a67, 0xeee3cc, 0xb4532a, 0xeee3cc, 0x2b3a67, 0xd9a441, 0xeee3cc])
    weave = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
    weave.inputs["Scale"].default_value = 400.0
    nd.link(tc.outputs["Generated"], weave.inputs["Vector"])
    b = nd.new("ShaderNodeBsdfPrincipled")
    nd.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    bump = nd.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nd.link(weave.outputs["Fac"], bump.inputs["Height"])
    nd.link(bump.outputs["Normal"], b.inputs["Normal"])
    _out(nd, b.outputs[0])
    return m


def granite(name):
    """Polished black granite with grey and gold flecks, the default Bengaluru kitchen counter."""
    m, nd = _material(name)
    if not nd:
        return m
    vec = nd.world_pos(1.0)
    wn = nd.new("ShaderNodeTexVoronoi")
    wn.inputs["Scale"].default_value = 180.0
    nd.link(vec, wn.inputs["Vector"])
    nz = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
    nz.inputs["Scale"].default_value = 40.0
    nd.link(vec, nz.inputs["Vector"])
    fleck = nd.math("MULTIPLY", wn.outputs["Distance"], nz.outputs["Fac"])
    col = nd.ramp(fleck, [0x0b0b0c, 0x0b0b0c, 0x0b0b0c, 0x1b1b1d, 0x2c2a28, 0x6b5a3a], constant=False)
    b = nd.new("ShaderNodeBsdfPrincipled")
    nd.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.12
    b.inputs["Coat Weight"].default_value = 0.6
    _out(nd, b.outputs[0])
    return m


def screen(name):
    """A TV showing a still of the photographed sky, lit from within."""
    m, nd = _material(name)
    if not nd:
        return m
    tc = nd.new("ShaderNodeTexCoord")
    mp = nd.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 0.14, 0.15)  # frame the sunset horizon and its sun
    mp.inputs["Location"].default_value = (0.0, 0.49, 0.45)
    nd.link(tc.outputs["Generated"], mp.inputs["Vector"])
    sep = nd.new("ShaderNodeSeparateXYZ")
    nd.link(mp.outputs["Vector"], sep.inputs[0])
    uv = nd.new("ShaderNodeCombineXYZ")
    nd.link(sep.outputs["Y"], uv.inputs[0])
    nd.link(sep.outputs["Z"], uv.inputs[1])
    img = nd.image(ph.tonemapped("qwantani_sunset_puresky"), uv.outputs[0], box=False)
    e = nd.new("ShaderNodeEmission")
    nd.link(img.outputs["Color"], e.inputs["Color"])
    e.inputs["Strength"].default_value = 2.2
    g = nd.new("ShaderNodeBsdfGlossy")
    g.inputs["Roughness"].default_value = 0.05
    g.inputs["Color"].default_value = (0.04, 0.04, 0.04, 1)
    add = nd.new("ShaderNodeAddShader")
    nd.link(e.outputs[0], add.inputs[0])
    nd.link(g.outputs[0], add.inputs[1])
    _out(nd, add.outputs[0])
    return m


def painting(name, palette, seed=1.0):
    """An abstract canvas: soft colour fields and brushy edges from layered noise."""
    m, nd = _material(name)
    if not nd:
        return m
    tc = nd.new("ShaderNodeTexCoord")
    nz = nd.new("ShaderNodeTexNoise", noise_dimensions="4D")
    nz.inputs["Scale"].default_value = 2.2
    nz.inputs["Detail"].default_value = 3.0
    nz.inputs["Distortion"].default_value = 1.8
    nz.inputs["W"].default_value = seed
    nd.link(tc.outputs["Generated"], nz.inputs["Vector"])
    col = nd.ramp(nz.outputs["Fac"], palette)
    fine = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
    fine.inputs["Scale"].default_value = 120.0
    nd.link(tc.outputs["Generated"], fine.inputs["Vector"])
    b = nd.new("ShaderNodeBsdfPrincipled")
    nd.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.75
    bump = nd.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    nd.link(fine.outputs["Fac"], bump.inputs["Height"])
    nd.link(bump.outputs["Normal"], b.inputs["Normal"])
    _out(nd, b.outputs[0])
    return m


def terrain(name, layers, masks, bump=0.5, res="2k", macro=0.14, tint=None, tint_mix=0.3):
    """Ground that never visibly tiles: several Poly Haven surfaces blended by large world-space noise, deep relief
    (so blades, gravel and cracks catch the sun and cast small shadows), and slow brightness drift on top.
    layers: [(asset, metres per tile)]; masks: one per extra layer, (noise size in metres, threshold, softness)."""
    m, nd = _material(name)
    if not nd:
        return m
    cols, roughs, heights = [], [], []
    for asset, sc in layers:
        maps = ph.texture(asset, res)
        vec = nd.world_pos(sc)
        cols.append(nd.image(maps["diff"], vec).outputs["Color"])
        roughs.append(nd.image(maps["rough"], vec, srgb=False).outputs["Color"] if "rough" in maps else (0.85, 0.85, 0.85, 1))
        heights.append(nd.image(maps["disp"], vec, srgb=False).outputs["Color"] if "disp" in maps else (0.5, 0.5, 0.5, 1))
    col, rough, height = cols[0], roughs[0], heights[0]
    for i, (size, thr, soft) in enumerate(masks, start=1):
        nz = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
        nz.inputs["Detail"].default_value = 6.0
        nz.inputs["Roughness"].default_value = 0.6
        nd.link(nd.world_pos(size), nz.inputs["Vector"])
        mr = nd.new("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        nd.link(nz.outputs["Fac"], mr.inputs["Value"])
        mr.inputs["From Min"].default_value = thr - soft
        mr.inputs["From Max"].default_value = thr + soft
        f = mr.outputs["Result"]
        col = nd.mix("MIX", f, col, cols[i])
        rough = nd.mix("MIX", f, rough, roughs[i])
        height = nd.mix("MIX", f, height, heights[i])
    if tint:
        col = nd.mix("MULTIPLY", tint_mix, col, (*srgb(tint), 1))
    big = nd.new("ShaderNodeTexNoise", noise_dimensions="3D")
    big.inputs["Detail"].default_value = 3.0
    nd.link(nd.world_pos(70.0), big.inputs["Vector"])
    shade = nd.math("ADD", 1.0 - macro, nd.math("MULTIPLY", big.outputs["Fac"], 2 * macro))
    sc_col = nd.new("ShaderNodeCombineColor")
    for k in range(3):
        nd.link(shade, sc_col.inputs[k])
    col = nd.mix("MULTIPLY", 1.0, col, sc_col.outputs[0])
    b = nd.new("ShaderNodeBsdfPrincipled")
    nd.link(col, b.inputs["Base Color"])
    nd.link(rough, b.inputs["Roughness"])
    bp = nd.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.06
    nd.link(height, bp.inputs["Height"])
    nd.link(bp.outputs["Normal"], b.inputs["Normal"])
    _out(nd, b.outputs[0])
    return m
