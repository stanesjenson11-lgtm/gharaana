"""The apartment block we fly into: a G+13 Bengaluru gated-community block, not a tower.
Stilt parking at the ground, 13 floors of flats, painted plaster with terracotta fins, sliding windows with grilles and
chajjas, balconies with plants and drying clothes, AC units, and a roof with the lift room, tanks and solar heaters.

Blender units are metres; x east, y north, z up. The block is centred on the origin and its front faces south (-y),
towards the lake. Our flat is the middle one on the front of floor OUR (built in interior.py).
"""
import math
import random

import bpy

import kit
import ph
from kit import Boxes, srgb

FLOOR, PLINTH, SLAB, WALL = 3.0, 0.45, 0.15, 0.23
FLOORS = 13  # residential floors above the stilt level
HX, HY = 20.0, 9.0  # half footprint
OUR = 9
BAL_D = 1.6


def ffl(k):
    """Finished floor level of floor k (0 = stilt parking)."""
    return PLINTH + FLOOR * k


ROOF = ffl(FLOORS + 1)

# front flats (x ranges); ours is the middle one
FRONT_FLATS = [(-HX, -7.0), (-7.0, 7.0), (7.0, HX)]
BACK_FLATS = [(-HX, -4.0), (4.0, HX)]


def rooms(x0, x1):
    """Front flat split: bedroom 1, living (balcony), bedroom 2."""
    w = x1 - x0
    return (x0, x0 + 0.315 * w), (x0 + 0.315 * w, x0 + 0.745 * w), (x0 + 0.745 * w, x1)


OUR_ROOMS = rooms(*FRONT_FLATS[1])


class Mats:
    def __init__(self):
        self.plaster = kit.pbr("plaster_cream", "painted_plaster_wall", 2.5, tint=0xede3cf, grime=0.55, bump=0.15)
        self.accent = kit.pbr("plaster_terracotta", "painted_plaster_wall", 2.5, tint=0x9b6a50, grime=0.45, bump=0.15)
        self.band = kit.pbr("plaster_white", "painted_plaster_wall", 2.5, tint=0xf4f2ec, grime=0.35, bump=0.1)
        self.inner = kit.flat("inner_wall", 0xe6e1d8, rough=0.85)
        self.frame = kit.flat("alu_frame", 0xcfd2d4, rough=0.35, metal=0.7)
        self.grille = kit.flat("ms_grille", 0x1c1e21, rough=0.45, metal=0.5)
        self.steel = kit.flat("ss_rail", 0xd9dcdf, rough=0.18, metal=1.0)
        self.glass = kit.glass("window_glass", 0xd6e2e6, rough=0.01)
        self.rail_glass = kit.glass("rail_glass", 0xf1f6f5, rough=0.01)
        self.curtain = kit.palette_flat("curtains", [0xd8cfc0, 0xb9c6cf, 0x9f7d64, 0xe6ddd0, 0x7c8a72, 0xc9a26b, 0xeeeae2, 0x8e5f5a], rough=0.95)
        self.room = kit.room_card()
        self.tiles = kit.pbr("balcony_tiles", "floor_tiles_06", 1.2, rough_mul=0.8, bump=0.1)
        self.roof = kit.pbr("terrace", "concrete_floor_worn_001", 3.0, grime=0.5, bump=0.25)
        self.stilt = kit.pbr("stilt_floor", "concrete_floor_02", 3.0, bump=0.2)
        self.tank = kit.flat("sintex_black", 0x15171a, rough=0.55)
        self.solar = kit.flat("solar_panel", 0x1b2a44, rough=0.12, metal=0.3, coat=1.0)
        self.white_tank = kit.flat("solar_tank", 0xe8e8e6, rough=0.35, metal=0.3)
        self.door = kit.flat("lobby_door", 0x2a2d31, rough=0.3, metal=0.6)


def wall_x(b, y_out, inward, x0, x1, z0, z1, openings):
    """A wall along x with its outer face at y_out, thickness WALL towards `inward` (+1/-1). openings: (xa, xb, sill, head)."""
    ya, yb = y_out, y_out + inward * WALL
    cur = x0
    for a, c, s, h in sorted(openings):
        if a > cur:
            b.add(cur, ya, z0, a, yb, z1)
        if s > z0:
            b.add(a, ya, z0, c, yb, s)
        if h < z1:
            b.add(a, ya, h, c, yb, z1)
        cur = c
    if cur < x1:
        b.add(cur, ya, z0, x1, yb, z1)


def wall_y(b, x_out, inward, y0, y1, z0, z1, openings):
    xa, xb = x_out, x_out + inward * WALL
    cur = y0
    for a, c, s, h in sorted(openings):
        if a > cur:
            b.add(xa, cur, z0, xb, a, z1)
        if s > z0:
            b.add(xa, a, z0, xb, c, s)
        if h < z1:
            b.add(xa, a, h, xb, c, z1)
        cur = c
    if cur < y1:
        b.add(xa, cur, z0, xb, y1, z1)


class Block:
    """Geometry accumulators for one half of the block (lower or upper), built into one collection."""

    def __init__(self):
        self.plaster, self.accent, self.band, self.inner = Boxes(), Boxes(), Boxes(), Boxes()
        self.frame, self.grille, self.steel, self.glass, self.rail_glass = Boxes(), Boxes(), Boxes(), Boxes(), Boxes()
        self.curtain, self.room, self.tiles, self.roof = Boxes(), Boxes(), Boxes(), Boxes()
        self.tank_pts, self.solar, self.white_tank = [], Boxes(), Boxes()

    def build(self, name, m, parent):
        c = kit.coll(name, parent)
        for attr in ("plaster", "accent", "band", "inner", "frame", "grille", "steel", "glass", "rail_glass", "curtain", "room", "tiles", "roof", "solar", "white_tank"):
            getattr(self, attr).build(f"{name}_{attr}", getattr(m, attr), c)
        return c


def window(blk, r, axis, out, inward, a, c, z, sill, head, grille, curtain=True, card=True):
    """A sliding aluminium window in an opening [a, c] of a wall whose outer face is at `out` on `axis` ('x' wall runs along x)."""
    mid = out + inward * WALL * 0.45
    def box(B, u0, u1, d0, d1, z0, z1, rnd=0.0):
        if axis == "x":
            B.add(u0, d0, z0, u1, d1, z1, rnd)
        else:
            B.add(d0, u0, z0, d1, u1, z1, rnd)
    zs, zh = z + sill, z + head
    t = 0.05
    # frame and the meeting stile of two sliding sashes
    box(blk.frame, a, c, mid - 0.04, mid + 0.04, zs, zs + t)
    box(blk.frame, a, c, mid - 0.04, mid + 0.04, zh - t, zh)
    box(blk.frame, a, a + t, mid - 0.04, mid + 0.04, zs, zh)
    box(blk.frame, c - t, c, mid - 0.04, mid + 0.04, zs, zh)
    m = (a + c) / 2
    box(blk.frame, m - 0.025, m + 0.025, mid - 0.06, mid + 0.06, zs, zh)
    box(blk.glass, a + t, m, mid - 0.03, mid - 0.02, zs + t, zh - t)
    box(blk.glass, m, c - t, mid + 0.02, mid + 0.03, zs + t, zh - t)
    # outer sill and a chajja (sunshade) over the head
    box(blk.band, a - 0.1, c + 0.1, out - inward * 0.06, out + inward * 0.02, zs - 0.06, zs)
    box(blk.band, a - 0.25, c + 0.25, out - inward * 0.6, out, zh + 0.12, zh + 0.22)
    if grille:  # box grille outside the glass, the Bengaluru default
        g0, g1 = out - inward * 0.18, out - inward * 0.16
        n = max(3, int((c - a) / 0.13))
        for k in range(1, n):
            u = a + (c - a) * k / n
            box(blk.grille, u - 0.008, u + 0.008, g0, g1, zs, zh)
        for zz in (zs + 0.02, (zs + zh) / 2, zh - 0.02):
            box(blk.grille, a, c, g0, g1, zz - 0.012, zz + 0.012)
        for zz in (zs, zh):  # the grille's top and bottom trays
            box(blk.grille, a, c, out - inward * 0.18, out, zz - 0.01, zz + 0.01)
    if curtain:
        cover = r.random()
        if cover > 0.15:
            w = (c - a) * min(1.0, 0.35 + cover)
            side = r.random() < 0.5
            u0, u1 = (a, a + w) if side else (c - w, c)
            box(blk.curtain, u0, u1, mid + inward * 0.12, mid + inward * 0.13, zs - 0.1, zh + 0.05, r.random())
    if card:
        box(blk.room, a - 0.5, c + 0.5, out + inward * 1.6, out + inward * 1.63, z, z + FLOOR - SLAB, r.random())


def balcony(blk, r, x0, x1, y_out, z, glass_rail, ours=False):
    """A front balcony slab with railing, from y_out outwards (towards -y) by BAL_D."""
    yo = y_out - BAL_D
    blk.band.add(x0, yo, z - SLAB, x1, y_out, z)
    blk.tiles.add(x0 + 0.02, yo + 0.02, z, x1 - 0.02, y_out, z + 0.01)
    blk.band.add(x0, yo, z - SLAB - 0.12, x1, yo + 0.12, z - SLAB)  # drip edge
    if glass_rail:
        blk.rail_glass.add(x0 + 0.05, yo + 0.04, z + 0.06, x1 - 0.05, yo + 0.055, z + 1.0)
        blk.steel.add(x0, yo, z + 1.0, x1, yo + 0.06, z + 1.05)
        for x in (x0 + 0.05, x1 - 0.05):
            blk.steel.add(x - 0.03, yo, z, x + 0.03, y_out, z + 0.06)
    else:  # painted MS railing on a low parapet
        blk.band.add(x0, yo, z, x1, yo + 0.12, z + 0.25)
        n = int((x1 - x0) / 0.11)
        for k in range(n + 1):
            x = x0 + 0.04 + (x1 - x0 - 0.08) * k / n
            blk.grille.add(x - 0.009, yo + 0.05, z + 0.25, x + 0.009, yo + 0.07, z + 1.0)
        blk.grille.add(x0, yo + 0.03, z + 0.98, x1, yo + 0.09, z + 1.03)
    return yo


def build(root):
    """Builds the hero block. Returns (lower collection, upper collection, info for interior and props)."""
    m = Mats()
    r = random.Random(1309)
    lower, upper = Block(), Block()
    balconies = []  # (x0, x1, y_outer, z, floor) for props
    ac_spots = []  # (x, y, z, rot) outdoor AC units

    for k in range(0, FLOORS + 1):
        blk = lower if k <= OUR else upper
        z, zt = ffl(k), ffl(k + 1) - SLAB
        # slab (k = 0 is the plinth) with a white edge band
        if k == 0:
            lower.band.add(-HX - 0.6, -HY - 0.6, 0.0, HX + 0.6, HY + 0.6, PLINTH)
        else:
            blk.band.add(-HX - 0.06, -HY - 0.06, z - SLAB - 0.05, HX + 0.06, HY + 0.06, z)
        if k == 0:
            stilt(lower, m, r)
            continue
        # ---- front facade (y = -HY): three flats, each bedroom-window / living-balcony / bedroom-window
        openings = []
        for fi, (x0, x1) in enumerate(FRONT_FLATS):
            ours = fi == 1 and k == OUR
            b1, lv, b2 = rooms(x0, x1)
            for (ra, rb) in (b1, b2):
                w = min(1.8, (rb - ra) * 0.48)
                cx = (ra + rb) / 2
                openings.append((cx - w / 2, cx + w / 2, z + 0.75, z + 2.1))
                window(blk, r, "x", -HY, 1, cx - w / 2, cx + w / 2, z, 0.75, 2.1, grille=r.random() < 0.7, curtain=not ours, card=not ours)
                if not ours and r.random() < 0.75:
                    ac_spots.append((cx + w / 2 + 0.55, -HY - 0.32, z + 0.05, 0.0))
            da, db = lv[0] + 0.6, lv[1] - 0.6
            openings.append((da, db, z, z + 2.4))
            # sliding balcony doors: ours stand open (two panes stacked to the left), others closed
            mid = -HY + WALL * 0.45
            blk.frame.add(da, mid - 0.04, z + 2.35, db, mid + 0.04, z + 2.4)
            blk.frame.add(da, mid - 0.04, z, db, mid + 0.04, z + 0.04)
            if ours:
                for i in range(2):
                    xa = da + 0.05 + i * 0.06
                    blk.glass.add(xa, mid - 0.03 + i * 0.05, z + 0.04, xa + (db - da) / 3, mid - 0.02 + i * 0.05, z + 2.35)
                    blk.frame.add(xa, mid - 0.04 + i * 0.05, z + 0.04, xa + 0.05, mid + 0.0 + i * 0.05, z + 2.35)
            else:
                n = 3
                for i in range(n):
                    xa, xb = da + (db - da) * i / n, da + (db - da) * (i + 1) / n
                    blk.frame.add(xa, mid - 0.05, z, xa + 0.05, mid + 0.05, z + 2.4)
                    blk.glass.add(xa + 0.05, mid - 0.01, z + 0.04, xb, mid + 0.0, z + 2.35)
                if r.random() > 0.2:
                    w = (db - da) * (0.3 + 0.6 * r.random())
                    blk.curtain.add(da, mid + 0.15, z + 0.02, da + w, mid + 0.16, z + 2.38, r.random())
                blk.room.add(da - 0.5, -HY + 2.2, z, db + 0.5, -HY + 2.23, zt, r.random())
            yo = balcony(blk, r, lv[0], lv[1], -HY, z, glass_rail=(fi == 1) or r.random() < 0.4, ours=ours)
            balconies.append((lv[0], lv[1], yo, z, k, fi))
        wall_x(blk.plaster, -HY, 1, -HX, HX, z, zt, openings)
        # terracotta fins between flats, through the full height of the floor
        for x in (-HX, -7.0, 7.0, HX):
            blk.accent.add(x - 0.32, -HY - 0.55, z - SLAB, x + 0.32, -HY + 0.01, zt + 0.01)

        # ---- back facade (y = +HY): kitchens, utility balconies, the stair core
        openings = []
        for (x0, x1) in BACK_FLATS:
            w = x1 - x0
            for cx, ww, sill in ((x0 + 0.2 * w, 1.2, 1.05), (x0 + 0.75 * w, 1.6, 0.75)):
                openings.append((cx - ww / 2, cx + ww / 2, z + sill, z + 2.1))
                window(blk, r, "x", HY, -1, cx - ww / 2, cx + ww / 2, z, sill, 2.1, grille=True)
            ua, ub = x0 + 0.38 * w, x0 + 0.52 * w  # utility balcony (washing machine, clothes)
            openings.append((ua, ub, z, z + 2.1))
            blk.band.add(ua, HY, z - SLAB, ub, HY + 1.1, z)
            blk.band.add(ua, HY + 1.0, z, ub, HY + 1.1, z + 0.9)
            for xx in (ua, ub - 0.1):
                blk.band.add(xx, HY, z, xx + 0.1, HY + 1.1, z + 0.9)
            blk.room.add(ua, HY - 0.5, z, ub, HY - 0.47, zt, r.random())
            balconies.append((ua, ub, HY + 1.05, z, k, -1))
        for cx in (-2.0, 2.0):  # stair landing ventilators
            openings.append((cx - 0.45, cx + 0.45, z + 1.4, z + 2.3))
            window(blk, r, "x", HY, -1, cx - 0.45, cx + 0.45, z, 1.4, 2.3, grille=True, curtain=False)
        wall_x(blk.plaster, HY, -1, -HX, HX, z, zt, openings)
        for x in (-HX, -4.0, 4.0, HX):
            blk.accent.add(x - 0.32, HY - 0.01, z - SLAB, x + 0.32, HY + 0.55, zt + 0.01)

        # ---- side facades (x = +-HX)
        for side in (-1, 1):
            xo = side * HX
            ops = []
            for cy, ww, sill, head in ((-5.0, 1.5, 0.75, 2.1), (-2.0, 0.6, 1.6, 2.1), (2.0, 0.6, 1.6, 2.1), (5.0, 1.5, 0.75, 2.1)):
                ops.append((cy - ww / 2, cy + ww / 2, z + sill, z + head))
                window(blk, r, "y", xo, -side, cy - ww / 2, cy + ww / 2, z, sill, head, grille=True, curtain=ww > 1)
            wall_y(blk.plaster, xo, -side, -HY, HY, z, zt, ops)

    # ---- roof terrace: parapet, lift machine room with its tank, solar heaters, black tanks
    up = upper
    up.roof.add(-HX + 0.2, -HY + 0.2, ROOF, HX - 0.2, HY - 0.2, ROOF + 0.06)
    for (a, c, y0, y1) in ((-HX, HX, -HY, -HY + 0.15), (-HX, HX, HY - 0.15, HY)):
        up.band.add(a, y0, ROOF, c, y1, ROOF + 1.2)
    for x0 in (-HX, HX - 0.15):
        up.band.add(x0, -HY, ROOF, x0 + 0.15, HY, ROOF + 1.2)
    up.plaster.add(-5.0, 1.0, ROOF, 5.0, 7.5, ROOF + 3.6)  # lift machine room and stair headroom
    up.accent.add(-5.2, 0.8, ROOF + 3.6, 5.2, 7.7, ROOF + 3.8)
    up.plaster.add(-3.5, 2.0, ROOF + 3.8, 3.5, 6.5, ROOF + 5.6)  # overhead water tank
    up.band.add(-3.6, 1.9, ROOF + 5.6, 3.6, 6.6, ROOF + 5.75)
    for i in range(6):  # solar water heaters: tilted collector + white tank
        x = -17.0 + i * 2.6
        for j in range(2):
            y = -6.0 + j * 3.2
            up.solar.add(x, y, ROOF + 0.5, x + 2.0, y + 1.0, ROOF + 0.55)
            up.white_tank.add(x, y + 1.1, ROOF + 0.9, x + 2.0, y + 1.5, ROOF + 1.3)
            up.grille.add(x, y, ROOF, x + 0.05, y + 1.5, ROOF + 0.9)
    for x, y in ((9.0, 4.0), (11.0, 4.0), (13.0, 4.0), (9.0, 6.5), (11.0, 6.5)):
        up.tank_pts.append((x, y, ROOF + 0.4))
        up.band.add(x - 0.7, y - 0.7, ROOF, x + 0.7, y + 0.7, ROOF + 0.4)

    hero = kit.coll("hero", None)
    lc = lower.build("hero_lower", m, kit.coll("hero_lower_src", ph.lib()))
    uc = upper.build("hero_upper", m, kit.coll("hero_upper_src", ph.lib()))
    tank = kit.prim("cyl", "sintex", m.tank, kit.coll("lib_tank", ph.lib()), r=0.62, h=1.35, seg=20)
    kit.scatter("hero_tanks", tank.users_collection[0], [(x, y, z, 0, 1, 1, 1) for x, y, z in up.tank_pts], uc)
    return m, lc, uc, balconies, ac_spots


def stilt(blk, m, r):
    """Stilt parking: a column grid, the lift-and-stair core, a lobby with glass doors."""
    z0, z1 = PLINTH, ffl(1) - SLAB
    for x in [-HX + 0.3 + i * 5.0 for i in range(9)]:
        for y in (-HY + 0.3, -1.0, 1.0, HY - 0.3):
            blk.plaster.add(x - 0.15, y - 0.3, z0, x + 0.15, y + 0.3, z1)
    blk.plaster.add(-4.0, 1.0, z0, 4.0, 1.23, z1)
    blk.plaster.add(-4.0, 1.0, z0, -3.77, HY, z1)
    blk.plaster.add(3.77, 1.0, z0, 4.0, HY, z1)
    blk.glass.add(-3.0, 0.95, z0, 3.0, 0.97, z0 + 2.4)
    blk.frame.add(-3.0, 0.93, z0 + 2.4, 3.0, 0.99, z0 + 2.48)
    blk.accent.add(-4.0, 0.9, z0 + 2.48, 4.0, 1.25, z1)


def stilt_floor(m, parent):
    b = Boxes()
    b.add(-HX, -HY, PLINTH, HX, HY, PLINTH + 0.01)
    return b.build("stilt_floor", m.stilt, parent)


def clothes_stand(m):
    """A steel drying stand with clothes on it; each garment gets its own colour."""
    c = kit.coll("lib_clothes_stand", ph.lib())
    if c.objects:
        return c
    frame, cloth = Boxes(), Boxes()
    r = random.Random(77)
    for x in (-0.75, 0.75):
        frame.add(x - 0.015, -0.3, 0, x + 0.015, -0.27, 1.0)
        frame.add(x - 0.015, 0.27, 0, x + 0.015, 0.3, 1.0)
    for y in (-0.28, -0.1, 0.1, 0.28):
        frame.add(-0.76, y - 0.006, 0.98, 0.76, y + 0.006, 1.0)
    x = -0.7
    while x < 0.62:
        w = 0.18 + r.random() * 0.4
        y = r.choice((-0.28, -0.1, 0.1, 0.28))
        cloth.add(x, y - 0.008, 0.98 - 0.3 - r.random() * 0.45, min(0.72, x + w), y + 0.008, 0.98, r.random())
        x += w + 0.04
    frame.build("stand_frame", m.steel, c)
    cloth.build("stand_clothes", kit.palette_flat("clothes", [0xc23b3b, 0x2f5fa8, 0xf0e6d2, 0xe0a526, 0x3f7d5a, 0xd97aa6, 0x2b2b2f, 0x8fb7d9, 0xf5f5f0, 0x7a4d8f], rough=0.95), c)
    return c


def washer(m):
    c = kit.coll("lib_washer", ph.lib())
    if not c.objects:
        b = Boxes()
        b.add(-0.3, -0.3, 0, 0.3, 0.3, 0.85)
        b.build("washer", kit.flat("washer_white", 0xeceeee, rough=0.3), c)
    return c


def dress(m, lc, uc, balconies, ac_spots):
    """Life on the facade: AC units, plants, chairs and drying clothes on the balconies."""
    r = random.Random(4242)
    ac, _ = ph.model("exterior_aircon_unit")
    plants = [ph.model(a)[0] for a in ("potted_plant_01", "potted_plant_02", "potted_plant_04")]
    chair, _ = ph.model("plastic_monobloc_chair_01")
    stand = clothes_stand(m)
    wash = washer(m)
    def where(z):
        return lc if z < ffl(OUR + 1) - 0.5 else uc
    for i, (x, y, z, rot) in enumerate(ac_spots):
        kit.instance(f"ac{i}", ac, x, y, z, rot, collection=where(z))
        b = Boxes()
        b.add(x - 0.45, y - 0.32, z - 0.05, x + 0.45, y + 0.3, z)  # the bracket shelf it sits on
        b.build(f"ac_shelf{i}", m.grille, where(z))
    for i, (x0, x1, yo, z, k, fi) in enumerate(balconies):
        col = where(z)
        front = fi >= 0
        inward = 1 if front else -1
        depth = BAL_D if front else 1.05
        if k == OUR and fi == 1:  # our balcony: two chairs, a side table, plants by the rail
            kit.instance("our_chair1", chair, x0 + 1.0, yo + 0.75, z, math.radians(200), collection=col)
            kit.instance("our_chair2", chair, x0 + 2.2, yo + 0.75, z, math.radians(165), collection=col)
            kit.instance("our_plant1", plants[0], x0 + 0.35, yo + 0.35, z, 0.3, 1.1, collection=col)
            kit.instance("our_plant2", plants[1], x1 - 0.4, yo + 0.4, z, 1.2, 1.0, collection=col)
            kit.instance("our_plant3", plants[2], x1 - 1.0, yo + 0.3, z, 2.0, 1.0, collection=col)
            continue
        if not front:
            kit.instance(f"wash{i}", wash, x0 + 0.4, yo - inward * 0.5, z, 0, collection=col)
            if r.random() < 0.7:
                kit.instance(f"ustand{i}", stand, (x0 + x1) / 2 + 0.2, yo - inward * 0.55, z, math.pi / 2 * 0, 0.7, collection=col)
            continue
        n = r.choice((0, 1, 2, 3, 3, 4))
        for j in range(n):
            kit.instance(f"plant{i}_{j}", r.choice(plants), x0 + 0.35 + r.random() * (x1 - x0 - 0.7), yo + 0.3, z, r.random() * 6.28, 0.7 + r.random() * 0.5, collection=col)
        if r.random() < 0.45:
            kit.instance(f"stand{i}", stand, x0 + 1.2 + r.random() * (x1 - x0 - 2.4), yo + depth * 0.55, z, 0, collection=col)
        if r.random() < 0.35:
            kit.instance(f"chair{i}", chair, x1 - 0.7, yo + 0.8, z, r.random() * 6.28, collection=col)
