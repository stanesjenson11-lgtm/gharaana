"""Our flat: a lived-in Bengaluru 3BHK on floor 9 of the block, furnished room by room for the walk-through.

Living room: a teal sofa facing a walnut TV wall (55" TV, set-top box, soundbar), a bookshelf full of books, framed
photos, a wall clock, a ceiling fan, a split AC. Dining for six, open to a kitchen with a black granite counter, gas hob
and chimney, fridge, microwave, mixer, a pressure cooker and steel vessels, an LPG cylinder. Two bedrooms with different
bed colours and wall art, a brown wardrobe, side lamps, fans. A bathroom with a basin under a mirror, a toilet with a
health faucet, and a bathtub with a rain shower behind a glass partition.

Plan (Blender coordinates; the flat is x -7..7, y -9..-1; the front wall's inside face is y = -8.77):
  front row  y -8.77..-4.6 : bedroom 1 (x -7..-2.59) | living (x -2.59..3.43, balcony beyond) | bedroom 2 (x 3.43..7)
  back row   y -4.6..-1.23 : bath (x -7..-4) | passage (x -4..-1.4, entrance) | dining (x -1.4..3) | kitchen (x 3..7)
"""
import math
import random

import bpy

import building
import kit
import ph
from kit import Boxes

Z = building.ffl(building.OUR)  # finished floor
CEIL = building.ffl(building.OUR + 1) - building.SLAB - 0.05  # under the slab edge band
FRONT = -building.HY + building.WALL  # inside face of the front wall
SPLIT = -4.6
BACK = -1.23
T = 0.12  # partition thickness


def facing(fx, fy):
    """Rotation for a Poly Haven model (whose front faces -y) so it faces direction (fx, fy)."""
    return math.atan2(fx, -fy)


class Room:
    def __init__(self, c, ceiling):
        self.c = c
        self.ceiling = ceiling  # things hung from the ceiling rise with it in the plan shot
        self.n = 0

    def box(self, mat, x0, y0, z0, x1, y1, z1, bevel=0.0, name="part"):
        """A single box as its own object (so it can be rounded with a bevel)."""
        b = Boxes().add(x0, y0, Z + z0, x1, y1, Z + z1)
        self.n += 1
        o = b.build(f"{name}{self.n}", mat, self.c)
        if bevel:
            m = o.modifiers.new("round", "BEVEL")
            m.width = bevel
            m.segments = 3
            m.limit_method = "NONE"
            o.data.shade_smooth()
        return o

    def put(self, asset, x, y, z=0.0, rot=0.0, s=1.0, height=None, to=None):
        coll, h = ph.model(asset)
        if height:
            s = height / max(h, 1e-3)
        self.n += 1
        return kit.instance(f"{asset}_{self.n}", coll, x, y, Z + z, rot, s, collection=to or self.c)

    def cyl(self, mat, x, y, z, r, h, r2=None, seg=32, name="cyl"):
        self.n += 1
        o = kit.prim("cyl", f"{name}{self.n}", mat, self.c, r=r, r2=r if r2 is None else r2, h=h, seg=seg)
        o.location = (x, y, Z + z)
        return o


def mats():
    def paint(name, hexc):
        return kit.pbr(name, "painted_plaster_wall", 2.0, tint=hexc, bump=0.03, detail=0.25)
    return {
        "wall": paint("wall_warm_white", 0xf1ede4),
        "sage": paint("wall_sage", 0xb3bfa6),
        "peach": paint("wall_peach", 0xe9c8b0),
        "ceiling": kit.flat("ceiling_white", 0xf6f5f2, rough=0.9),
        "tiles": kit.tiles("vitrified_tiles", "marble_01", 0.8, 0xece6da, rough=0.09),
        "laminate": kit.pbr("laminate", "laminate_floor_02", 2.0, rough_mul=0.7, bump=0.1),
        "bath_floor": kit.pbr("bath_floor", "anti_skid_tiles", 1.2, bump=0.2),
        "bath_wall": kit.tiles("bath_wall_tiles", "marble_01", 0.6, 0xd9dadb, rough=0.12, size=(0.6, 1.2)),
        "backsplash": kit.tiles("backsplash", "marble_01", 0.3, 0xf3f1ec, rough=0.08, size=(0.3, 0.15)),
        "walnut": kit.pbr("walnut", "american_walnut_veneer", 1.2, rough_mul=0.8, bump=0.05),
        "oak": kit.pbr("oak", "oak_veneer_01", 1.2, rough_mul=0.8, bump=0.05),
        "lacquer": kit.flat("white_lacquer", 0xf3f2ef, rough=0.25),
        "granite": kit.granite("black_granite"),
        "steel": kit.flat("stainless", 0xc9ccce, rough=0.18, metal=1.0),
        "chrome": kit.flat("chrome", 0xe8e9ea, rough=0.05, metal=1.0),
        "black": kit.flat("black_matte", 0x141516, rough=0.45, metal=0.2),
        "glass_black": kit.flat("glass_black", 0x050607, rough=0.04, coat=1.0),
        "ceramic": kit.flat("ceramic", 0xf7f7f5, rough=0.06, coat=1.0),
        "mirror": kit.flat("mirror", 0xeeeeee, rough=0.02, metal=1.0),
        "glass": kit.glass("shower_glass", 0xeef4f3, rough=0.01),
        "sofa": kit.pbr("sofa_teal", "velour_velvet", 0.6, tint=0x2f5f63, bump=0.2),
        "mustard": kit.pbr("cushion_mustard", "velour_velvet", 0.4, tint=0xd09a2b, bump=0.2),
        "rust": kit.pbr("cushion_rust", "rough_linen", 0.4, tint=0xb1563b, bump=0.3),
        "cream": kit.pbr("cushion_cream", "rough_linen", 0.4, tint=0xeee6d6, bump=0.3),
        "linen": kit.pbr("sheets_white", "rough_linen", 0.5, tint=0xf4f2ec, bump=0.3),
        "duvet_blue": kit.pbr("duvet_blue", "denim_fabric", 0.5, tint=0x2c4a78, bump=0.3),
        "duvet_peach": kit.pbr("duvet_peach", "rough_linen", 0.5, tint=0xd9876a, bump=0.3),
        "rug": kit.dhurrie("rug_dhurrie"),
        "lpg_red": kit.flat("lpg_red", 0xc8231d, rough=0.35, coat=0.5),
        "curtain": kit.pbr("curtain_linen", "rough_linen", 0.8, tint=0xd7cbb5, bump=0.2),
        "books": kit.palette_flat("book_covers", [0x8c1d18, 0x1d3557, 0xe9c46a, 0x2a9d8f, 0xf4f1de, 0x3d405b, 0xe07a5f,
                                                  0x264653, 0x6d597a, 0xb56576, 0x81b29a, 0x222222], rough=0.6),
        "towel": kit.palette_flat("towels", [0xe9e4d8, 0x5a7d9a, 0xc98f6b], rough=0.95),
        "tv": kit.screen("tv_screen"),
        "art1": kit.painting("art_abstract", [0x1d3557, 0xe9c46a, 0xf4f1de, 0xe76f51, 0x2a9d8f], seed=3.0),
        "art2": kit.painting("art_botanical", [0x2f5233, 0x94a670, 0xf1ead6, 0x6b8f4e, 0xc9b28a], seed=11.0),
        "art3": kit.painting("art_warm", [0x9c3d2e, 0xe4b363, 0xf6efe2, 0x3b2f2f, 0xd98c5f], seed=7.0),
        "fridge": kit.flat("fridge_graphite", 0x5d6266, rough=0.25, metal=0.7),
        "ac": kit.flat("ac_white", 0xf4f4f2, rough=0.35),
        "plastic_white": kit.flat("plastic_white", 0xefefec, rough=0.4),
        "lamp_shade": kit.flat("lamp_shade", 0xf3e7d0, rough=0.9, emit=0xffd9a8, emit_strength=1.5),
        "led": kit.flat("led_strip", 0xffffff, rough=0.5, emit=0xfff1dc, emit_strength=4.0),
    }


def build(upper_coll):
    c = kit.coll("flat")
    M = mats()
    R = Room(c, upper_coll)
    r = random.Random(909)

    # ---------------------------------------------------------------- shell: floors, walls, ceiling
    fl = {k: Boxes() for k in ("tiles", "laminate", "bath_floor")}
    fl["tiles"].add(-2.59, FRONT, Z, 3.43, SPLIT, Z + 0.012)  # living
    fl["tiles"].add(-4.0, SPLIT, Z, 7.0, BACK, Z + 0.012)  # passage, dining, kitchen
    fl["laminate"].add(-7.0, FRONT, Z, -2.59, SPLIT, Z + 0.012)
    fl["laminate"].add(3.43, FRONT, Z, 7.0, SPLIT, Z + 0.012)
    fl["bath_floor"].add(-7.0, SPLIT, Z, -4.0, BACK, Z + 0.012)
    for k, b in fl.items():
        b.build("floor_" + k, M[k], c)

    walls = {k: Boxes() for k in ("wall", "sage", "peach", "bath_wall")}
    w = walls["wall"]
    h = CEIL - Z

    def door_wall(B, axis, at, a, b, door=None, top=2.1):
        """A partition along `axis` ('x' runs along x at y=at) from a to b, with an optional door gap (d0, d1)."""
        def seg(u0, u1, z0, z1):
            if u1 <= u0:
                return
            if axis == "x":
                B.add(u0, at - T / 2, Z + z0, u1, at + T / 2, Z + z1)
            else:
                B.add(at - T / 2, u0, Z + z0, at + T / 2, u1, Z + z1)
        if door:
            seg(a, door[0], 0, h)
            seg(door[0], door[1], top, h)
            seg(door[1], b, 0, h)
        else:
            seg(a, b, 0, h)

    door_wall(w, "y", -2.59, FRONT, SPLIT, (-5.5, -4.72))  # bedroom 1 | living
    door_wall(w, "y", 3.43, FRONT, SPLIT, (-5.5, -4.72))  # living | bedroom 2
    door_wall(walls["sage"], "x", SPLIT, -7.0, -2.59)  # bedroom 1 | bath, passage
    door_wall(walls["peach"], "x", SPLIT, 3.0, 7.0)  # bedroom 2 | kitchen
    door_wall(w, "y", -4.0, SPLIT, BACK, (-3.3, -2.5))  # bath | passage
    for a, b in ((SPLIT, -3.3), (-2.5, BACK)):  # tile skin on the bath side of it
        walls["bath_wall"].add(-4.08, a, Z, -4.06, b, CEIL)
    door_wall(w, "y", 3.0, SPLIT, BACK, (-4.3, -2.4), top=2.3)  # dining | kitchen (wide opening)
    door_wall(w, "x", BACK - T / 2 + 0.06, -7.0, 7.0, (-3.2, -2.2))  # the corridor wall with the entrance
    door_wall(walls["sage"], "y", -7.0 + T / 2, FRONT, SPLIT)  # flat-to-flat walls
    door_wall(walls["peach"], "y", 7.0 - T / 2, FRONT, SPLIT)
    door_wall(walls["bath_wall"], "y", -7.0 + T / 2, SPLIT, BACK)
    door_wall(w, "y", 7.0 - T / 2, SPLIT, BACK)
    # the bath's own tiled faces (inside the room) and the bedrooms' accent walls
    walls["bath_wall"].add(-6.93, SPLIT + 0.07, Z, -4.07, SPLIT + 0.09, CEIL)
    walls["bath_wall"].add(-6.93, BACK - 0.09, Z, -4.07, BACK - 0.07, CEIL)
    walls["sage"].add(-6.93, FRONT, Z, -6.91, SPLIT, CEIL)
    walls["peach"].add(6.91, FRONT, Z, 6.93, SPLIT, CEIL)
    for k, b in walls.items():
        b.build("walls_" + k, M[k], c)
    sk = Boxes()  # skirting
    for (x0, y0, x1, y1) in ((-2.53, FRONT, -2.51, SPLIT), (3.35, FRONT, 3.37, SPLIT), (-6.93, FRONT, -6.91, SPLIT), (6.91, FRONT, 6.93, SPLIT)):
        sk.add(x0, y0, Z, x1, y1, Z + 0.08)
    sk.build("skirting", M["lacquer"], c)
    ceil = Boxes()  # the flat's own painted ceiling (rides up with the floors above in the plan shot)
    ceil.add(-7.0, FRONT, CEIL - 0.02, 7.0, BACK, CEIL)
    ceil.build("flat_ceiling", M["ceiling"], upper_coll)
    for x, y in ((0.4, -6.7), (-4.8, -6.7), (5.2, -6.7), (0.8, -2.9), (5.0, -2.9), (-5.5, -2.9), (-2.7, -2.9)):
        lamp = bpy.data.lights.new(f"ceiling_light_{x}_{y}", "AREA")
        lamp.shape = "DISK"
        lamp.size = 0.6
        lamp.energy = 70.0
        lamp.color = (1.0, 0.9, 0.78)
        o = bpy.data.objects.new(lamp.name, lamp)
        o.location = (x, y, CEIL - 0.05)
        o.visible_camera = False
        upper_coll.objects.link(o)

    # ---------------------------------------------------------------- living room
    # walnut slat wall behind the TV, the floating TV unit, the TV
    slats = Boxes()
    for i in range(27):  # stops short of bedroom 1's door
        y = -8.25 + i * 0.1
        slats.add(-2.53, y, Z, -2.49, y + 0.07, CEIL)
    slats.build("tv_wall_slats", M["walnut"], c)
    R.box(M["walnut"], -2.49, -7.95, 0.32, -2.07, -6.05, 0.62, bevel=0.01, name="tv_unit")
    R.box(M["lacquer"], -2.08, -7.93, 0.34, -2.06, -6.07, 0.6, name="tv_unit_front")
    R.box(M["black"], -2.47, -7.62, 1.0, -2.42, -6.38, 1.73, bevel=0.005, name="tv_body")
    R.box(M["tv"], -2.42, -7.6, 1.02, -2.415, -6.4, 1.71, name="tv_screen")
    R.box(M["black"], -2.4, -7.3, 0.62, -2.16, -7.0, 0.67, bevel=0.005, name="settop")
    R.box(M["black"], -2.36, -7.4, 0.62, -2.2, -6.6, 0.71, bevel=0.02, name="soundbar")
    R.put("wall_clock", -2.47, -7.0, 2.15, facing(1, 0), height=0.36)
    R.put("standing_picture_frame_01", -2.3, -6.4, 0.62, facing(1, 0.3))
    R.put("standing_picture_frame_02", -2.32, -7.75, 0.62, facing(1, -0.2))
    R.put("ceramic_vase_02", -2.3, -6.2, 0.62, 0.4, height=0.3)
    # the bookshelf in the window corner: five shelves of books
    sh = Boxes()
    x0, x1, y0, y1 = -2.51, -2.17, -8.74, -8.0
    for zz in (0.0, 0.4, 0.8, 1.2, 1.6, 2.0):
        sh.add(x0, y0, Z + zz, x1, y1, Z + zz + 0.025)
    for yy in (y0, y1 - 0.025):
        sh.add(x0, yy, Z, x1, yy + 0.025, Z + 2.03)
    sh.build("bookshelf", M["oak"], c)
    books = Boxes()
    for shelf in (0.0, 0.4, 0.8, 1.2, 1.6):
        y = y0 + 0.04
        while y < y1 - 0.08:
            if r.random() < 0.12:  # a short stack lying flat
                for k in range(r.randrange(2, 5)):
                    books.add(x0 + 0.04, y, Z + shelf + 0.025 + k * 0.035, x1 - 0.06, y + 0.2, Z + shelf + 0.025 + (k + 1) * 0.035 - 0.003, r.random())
                y += 0.22
                continue
            t = 0.02 + r.random() * 0.035
            hh = 0.18 + r.random() * 0.12
            books.add(x0 + 0.03 + r.random() * 0.04, y, Z + shelf + 0.025, x1 - 0.05, y + t, Z + shelf + 0.025 + hh, r.random())
            y += t + 0.002
    books.build("books", M["books"], c)
    R.put("book_encyclopedia_set_01", -2.32, -8.38, 2.025, facing(1, 0), height=0.25)
    # the sofa: teal velvet, three seats, facing the TV, against bedroom 2's wall, cushions
    sx = 3.37
    R.box(M["sofa"], sx - 0.95, -7.65, 0.12, sx, -5.65, 0.45, bevel=0.06, name="sofa_base")
    R.box(M["sofa"], sx - 0.25, -7.65, 0.45, sx, -5.65, 0.88, bevel=0.08, name="sofa_back")
    for y0_, y1_ in ((-7.65, -7.45), (-5.85, -5.65)):
        R.box(M["sofa"], sx - 0.95, y0_, 0.45, sx - 0.05, y1_, 0.66, bevel=0.07, name="sofa_arm")
    for k in range(3):
        a = -7.45 + k * 0.6
        R.box(M["sofa"], sx - 0.9, a + 0.01, 0.45, sx - 0.25, a + 0.59, 0.58, bevel=0.06, name="sofa_seat")
    for y, mat in ((-7.2, "mustard"), (-6.7, "cream"), (-6.1, "rust")):  # (not rotated: the box's pivot is the world origin)
        R.box(M[mat], sx - 0.4, y - 0.22, 0.56, sx - 0.24, y + 0.22, 1.0, bevel=0.07, name="cushion")
    for y in (-7.6, -5.7):
        R.box(M["black"], sx - 0.9, y - 0.02, 0.0, sx - 0.86, y + 0.02, 0.12, name="sofa_leg")
    R.box(M["rug"], -1.1, -7.9, 0.0, 2.2, -5.4, 0.015, name="rug")
    R.put("modern_coffee_table_01", 0.9, -6.65, 0.015, facing(-1, 0))
    R.put("modern_arm_chair_01", 1.3, -8.25, 0.0, facing(-0.8, 0.6))
    R.put("potted_plant_02", -1.95, -8.45, 0.0, 0.5, height=1.25)
    R.put("ceiling_fan", 0.2, -6.6, CEIL - Z - 0.36, 0.0, height=0.36, to=R.ceiling)
    R.box(M["ac"], 3.12, -7.2, 2.25, 3.37, -6.2, 2.55, bevel=0.03, name="split_ac")
    R.box(M["black"], 3.11, -7.15, 2.27, 3.12, -6.25, 2.3, name="ac_vent")
    for k, (y, zz, asset) in enumerate(((-7.2, 1.55, "hanging_picture_frame_01"), (-6.65, 1.7, "hanging_picture_frame_02"), (-6.1, 1.52, "hanging_picture_frame_03"))):
        R.put(asset, 3.36, y, zz, facing(-1, 0), height=0.45 if k != 1 else 0.6)
    # curtains either side of the sliding door
    for y0_, y1_ in ((-2.5, -1.95), (2.85, 3.4)):
        curtain_panel(c, M["curtain"], y0_, y1_, FRONT + 0.12)
    # ---------------------------------------------------------------- dining
    R.box(M["oak"], -0.5, -3.6, 0.72, 1.3, -2.6, 0.76, bevel=0.01, name="dining_top")
    for x, y in ((-0.4, -3.5), (1.2, -3.5), (-0.4, -2.7), (1.2, -2.7)):
        R.box(M["black"], x - 0.025, y - 0.025, 0.0, x + 0.025, y + 0.025, 0.72, name="dining_leg")
    for x, y, fx, fy in ((-0.1, -3.85, 0, 1), (0.9, -3.85, 0, 1), (-0.1, -2.35, 0, -1), (0.9, -2.35, 0, -1), (-0.85, -3.1, 1, 0), (1.65, -3.1, -1, 0)):
        R.put("dining_chair_02", x, y, 0.0, facing(fx, fy))
    R.put("wooden_bowl_01", 0.4, -3.1, 0.76, 0.3)
    R.put("jug_01", 0.0, -2.9, 0.76, 0.0, height=0.24)
    R.put("modern_ceiling_lamp_01", 0.4, -3.1, CEIL - Z - 0.75, 0.0, height=0.75, to=R.ceiling)
    R.box(M["walnut"], -1.3, -1.7, 0.0, 1.6, -1.29, 0.85, bevel=0.01, name="crockery")
    R.put("tea_set_01", 0.2, -1.5, 0.85, facing(0, -1))
    # passage: shoe rack by the door
    R.box(M["walnut"], -3.95, -2.1, 0.0, -3.6, -1.3, 0.9, bevel=0.01, name="shoe_rack")

    # ---------------------------------------------------------------- kitchen
    kitchen(R, M, r)
    # ---------------------------------------------------------------- bedrooms
    bedroom(R, M, -1, M["duvet_blue"], M["art1"], r)
    bedroom(R, M, 1, M["duvet_peach"], M["art2"], r)
    # ---------------------------------------------------------------- bath
    bath(R, M)
    fan_spin(upper_coll, "ceiling_fan")
    return c


def curtain_panel(c, mat, y0, y1, yy):
    """A pleated curtain: a strip of narrow faces with a sine fold."""
    verts, faces = [], []
    n = 24
    for i in range(n + 1):
        x = y0 + (y1 - y0) * i / n
        d = 0.05 * math.sin(i * math.pi / 2)
        verts += [(x, yy + d, Z + 0.02), (x, yy + d, CEIL - 0.08)]
    for i in range(n):
        faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    return kit.mesh_obj("curtain", verts, faces, mat, c, smooth=True)


def fan_spin(c, asset_prefix):
    """Ceiling fans turn slowly (about one turn every 1.6 s; motion blur does the rest)."""
    for o in c.objects:
        if o.name.startswith(asset_prefix):
            o.keyframe_insert("rotation_euler", index=2, frame=1)
            o.rotation_euler.z += math.tau * (1200 / 24) / 1.6
            o.keyframe_insert("rotation_euler", index=2, frame=1201)
            for fc in o.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"


def kitchen(R, M, r):
    """An L-shaped modular kitchen along the back and east walls."""
    y_back, x_east = BACK - 0.06, 7.0 - 0.06
    d = 0.6
    # base cabinets, granite top, wall cabinets, backsplash
    R.box(M["lacquer"], 3.95, y_back - d, 0.1, x_east, y_back, 0.86, bevel=0.005, name="base_back")
    R.box(M["lacquer"], x_east - d, SPLIT + 0.1, 0.1, x_east, y_back - d, 0.86, bevel=0.005, name="base_east")
    R.box(M["oak"], 3.95, y_back - d - 0.01, 0.1, x_east, y_back - d, 0.86, name="base_fronts")
    R.box(M["black"], 3.95, y_back - d + 0.05, 0.0, x_east, y_back, 0.1, name="kick")
    R.box(M["granite"], 3.93, y_back - d - 0.03, 0.86, x_east, y_back, 0.9, name="granite_back")
    R.box(M["granite"], x_east - d - 0.03, SPLIT + 0.08, 0.86, x_east, y_back - d - 0.03, 0.9, name="granite_east")
    R.box(M["backsplash"], 3.95, y_back - 0.01, 0.9, x_east, y_back, 1.5, name="splash_back")
    R.box(M["backsplash"], x_east - 0.01, SPLIT + 0.08, 0.9, x_east, y_back, 1.5, name="splash_east")
    R.box(M["oak"], 3.95, y_back - 0.35, 1.5, 5.4, y_back, 2.2, bevel=0.005, name="wall_cab")
    R.box(M["lacquer"], x_east - 0.35, SPLIT + 0.1, 1.5, x_east, y_back - 0.6, 2.2, bevel=0.005, name="wall_cab_e")
    # hob and chimney (on the back counter, middle)
    hx = 6.0
    R.box(M["glass_black"], hx - 0.38, y_back - 0.5, 0.9, hx + 0.38, y_back - 0.1, 0.905, name="hob")
    for bx, by in ((hx - 0.22, y_back - 0.38), (hx + 0.22, y_back - 0.38), (hx, y_back - 0.2)):
        R.cyl(M["black"], bx, by, 0.905, 0.075, 0.02, name="burner")
        R.cyl(M["steel"], bx, by, 0.925, 0.03, 0.01, name="burner_cap")
    R.box(M["steel"], hx - 0.45, y_back - 0.5, 1.75, hx + 0.45, y_back, 1.9, bevel=0.01, name="chimney_hood")
    R.box(M["steel"], hx - 0.15, y_back - 0.3, 1.9, hx + 0.15, y_back, CEIL - Z, name="chimney_duct")
    R.box(M["led"], hx - 0.3, y_back - 0.45, 1.745, hx + 0.3, y_back - 0.4, 1.75, name="hood_light")
    # pressure cooker on the front burner, a kadai on the other
    R.cyl(M["steel"], hx - 0.22, y_back - 0.38, 0.93, 0.12, 0.17, name="cooker")
    R.cyl(M["steel"], hx - 0.22, y_back - 0.38, 1.1, 0.1, 0.03, name="cooker_lid")
    R.cyl(M["black"], hx - 0.22, y_back - 0.38, 1.13, 0.012, 0.06, name="whistle")
    R.box(M["black"], hx - 0.22, y_back - 0.39, 1.11, hx + 0.02, y_back - 0.37, 1.13, name="cooker_handle")
    R.cyl(M["steel"], hx + 0.22, y_back - 0.38, 0.93, 0.16, 0.07, r2=0.2, name="kadai")
    # sink with a tap, by the window end of the east counter
    R.box(M["steel"], x_east - 0.52, SPLIT + 0.6, 0.86, x_east - 0.08, SPLIT + 1.3, 0.905, name="sink")
    R.cyl(M["chrome"], x_east - 0.08, SPLIT + 0.95, 0.9, 0.02, 0.3, name="tap")
    R.box(M["chrome"], x_east - 0.3, SPLIT + 0.94, 1.17, x_east - 0.08, SPLIT + 0.96, 1.2, name="tap_spout")
    # steel vessels, tumblers and the masala dabba on the counter
    for k, rr_ in enumerate((0.13, 0.11, 0.09)):
        R.cyl(M["steel"], 4.4, y_back - 0.3, 0.9 + k * 0.1, rr_, 0.1, name="vessel")
    for k in range(4):
        R.cyl(M["steel"], 4.8 + k * 0.08, y_back - 0.18, 0.9, 0.032, 0.11, r2=0.038, name="tumbler")
    R.cyl(M["steel"], 5.25, y_back - 0.35, 0.9, 0.13, 0.08, name="masala_dabba")
    R.cyl(M["plastic_white"], x_east - 0.3, SPLIT + 1.8, 0.9, 0.11, 0.18, name="mixer_base")
    R.cyl(M["steel"], x_east - 0.3, SPLIT + 1.8, 1.08, 0.08, 0.18, r2=0.09, name="mixer_jar")
    R.cyl(M["black"], x_east - 0.3, SPLIT + 2.15, 0.9, 0.08, 0.2, name="kettle")
    rail = Boxes()  # ladles hanging on a rail over the backsplash
    rail.add(4.0, y_back - 0.04, Z + 1.35, 5.3, y_back - 0.02, Z + 1.37)
    for k in range(6):
        x = 4.15 + k * 0.2
        rail.add(x - 0.008, y_back - 0.05, Z + 1.08, x + 0.008, y_back - 0.035, Z + 1.36)
        rail.add(x - 0.035, y_back - 0.07, Z + 1.04, x + 0.035, y_back - 0.035, Z + 1.09)
    rail.build("ladles", M["steel"], R.c)
    # microwave on the back counter, fridge in the corner by the dining opening, the LPG cylinder beside it
    R.box(M["black"], 4.0, y_back - 0.42, 0.9, 4.52, y_back - 0.05, 1.21, bevel=0.01, name="microwave")
    R.box(M["glass_black"], 4.03, y_back - 0.425, 0.95, 4.38, y_back - 0.42, 1.17, name="microwave_door")
    R.box(M["fridge"], 3.1, y_back - 0.72, 0.0, 3.88, y_back, 1.82, bevel=0.02, name="fridge")
    R.box(M["black"], 3.48, y_back - 0.725, 0.02, 3.5, y_back - 0.7, 1.8, name="fridge_split")
    for x in (3.42, 3.56):
        R.box(M["steel"], x - 0.012, y_back - 0.77, 0.9, x + 0.012, y_back - 0.73, 1.45, name="fridge_handle")
    # the red LPG cylinder beside the counter: foot ring, body, shoulder, collar, valve
    R.cyl(M["lpg_red"], 4.25, y_back - 0.85, 0.0, 0.16, 0.05, seg=40, name="lpg_foot")
    R.cyl(M["lpg_red"], 4.25, y_back - 0.85, 0.02, 0.155, 0.62, seg=40, name="lpg")
    R.cyl(M["lpg_red"], 4.25, y_back - 0.85, 0.64, 0.155, 0.08, r2=0.09, seg=40, name="lpg_top")
    R.cyl(M["lpg_red"], 4.25, y_back - 0.85, 0.72, 0.1, 0.1, r2=0.11, seg=40, name="lpg_collar")
    R.cyl(M["steel"], 4.25, y_back - 0.85, 0.72, 0.03, 0.05, name="lpg_valve")
    R.put("pot_enamel_01", x_east - 0.35, SPLIT + 2.6, 0.9, 0.5)


def bedroom(R, M, side, duvet, art, r):
    """side -1: bedroom 1 (west), +1: bedroom 2 (east). Bed headboard on the outer wall, wardrobe on the back wall."""
    xo = side * 6.91  # outer wall face
    cy = -6.45
    inward = -side
    # bed: walnut frame and headboard, white sheets, coloured duvet, pillows
    hb0, hb1 = sorted((xo, xo + inward * 0.08))
    R.box(M["walnut"], hb0, cy - 1.0, 0.0, hb1, cy + 1.0, 1.15, bevel=0.01, name="headboard")
    bx0, bx1 = sorted((xo + inward * 0.08, xo + inward * 2.15))
    R.box(M["walnut"], bx0, cy - 0.95, 0.12, bx1, cy + 0.95, 0.42, bevel=0.015, name="bed_frame")
    R.box(M["linen"], bx0 + 0.02, cy - 0.92, 0.42, bx1 - 0.02, cy + 0.92, 0.62, bevel=0.06, name="mattress")
    d0, d1 = sorted((xo + inward * 0.7, xo + inward * 2.12))
    R.box(duvet, d0, cy - 0.97, 0.55, d1, cy + 0.97, 0.68, bevel=0.05, name="duvet")
    for py in (cy - 0.45, cy + 0.45):
        p0, p1 = sorted((xo + inward * 0.15, xo + inward * 0.55))
        R.box(M["linen"], p0, py - 0.33, 0.62, p1, py + 0.33, 0.78, bevel=0.07, name="pillow")
    # side tables with lamps
    for py in (cy - 1.35, cy + 1.35):
        t0, t1 = sorted((xo + inward * 0.05, xo + inward * 0.5))
        R.box(M["walnut"], t0, py - 0.25, 0.0, t1, py + 0.25, 0.55, bevel=0.01, name="side_table")
        R.cyl(M["lamp_shade"], (t0 + t1) / 2, py, 0.75, 0.13, 0.25, r2=0.1, name="lamp")
        R.cyl(M["black"], (t0 + t1) / 2, py, 0.55, 0.015, 0.22, name="lamp_stem")
    # wall art above the headboard
    a0, a1 = sorted((xo + inward * 0.02, xo + inward * 0.05))
    R.box(M["black"], a0, cy - 0.78, 1.35, a1, cy + 0.78, 2.32, name="art_frame")
    a0, a1 = sorted((xo + inward * 0.05, xo + inward * 0.055))
    R.box(art, a0, cy - 0.74, 1.39, a1, cy + 0.74, 2.28, name="art")
    # the brown wardrobe along the back wall (three doors, handles)
    w0, w1 = sorted((side * 6.85, side * 4.75))  # clear of the door, so it does not fill the doorway shot
    R.box(M["walnut"], w0, SPLIT - 0.66, 0.0, w1, SPLIT - 0.06, 2.3, bevel=0.005, name="wardrobe")
    for k in range(1, 3):
        x = w0 + (w1 - w0) * k / 3
        R.box(M["black"], x - 0.004, SPLIT - 0.665, 0.02, x + 0.004, SPLIT - 0.66, 2.28, name="wardrobe_gap")
        R.box(M["steel"], x - 0.06, SPLIT - 0.69, 0.95, x - 0.04, SPLIT - 0.665, 1.45, name="wardrobe_handle")
    R.put("ceiling_fan", side * 4.9, -6.6, CEIL - Z - 0.36, 0.0, height=0.36, to=R.ceiling)
    a0, a1 = sorted((xo + inward * 0.06, xo + inward * 0.3))
    R.box(M["ac"], a0, cy - 0.5, 2.3, a1, cy + 0.5, 2.6, bevel=0.03, name="bed_ac")
    curtain_panel(R.c, M["curtain"], side * 3.75 if side < 0 else 4.0, side * 4.1 if side < 0 else 4.35, FRONT + 0.12)
    if side > 0:  # study desk under the window in bedroom 2
        R.box(M["oak"], 4.6, FRONT + 0.05, 0.73, 5.9, FRONT + 0.65, 0.76, bevel=0.005, name="desk")
        for x in (4.65, 5.85):
            R.box(M["black"], x - 0.02, FRONT + 0.1, 0.0, x + 0.02, FRONT + 0.6, 0.73, name="desk_leg")
        R.put("modern_arm_chair_01", 5.25, FRONT + 1.05, 0.0, facing(0, -1), s=0.85)
        R.box(M["black"], 4.9, FRONT + 0.25, 0.76, 5.25, FRONT + 0.48, 0.775, name="laptop")
    else:
        R.put("potted_plant_02", -6.5, FRONT + 0.4, 0.0, 1.0, height=1.0)


def bath(R, M):
    """Tub with a rain shower against the far wall, basin under a mirror on the right, toilet on the left."""
    x_far = -6.93
    # bathtub: white rim around a sunken basin
    R.box(M["ceramic"], x_far, -4.45, 0.0, x_far + 0.78, -2.75, 0.55, bevel=0.03, name="tub_outer")
    R.box(M["chrome"], x_far + 0.08, -4.37, 0.36, x_far + 0.7, -2.83, 0.555, name="tub_water_dark")
    R.box(M["ceramic"], x_far + 0.06, -4.4, 0.18, x_far + 0.72, -2.8, 0.36, bevel=0.04, name="tub_inner")
    # rain shower over it: head, arm, mixer, and a glass panel at the tub's open end
    R.cyl(M["chrome"], x_far + 0.4, -3.6, 2.1, 0.13, 0.015, seg=40, name="rain_head")
    R.box(M["chrome"], x_far, -3.61, 2.11, x_far + 0.4, -3.59, 2.13, name="shower_arm")
    R.box(M["chrome"], x_far, -3.68, 1.0, x_far + 0.06, -3.52, 1.15, bevel=0.01, name="mixer")
    R.box(M["glass"], x_far + 0.05, -2.76, 0.55, x_far + 0.8, -2.75, 2.0, name="shower_glass")
    R.box(M["chrome"], x_far + 0.05, -2.77, 1.98, x_far + 0.8, -2.74, 2.0, name="glass_rail")
    # vanity with a ceramic basin, tap, the mirror with a soft light strip, a towel ring
    # vanity and mirror on the south wall (left from the door), toilet on the north wall (right)
    wall = SPLIT + 0.09
    R.box(M["walnut"], -5.95, wall, 0.35, -4.85, wall + 0.52, 0.82, bevel=0.01, name="vanity")
    R.box(M["ceramic"], -5.8, wall + 0.08, 0.82, -5.0, wall + 0.44, 0.86, bevel=0.02, name="counter")
    R.cyl(M["ceramic"], -5.4, wall + 0.26, 0.86, 0.2, 0.13, r2=0.22, seg=48, name="basin")
    R.cyl(M["chrome"], -5.4, wall + 0.05, 0.86, 0.018, 0.24, name="basin_tap")
    R.box(M["chrome"], -5.415, wall + 0.04, 1.08, -5.385, wall + 0.2, 1.1, name="basin_spout")
    R.box(M["mirror"], -5.85, wall, 1.15, -4.95, wall + 0.015, 2.05, name="mirror")
    R.box(M["led"], -5.85, wall - 0.005, 2.07, -4.95, wall + 0.03, 2.09, name="mirror_light")
    R.box(M["towel"], -4.75, wall, 1.0, -4.35, wall + 0.05, 1.55, bevel=0.02, name="towel")
    tx, back = -5.4, BACK - 0.09
    R.box(M["ceramic"], tx - 0.19, back - 0.2, 0.4, tx + 0.19, back, 0.8, bevel=0.03, name="cistern")
    R.cyl(M["ceramic"], tx, back - 0.52, 0.0, 0.17, 0.4, r2=0.2, seg=40, name="bowl")
    R.cyl(M["ceramic"], tx, back - 0.52, 0.4, 0.2, 0.03, seg=40, name="seat")
    R.box(M["chrome"], tx + 0.32, back - 0.05, 0.6, tx + 0.36, back, 0.75, name="health_faucet")
    R.cyl(M["plastic_white"], -6.2, BACK - 0.08, 2.35, 0.12, 0.03, name="exhaust_fan").rotation_euler.x = math.pi / 2
