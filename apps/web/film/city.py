"""The Bengaluru neighbourhood around the block: no skyscrapers, just what a real layout looks like.

Plots of 30x40 and 40x60 ft with G to G+4 houses, each its own colour, with chajjas, balconies, compound walls and gates;
shops with rolling shutters and signboards along the main road, a supermarket, a Namma Metro-style viaduct and station,
a lake with a walking path, a park, a school, a hospital, villas, and a few apartment blocks.
Roofs carry what Bengaluru roofs carry: black water tanks, solar heaters, dish antennas, clothes lines, cement-sheet
canopies, potted plants, a couple of terrace gardens and sit-outs. Overhead wires on poles, coconut palms, rain trees.
"""
import math
import random

import bpy

import building
import kit
import ph
from kit import Boxes

WALLS = [0xf2efe6, 0xe9dfc6, 0xf4ecd6, 0xdedad0, 0xefe2c4, 0xe6c9a8, 0xe3d27f, 0xf2efe6, 0xe8b996, 0xd9c2a3,
         0xb9d1b4, 0xf7f3ea, 0xe7d9bd, 0xb7cfdf, 0xe6b8b3, 0xc9c6bd, 0xece4d0, 0xa8644a, 0xf0ead8, 0xd8c7e0]
ROOFS = [0xa8a6a1, 0xc8c5be, 0x8a8781, 0xe6e6e3, 0xa86d52, 0x96978a, 0xb7aea0]
SIGNS = [0xd62f2f, 0xf2c230, 0x1f5fbf, 0x2e8b57, 0xf07d1a, 0xf4f4f0, 0x7b2d8b, 0x1a1a1a, 0xe23d7a]

DETAIL = 680  # detailed neighbourhood half-size (m); coarse city beyond, out to FAR
FAR = 2400
MAIN_Y, MAIN_W = 140.0, 30.0
ROADS_Y = [(-560.0, 12.0), (-450.0, 12.0), (-345.0, 12.0), (-40.0, 12.0), (50.0, 12.0), (MAIN_Y, MAIN_W),
           (245.0, 12.0), (350.0, 12.0), (455.0, 12.0), (560.0, 12.0)]
ROADS_X = [(float(x), 12.0) for x in (-620, -515, -410, -305, -200, -95, 95, 200, 305, 410, 515, 620)]
LAKE = (0.0, -195.0, 330.0, 132.0)  # centre x, y, radius x, radius y
COMMUNITY = (-95.0, 95.0, -40.0, MAIN_Y)
SCHOOL, HOSPITAL, PARK = (-147.5, 5.0), (147.5, 95.0), (147.5, 5.0)
VILLAS = (252.5, 192.5)
STATION_X = 110.0
MARKET = (-47.5, 192.5)


def in_lake(x, y, grow=0.0):
    cx, cy, rx, ry = LAKE
    return ((x - cx) / (rx + grow)) ** 2 + ((y - cy) / (ry + grow)) ** 2 < 1.0


def blocks():
    """Rectangles between roads (road half-widths removed), with their centre."""
    ys = sorted(ROADS_Y)
    for (ya, wa), (yb, wb) in zip(ys, ys[1:]):
        xs = sorted(ROADS_X + ([(0.0, 12.0)] if ya >= MAIN_Y else []))
        for (xa, va), (xb, vb) in zip(xs, xs[1:]):
            yield (xa + va / 2, xb - vb / 2, ya + wa / 2, yb - wb / 2)


class Kit:
    """Everything the city accumulates before it is built into a handful of meshes and scatters."""

    def __init__(self):
        self.walls, self.shops, self.plain, self.roof = Boxes(), Boxes(), Boxes(), Boxes()
        self.signs, self.grille, self.glass, self.metal, self.dark = Boxes(), Boxes(), Boxes(), Boxes(), Boxes()
        self.foot, self.paved, self.soil, self.grass, self.path = Boxes(), Boxes(), Boxes(), Boxes(), Boxes()
        self.concrete, self.poles, self.wires, self.white = Boxes(), Boxes(), Boxes(), Boxes()
        self.tanks, self.solar, self.dish, self.lines, self.pots, self.chairs, self.sheets = [], [], [], [], [], [], []
        self.gardens, self.trees, self.palms, self.shrubs, self.cars = [], [], [], [], []
        self.tufts = []  # 3D grass clumps where the camera comes close


def materials():
    return {
        "walls": kit.facade("house_walls", WALLS),
        "shops": kit.facade("shop_walls", WALLS, shopfront=True),
        "plain": kit.pbr("house_plain", "painted_plaster_wall", 2.5, palette=WALLS, grime=0.5, bump=0.1, res="1k", obj=False),
        "roof": kit.pbr("house_roof", "concrete_floor_worn_001", 3.0, palette=ROOFS, grime=0.9, bump=0.2, res="1k", obj=False),
        "signs": kit.palette_flat("signboards", SIGNS, rough=0.4),
        "grille": kit.flat("ms_grille", 0x1c1e21, rough=0.45, metal=0.5),
        "glass": kit.glass("window_glass", 0xd6e2e6, rough=0.01),
        "metal": kit.flat("sheet_metal", 0xd8dadc, rough=0.3, metal=0.8),
        "dark": kit.flat("gate_dark", 0x23262a, rough=0.5, metal=0.4),
        # interlocking pavers on the footpaths, with dirty, worn stretches
        "foot": kit.terrain("footpath", [("interlocking_concrete_pavers", 1.4), ("dirty_concrete", 3.0)], [(9.0, 0.62, 0.05)], bump=0.6),
        "paved": kit.terrain("yard_paved", [("patterned_concrete_pavers", 2.0), ("dirty_concrete", 3.0)], [(14.0, 0.6, 0.06)], bump=0.5),
        "soil": kit.terrain("red_soil", [("red_laterite_soil_stones", 3.0), ("red_dirt_mud_01", 3.5)], [(12.0, 0.5, 0.08)], bump=0.9),
        # lawns: lush grass with thin, sparse patches and bare red-earth spots, as Bengaluru lawns really look
        "grass": kit.terrain("grass", [("leafy_grass", 2.5), ("sparse_grass", 3.0), ("red_laterite_soil_stones", 3.0)],
                             [(22.0, 0.63, 0.06), (11.0, 0.82, 0.03)], bump=0.9, tint=0x6a9a3a, tint_mix=0.6),
        "path": kit.terrain("walk_path", [("red_brick_pavers", 1.6), ("worn_patterned_pavers", 2.0)], [(10.0, 0.6, 0.05)], bump=0.6),
        "concrete": kit.pbr("viaduct_concrete", "brushed_concrete", 4.0, tint=0xc9c6be, grime=0.6, bump=0.2, res="1k"),
        "poles": kit.flat("pole_concrete", 0x9c9a94, rough=0.85),
        "wires": kit.flat("wire", 0x111111, rough=0.6),
        "white": kit.flat("white_paint", 0xf1f0ec, rough=0.6),
    }


# ---------------------------------------------------------------- one house


def house(K, r, x0, x1, y0, y1, floors, street, shop=False, apartment=False):
    """A plot-filling house. street: which side faces the road ('S', 'N', 'E', 'W')."""
    rnd = r.random()
    H = building.PLINTH + 3.0 * floors - 0.15
    (K.shops if shop else K.walls).add(x0, y0, 0.0, x1, y1, H, rnd)
    K.roof.add(x0, y0, H, x1, y1, H + 0.12, r.random())
    t = 0.12
    for a in ((x0, y0, x0 + t, y1), (x1 - t, y0, x1, y1), (x0, y0, x1, y0 + t), (x0, y1 - t, x1, y1)):
        K.plain.add(a[0], a[1], H + 0.12, a[2], a[3], H + 1.0, rnd)  # parapet
    # chajjas over each floor's windows, and a front balcony on most houses
    out = {"S": (0, -1), "N": (0, 1), "E": (1, 0), "W": (-1, 0)}[street]
    for f in range(floors):
        zc = building.PLINTH + 3.0 * f + 2.2
        if out[1]:
            yy = y0 if out[1] < 0 else y1
            K.plain.add(x0 - 0.15, yy, zc, x1 + 0.15, yy + out[1] * 0.5, zc + 0.1, rnd)
        else:
            xx = x0 if out[0] < 0 else x1
            K.plain.add(xx, y0 - 0.15, zc, xx + out[0] * 0.5, y1 + 0.15, zc + 0.1, rnd)
    if floors >= 2 and (apartment or r.random() < 0.6):
        frac = 0.45 + r.random() * 0.4 if not apartment else 0.9
        for f in range(1, floors):
            z = building.PLINTH + 3.0 * f
            ms = r.random() < 0.6
            if out[1]:
                yy = y0 if out[1] < 0 else y1
                w = (x1 - x0) * frac
                bx0 = x0 + (x1 - x0 - w) * r.random()
                K.plain.add(bx0, yy, z - 0.15, bx0 + w, yy + out[1] * 1.1, z, rnd)
                if ms:
                    for k in range(int(w / 0.12)):
                        xx = bx0 + 0.06 + k * 0.12
                        K.grille.add(xx - 0.01, yy + out[1] * 1.05, z, xx + 0.01, yy + out[1] * 1.08, z + 1.0)
                    K.grille.add(bx0, yy + out[1] * 1.03, z + 0.98, bx0 + w, yy + out[1] * 1.1, z + 1.04)
                else:
                    K.plain.add(bx0, yy + out[1] * 0.98, z, bx0 + w, yy + out[1] * 1.1, z + 1.0, rnd)
            else:
                xx = x0 if out[0] < 0 else x1
                w = (y1 - y0) * frac
                by0 = y0 + (y1 - y0 - w) * r.random()
                K.plain.add(xx, by0, z - 0.15, xx + out[0] * 1.1, by0 + w, z, rnd)
                K.plain.add(xx + out[0] * 0.98, by0, z, xx + out[0] * 1.1, by0 + w, z + 1.0, rnd)
    # staircase headroom in a corner, with tanks on top
    hx = x0 + 0.2 if r.random() < 0.5 else x1 - 3.2
    hy = y0 + 0.2 if r.random() < 0.5 else y1 - 3.6
    K.plain.add(hx, hy, H + 0.12, hx + 3.0, hy + 3.4, H + 2.8, rnd)
    K.roof.add(hx - 0.1, hy - 0.1, H + 2.8, hx + 3.1, hy + 3.5, H + 2.92, r.random())
    roof_props(K, r, x0, x1, y0, y1, H + 0.12, (hx, hy), shop)
    if shop:  # signboard over the shutters
        zs = building.PLINTH + 2.75
        if out[1]:
            yy = y0 if out[1] < 0 else y1
            K.signs.add(x0 + 0.3, yy + out[1] * 0.05, zs, x1 - 0.3, yy + out[1] * 0.2, zs + 0.85, r.random())
        else:
            xx = x0 if out[0] < 0 else x1
            K.signs.add(xx + out[0] * 0.05, y0 + 0.3, zs, xx + out[0] * 0.2, y1 - 0.3, zs + 0.85, r.random())


def roof_props(K, r, x0, x1, y0, y1, z, head, shop):
    hx, hy = head
    n = r.choice((1, 1, 2, 2, 3))
    for i in range(n):  # tanks: on the headroom, or on a little stand on the roof
        if i == 0 or r.random() < 0.5:
            K.tanks.append((hx + 0.8 + i * 1.3, hy + 1.2 + r.random() * 1.2, z + 2.8, 0, 1, 1, 1, r.choice((0, 0, 0, 1, 2, 3))))
        else:
            K.tanks.append((x0 + 1 + r.random() * (x1 - x0 - 2), y0 + 1 + r.random() * (y1 - y0 - 2), z, 0, 1, 1, 1, r.choice((0, 1))))
    w, d = x1 - x0, y1 - y0
    free = lambda: (x0 + 1.2 + r.random() * max(0.1, w - 2.4), y0 + 1.2 + r.random() * max(0.1, d - 2.4))
    if r.random() < 0.3:
        x, y = free()
        K.solar.append((x, y, z, 0, 1, 1, 1))
    if r.random() < 0.45:
        K.dish.append((x1 - 0.5, y0 + 0.6 + r.random() * (d - 1.2), z + 0.9, r.random() * 6.3, 1, 1, 1))
    if r.random() < 0.28 and w > 5 and d > 5:  # clothes lines across the roof
        x, y = free()
        K.lines.append((x0 + w / 2, y, z, 0 if r.random() < 0.5 else math.pi / 2, min(w, d) * 0.7 / 4.0, 1, 1, r.randrange(3)))
    if r.random() < 0.22:
        for _ in range(r.randrange(3, 9)):  # pots along the parapet
            side = r.random()
            x = x0 + 0.4 + r.random() * (w - 0.8)
            y = y0 + 0.4 if side < 0.5 else y1 - 0.4
            K.pots.append((x, y, z, r.random() * 6.3, 0.6 + r.random() * 0.4, 0.6 + r.random() * 0.4, 0.6 + r.random() * 0.4, r.randrange(3)))
    if r.random() < 0.16 and not shop:  # a cement-sheet canopy over part of the roof
        sw, sd = min(w - 1, 3 + r.random() * 5), min(d - 1, 3 + r.random() * 4)
        x, y = x0 + 0.5 + r.random() * max(0.0, w - sw - 1), y0 + 0.5 + r.random() * max(0.0, d - sd - 1)
        K.sheets.append((x + sw / 2, y + sd / 2, z, 0, sw, sd, 1))


# ---------------------------------------------------------------- layouts


def residential(K, r, bx0, bx1, by0, by1, near_main):
    """Footpaths, an internal lane, then two back-to-back rows of plots on each strip."""
    K.foot.add(bx0, by0, 0.0, bx1, by1, 0.15)
    x0, x1, y0, y1 = bx0 + 2.0, bx1 - 2.0, by0 + 2.0, by1 - 2.0
    strips = [(y0, y1)]
    if y1 - y0 > 60:
        mid = (y0 + y1) / 2
        strips = [(y0, mid - 4.0), (mid + 4.0, y1)]
        K.foot.add(x0, mid - 4.0, 0.0, x1, mid + 4.0, 0.02)  # the lane: worn concrete over the block's paving
        poles_along(K, r, x0, x1, mid - 3.6, "x")
    for sy0, sy1 in strips:
        half = (sy0 + sy1) / 2
        for row, (ry0, ry1, street) in enumerate(((sy0, half, "S"), (half, sy1, "N"))):
            x = x0
            while x < x1 - 6:
                pw = r.choice((9.1, 9.1, 12.2, 12.2, 12.2, 15.2))
                if x + pw > x1:
                    pw = x1 - x
                kind = r.random()
                px0, px1 = x, x + pw
                if kind < 0.07:  # empty plot of red soil, sometimes a sapling
                    K.soil.add(px0, ry0, 0.15, px1, ry1, 0.2)
                    if r.random() < 0.5:
                        K.shrubs.append((px0 + pw / 2, (ry0 + ry1) / 2, 0.2, r.random() * 6.3, 1, 1, 1, r.randrange(3)))
                    x += pw
                    continue
                apartment = kind > 0.93 and x + pw * 2.4 < x1
                if apartment:
                    px1 = x + pw * 2.4
                    floors = 5
                else:
                    floors = r.choices((1, 2, 3, 4, 5), (10, 30, 30, 20, 8 if near_main else 4))[0]
                front = 1.8 + r.random() * 1.5
                hx0, hx1 = px0 + 0.6, px1 - 0.6
                hy0, hy1 = (ry0 + front, ry1 - 0.8) if street == "S" else (ry0 + 0.8, ry1 - front)
                (K.paved if r.random() < 0.7 else K.grass).add(px0, ry0, 0.15, px1, ry1, 0.18)
                house(K, r, hx0, hx1, hy0, hy1, floors, street, apartment=apartment)
                compound(K, r, px0, px1, ry0, ry1, street)
                if r.random() < 0.35:  # a coconut palm or a tree in the front yard
                    yy = ry0 + front / 2 if street == "S" else ry1 - front / 2
                    (K.palms if r.random() < 0.6 else K.shrubs).append((px0 + 1.2 + r.random() * (pw - 2.4), yy, 0.18, r.random() * 6.3, 1, 1, 1, r.randrange(3)))
                if r.random() < 0.3:  # a car parked at the gate
                    yy = ry0 - 1.6 if street == "S" else ry1 + 1.6
                    K.cars.append((px0 + pw / 2, yy, 0.0, 0 if r.random() < 0.5 else math.pi, 1, 1, 1, r.randrange(5)))
                x = px1


def compound(K, r, x0, x1, y0, y1, street):
    rnd = r.random()
    h = 1.3 + r.random() * 0.4
    gate0 = x0 + 1.0 + r.random() * max(0.1, (x1 - x0) - 5.0)
    for side in ("S", "N"):
        yy = y0 if side == "S" else y1 - 0.15
        if side == street:
            K.plain.add(x0, yy, 0.15, gate0, yy + 0.15, h, rnd)
            K.plain.add(gate0 + 3.2, yy, 0.15, x1, yy + 0.15, h, rnd)
            K.dark.add(gate0, yy + 0.03, 0.15, gate0 + 3.2, yy + 0.09, h - 0.1)
        else:
            K.plain.add(x0, yy, 0.15, x1, yy + 0.15, h, rnd)
    K.plain.add(x0, y0, 0.15, x0 + 0.15, y1, h, rnd)
    K.plain.add(x1 - 0.15, y0, 0.15, x1, y1, h, rnd)


def poles_along(K, r, a, b, at, axis):
    """Concrete poles every ~32 m with three sagging wires: Bengaluru's overhead tangle."""
    xs = [a + 3 + i * 32.0 for i in range(int((b - a - 6) / 32.0) + 1)]
    for x in xs:
        px, py = (x, at) if axis == "x" else (at, x)
        K.poles.add(px - 0.12, py - 0.12, 0.0, px + 0.12, py + 0.12, 8.5)
        K.poles.add(px - 0.6, py - 0.05, 7.9, px + 0.6, py + 0.05, 8.0)
    for xa, xb in zip(xs, xs[1:]):
        for k, off in enumerate((-0.5, 0.0, 0.5)):
            seg = 8
            for s in range(seg):
                ua, ub = s / seg, (s + 1) / seg
                za = 7.95 - 0.9 * 4 * ua * (1 - ua) - k * 0.05
                zb = 7.95 - 0.9 * 4 * ub * (1 - ub) - k * 0.05
                pa, pb = xa + (xb - xa) * ua, xa + (xb - xa) * ub
                z0, z1 = min(za, zb) - 0.012, max(za, zb) + 0.012
                if axis == "x":
                    K.wires.add(pa, at + off - 0.012, z0, pb, at + off + 0.012, z1)
                else:
                    K.wires.add(at + off - 0.012, pa, z0, at + off + 0.012, pb, z1)


def commercial(K, r, bx0, bx1, by0, by1):
    """Shops along the main road: G+1..G+3, rolling shutters, signboards; houses behind."""
    K.foot.add(bx0, by0, 0.0, bx1, by1, 0.15)
    facing_south = by0 > MAIN_Y
    depth = 16.0
    sy0, sy1 = (by0 + 3.0, by0 + 3.0 + depth) if facing_south else (by1 - 3.0 - depth, by1 - 3.0)
    x = bx0 + 2.0
    while x < bx1 - 8:
        w = r.choice((6.0, 8.0, 9.1, 12.2))
        w = min(w, bx1 - 2.0 - x)
        house(K, r, x + 0.2, x + w - 0.2, sy0, sy1, r.choice((2, 2, 3, 3, 4)), "S" if facing_south else "N", shop=True)
        x += w
    rest = (by0 + 3.0 + depth + 4.0, by1) if facing_south else (by0, by1 - 3.0 - depth - 4.0)
    if rest[1] - rest[0] > 20:
        residential(K, r, bx0, bx1, rest[0], rest[1], True)


def villas(K, r, bx0, bx1, by0, by1):
    """A gated villa layout: G+1 villas with clay-tile roofs and lawns."""
    K.grass.add(bx0, by0, 0.0, bx1, by1, 0.16)
    roofs = []
    for gx in range(4):
        for gy in range(3):
            cx = bx0 + 14 + gx * ((bx1 - bx0 - 28) / 3)
            cy = by0 + 16 + gy * ((by1 - by0 - 32) / 2)
            w, d = 13 + r.random() * 3, 11 + r.random() * 2
            rnd = r.random()
            K.walls.add(cx - w / 2, cy - d / 2, 0.16, cx + w / 2, cy + d / 2, 6.4, rnd)
            roofs.append((cx, cy, w + 1.2, d + 1.2, rnd))
            K.paved.add(cx - 2, cy - d / 2 - 6, 0.16, cx + 2, cy - d / 2, 0.19)
            if r.random() < 0.3:
                K.white.add(cx + w / 2 + 1, cy - 3, 0.16, cx + w / 2 + 6, cy + 3, 0.2)
            K.palms.append((cx - w / 2 - 2, cy - d / 2 - 2, 0.16, r.random() * 6.3, 1.1, 1.1, 1.1, r.randrange(3)))
    return roofs


def lake(K, r, collection, mats):
    """The lake: water, a grassy shore, a walking path, trees all round."""
    cx, cy, rx, ry = LAKE
    pts = []
    n = 96
    for i in range(n):
        a = i / n * math.tau
        wob = 1 + 0.06 * math.sin(a * 3 + 0.7) + 0.04 * math.sin(a * 7 + 2.0)
        pts.append((cx + math.cos(a) * rx * wob, cy + math.sin(a) * ry * wob))
    water = kit.water("lake_water")
    verts = [(x, y, 0.1) for x, y in pts] + [(cx, cy, 0.1)]  # just above the shore grass
    faces = [(i, (i + 1) % n, n) for i in range(n)]
    kit.mesh_obj("lake", verts, faces, water, collection)
    # the walking path: a continuous 4 m ring a few metres back from the water
    ring_v, ring_f = [], []
    for i in range(n):
        a = i / n * math.tau
        x, y = pts[i]
        for off in (7.0, 11.0):
            ring_v.append((x + math.cos(a) * off, y + math.sin(a) * off * ry / rx, 0.12))
    for i in range(n):
        j = (i + 1) % n
        ring_f.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    kit.mesh_obj("lake_path", ring_v, ring_f, mats["path"], collection)
    for i in range(n):  # rows of big trees round the lake
        a = i / n * math.tau
        x, y = pts[i]
        ox, oy = math.cos(a) * 9, math.sin(a) * 9 * ry / rx
        for k in (1.7, 2.6, 3.6):  # rows of big trees round the lake
            if r.random() < 0.8:
                s = 1.0 + r.random() * 0.5
                K.trees.append((x + ox * k + (r.random() - 0.5) * 4, y + oy * k + (r.random() - 0.5) * 4, 0.1, r.random() * 6.3, s, s, s, r.randrange(2)))
    K.grass.add(-DETAIL, -345 + 6, -0.02, DETAIL, -40 - 6, 0.08)
    tufts(K, r, -260, -78, 260, -46.5, 0.08, 1.6)  # the shore below the block, where the camera flies over


def tufts(K, r, x0, y0, x1, y1, z, per_m2):
    """Grass clumps scattered over a lawn: real blades with real shadows, denser in some places than others."""
    n = int((x1 - x0) * (y1 - y0) * per_m2)
    for _ in range(n):
        x, y = x0 + r.random() * (x1 - x0), y0 + r.random() * (y1 - y0)
        if math.sin(x * 0.11) * math.cos(y * 0.13) > 0.55 and r.random() < 0.6:
            continue  # thin patches, matching the lawn texture's sparse stretches
        s = 0.6 + r.random() * 0.9
        K.tufts.append((x, y, z, r.random() * 6.3, s, s, s * (0.8 + r.random() * 0.5), r.randrange(2)))


def road_markings(c, r):
    """What Bengaluru roads carry: lane dashes and edge lines on the main road, a yellow-and-black median kerb,
    zebra crossings at the junctions, painted speed breakers by the gate, a centre line on the lake road, manholes."""
    white, yellow, black, iron = Boxes(), Boxes(), Boxes(), Boxes()
    z = 0.006
    span = 700
    for y in (MAIN_Y - 11.5, MAIN_Y - 8.0, MAIN_Y - 4.5, MAIN_Y + 4.5, MAIN_Y + 8.0, MAIN_Y + 11.5):
        x = -span
        while x < span:
            white.add(x, y - 0.075, 0, x + 3.0, y + 0.075, z)
            x += 7.5
    for y in (MAIN_Y - 14.4, MAIN_Y + 14.4):
        white.add(-span, y - 0.08, 0, span, y + 0.08, z)
    x = -span
    while x < span:  # median kerb, painted yellow and black in turns
        (yellow if int((x + span) // 1.0) % 2 == 0 else black).add(x, MAIN_Y - 1.0, 0, x + 1.0, MAIN_Y + 1.0, 0.25)
        x += 1.0
    for jx in (-95.0, 0.0, 95.0, 200.0, -200.0):  # zebra crossings either side of each junction
        for side in (-1, 1):
            cx = jx + side * 9.0
            for k in range(-13, 14):
                yy = MAIN_Y + k * 1.05
                if abs(yy - MAIN_Y) < 1.2:
                    continue
                white.add(cx - 1.5, yy - 0.25, 0, cx + 1.5, yy + 0.25, z)
    for cx in (-95.0, 95.0, 25.0):
        for k in range(-5, 6):
            white.add(cx - 1.5, -40 + k * 1.05 - 0.25, 0, cx + 1.5, -40 + k * 1.05 + 0.25, z)
    x = -span
    while x < span:  # lake road centre line
        white.add(x, -40.08, 0, x + 2.5, -39.92, z)
        x += 6.0
    for bx in (12.0, 42.0):  # speed breakers either side of the gate, striped yellow and black
        for k in range(12):
            y0 = -46.0 + k * 1.0
            (yellow if k % 2 == 0 else black).add(bx - 0.5, y0, 0, bx + 0.5, y0 + 1.0, 0.09)
    for _ in range(160):  # manhole covers along the residential roads
        if r.random() < 0.5:
            x = r.uniform(-span, span)
            y = r.choice([yy for yy, w in ROADS_Y if w < 20]) + r.uniform(-3, 3)
        else:
            x = r.choice([xx for xx, w in ROADS_X]) + r.uniform(-3, 3)
            y = r.uniform(-span, span)
        iron.add(x - 0.35, y - 0.35, 0, x + 0.35, y + 0.35, 0.012)
    paint = kit.pbr("road_paint", "painted_plaster_wall", 1.5, tint=0xf2f0e8, grime=0.6, bump=0.05, res="1k")
    white.build("road_lines", paint, c)
    yellow.build("kerb_yellow", kit.pbr("kerb_yellow", "painted_plaster_wall", 1.5, tint=0xf0c419, grime=0.7, bump=0.1, res="1k"), c)
    black.build("kerb_black", kit.flat("kerb_black", 0x1c1c1c, rough=0.7), c)
    iron.build("manholes", kit.flat("cast_iron", 0x2b2a28, rough=0.55, metal=0.6), c)


def community(K, r):
    """Our gated community: the hero block's compound, a clubhouse and pool, lawns, palms, the gate."""
    x0, x1, y0, y1 = -89.0, 89.0, -34.0, 134.0
    K.paved.add(x0, y0, 0.0, x1, y1, 0.12)
    for lx0, ly0, lx1, ly1 in ((-84, -30, -26, -14), (26, -30, 84, -14), (-84, 14, -26, 62), (26, 14, 84, 62),
                               (-84, 94, -72, 130), (72, 94, 84, 130), (-22, 64, 22, 92)):
        K.grass.add(lx0, ly0, 0.12, lx1, ly1, 0.18)
        tufts(K, r, lx0, ly0, lx1, ly1, 0.18, 2.5)
        for i in range(max(2, int((lx1 - lx0) / 10))):
            K.palms.append((lx0 + 3 + i * (lx1 - lx0 - 6) / max(1, int((lx1 - lx0) / 10) - 1), ly0 + 2.0, 0.18, r.random() * 6.3, 1.05, 1.05, 1.05, r.randrange(3)))
        for _ in range(int((lx1 - lx0) * (ly1 - ly0) / 260)):
            s = 0.6 + r.random() * 0.4
            K.trees.append((lx0 + 4 + r.random() * (lx1 - lx0 - 8), ly0 + 5 + r.random() * (ly1 - ly0 - 8), 0.18, r.random() * 6.3, s, s, s, r.randrange(2)))
        for _ in range(int((lx1 - lx0) / 3)):
            K.shrubs.append((lx0 + 1 + r.random() * (lx1 - lx0 - 2), ly1 - 1.2, 0.18, r.random() * 6.3, 1.2, 1.2, 1.2, r.randrange(3)))
    for i in range(18):  # residents' cars along the driveway
        K.cars.append((-60 + i * 7.0, -12.0 if i % 2 else 66.0, 0.12, 0.0, 1, 1, 1, r.randrange(5)))
    # compound wall with the gate on the lake road
    for a in ((x0, y0, x1, y0 + 0.2), (x0, y1 - 0.2, x1, y1), (x0, y0, x0 + 0.2, y1), (x1 - 0.2, y0, x1, y1)):
        if a[1] == y0 and a[3] == y0 + 0.2:
            K.plain.add(x0, y0, 0.0, 20.0, y0 + 0.2, 2.0, 0.37)
            K.plain.add(30.0, y0, 0.0, x1, y0 + 0.2, 2.0, 0.37)
            K.dark.add(20.0, y0 + 0.05, 0.0, 30.0, y0 + 0.15, 1.9)
        else:
            K.plain.add(a[0], a[1], 0.0, a[2], a[3], 2.0, 0.37)
    K.walls.add(31.0, y0 + 1.0, 0.12, 34.0, y0 + 4.0, 2.8, 0.37)  # security cabin
    K.roof.add(30.6, y0 + 0.6, 2.8, 34.4, y0 + 4.4, 2.92, 0.2)
    # clubhouse and pool
    K.walls.add(-12.0, 46.0, 0.12, 12.0, 60.0, 7.0, 0.62)
    K.roof.add(-12.3, 45.7, 7.0, 12.3, 60.3, 7.15, 0.3)
    K.white.add(-11.0, 25.0, 0.12, 11.0, 37.0, 0.2)


def school(K, r, bx0, bx1, by0, by1):
    K.foot.add(bx0, by0, 0.0, bx1, by1, 0.15)
    K.soil.add(bx0 + 4, by0 + 4, 0.15, bx1 - 40, by1 - 4, 0.2)  # the red-earth playground
    rnd = 0.81
    K.walls.add(bx1 - 36, by0 + 6, 0.15, bx1 - 6, by1 - 6, 12.6, rnd)
    K.roof.add(bx1 - 36, by0 + 6, 12.6, bx1 - 6, by1 - 6, 12.75, 0.4)
    K.walls.add(bx0 + 6, by1 - 20, 0.15, bx1 - 36, by1 - 6, 9.6, rnd)
    K.roof.add(bx0 + 6, by1 - 20, 9.6, bx1 - 36, by1 - 6, 9.75, 0.5)
    for i in range(8):
        K.trees.append((bx0 + 8 + i * 8, by0 + 6, 0.2, r.random() * 6.3, 0.9, 0.9, 0.9, r.randrange(2)))


def hospital(K, r, bx0, bx1, by0, by1):
    K.foot.add(bx0, by0, 0.0, bx1, by1, 0.15)
    K.paved.add(bx0 + 2, by0 + 2, 0.15, bx1 - 2, by1 - 2, 0.18)
    K.walls.add(bx0 + 15, by0 + 20, 0.18, bx1 - 15, by1 - 18, 21.6, 0.33)
    K.roof.add(bx0 + 15, by0 + 20, 21.6, bx1 - 15, by1 - 18, 21.75, 0.1)
    cx, cy = (bx0 + bx1) / 2, by0 + 20  # a red cross sign on the roof edge, facing the road
    K.white.add(cx - 3, cy - 0.3, 21.75, cx + 3, cy, 25.0)
    K.signs.add(cx - 0.4, cy - 0.35, 22.0, cx + 0.4, cy - 0.3, 24.8, 0.0)
    K.signs.add(cx - 1.4, cy - 0.35, 23.0, cx + 1.4, cy - 0.3, 23.8, 0.0)


def park(K, r, bx0, bx1, by0, by1):
    K.grass.add(bx0, by0, 0.0, bx1, by1, 0.16)
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    rx, ry = (bx1 - bx0) / 2 - 6, (by1 - by0) / 2 - 6
    for i in range(64):  # a walking track loop
        a = i / 64 * math.tau
        x, y = cx + math.cos(a) * rx, cy + math.sin(a) * ry
        K.path.add(x - 1.8, y - 1.8, 0.16, x + 1.8, y + 1.8, 0.2)
        if i % 3 == 0:
            K.trees.append((cx + math.cos(a) * (rx + 4), cy + math.sin(a) * (ry + 4), 0.16, r.random() * 6.3, 1, 1, 1, r.randrange(2)))
    for _ in range(14):
        K.trees.append((cx + (r.random() - 0.5) * rx, cy + (r.random() - 0.5) * ry, 0.16, r.random() * 6.3, 1, 1, 1, r.randrange(2)))


def supermarket(K, r, bx0, bx1, by0, by1):
    """A big single-storey store on the main road with its car park (a made-up name, never a real chain)."""
    K.foot.add(bx0, by0, 0.0, bx1, by1, 0.15)
    x0, x1, y0, y1 = bx0 + 10, bx0 + 60, by0 + 34, by0 + 66
    K.walls.add(x0, y0, 0.15, x1, y1, 7.5, 0.15)
    K.roof.add(x0, y0, 7.5, x1, y1, 7.65, 0.2)
    K.glass.add(x0 + 4, y0 - 0.1, 0.15, x1 - 4, y0 + 0.05, 3.4)
    K.metal.add(x0 - 1, y0 - 2.6, 3.4, x1 + 1, y0, 3.6)  # entrance canopy
    K.paved.add(bx0 + 4, by0 + 4, 0.15, bx1 - 4, y0 - 3, 0.18)
    for i in range(16):
        for j in range(2):
            if r.random() < 0.7:
                K.cars.append((bx0 + 8 + i * 4.8, by0 + 10 + j * 10, 0.18, math.pi / 2, 1, 1, 1, r.randrange(4)))
    return (x0, x1, y0)


def metro(K, collection, mats):
    """An elevated metro line down the main road's median, a station, and a purple train."""
    z = 12.0
    for x in range(-FAR, FAR + 1, 30):
        K.concrete.add(x - 0.9, MAIN_Y - 0.9, 0.0, x + 0.9, MAIN_Y + 0.9, z - 1.4)
        K.concrete.add(x - 1.0, MAIN_Y - 4.6, z - 1.4, x + 1.0, MAIN_Y + 4.6, z - 0.2)
    K.concrete.add(-FAR, MAIN_Y - 4.8, z - 0.2, FAR, MAIN_Y + 4.8, z + 1.6)
    K.concrete.add(-FAR, MAIN_Y - 4.8, z + 1.6, FAR, MAIN_Y - 4.5, z + 2.6)
    K.concrete.add(-FAR, MAIN_Y + 4.5, z + 1.6, FAR, MAIN_Y + 4.8, z + 2.6)
    s0, s1 = STATION_X - 70, STATION_X + 70
    K.concrete.add(s0, MAIN_Y - 11, z - 0.2, s1, MAIN_Y + 11, z + 1.6)
    K.white.add(s0, MAIN_Y - 11, z + 1.6, s1, MAIN_Y - 10.6, z + 3.2)
    K.white.add(s0, MAIN_Y + 10.6, z + 1.6, s1, MAIN_Y + 11, z + 3.2)
    for i in range(14):  # curved roof as gently stepped sheets
        a0 = math.pi * i / 14
        y = MAIN_Y - 11.5 * math.cos(a0)
        zz = z + 8.5 + 3.0 * math.sin(a0)
        K.metal.add(s0 - 2, y - 0.9, zz, s1 + 2, y + 0.9, zz + 0.12)
    for sx in (s0 + 6, s1 - 14):  # stair blocks down to both footpaths
        for side in (-1, 1):
            K.concrete.add(sx, MAIN_Y + side * 22 - 4, 0.0, sx + 8, MAIN_Y + side * 22 + 4, z + 1.6)
    # the train: six cars, purple with a pale band, keyframed through the station during the neighbourhood shot
    tr = Boxes()
    band = Boxes()
    win = Boxes()
    for c in range(6):
        x = c * 21.5
        tr.add(x, -1.45, 0.0, x + 21.0, 1.45, 3.8)
        band.add(x, -1.47, 2.6, x + 21.0, 1.47, 2.9)
        for k in range(8):
            wx = x + 1.2 + k * 2.5
            win.add(wx, -1.48, 1.3, wx + 1.4, 1.48, 2.4)
    lib = kit.coll("lib_train", ph.lib())
    tr.build("train_body", kit.flat("metro_purple", 0x6b2c8f, rough=0.35, metal=0.2, coat=0.6), lib)
    band.build("train_band", kit.flat("metro_band", 0xd9d4e3, rough=0.4), lib)
    win.build("train_windows", kit.flat("metro_glass", 0x1a2128, rough=0.08, metal=0.3), lib)
    t = kit.instance("train", lib, -900, MAIN_Y - 1.6, z + 1.65, collection=collection)
    for f, x in ((700, -1200.0), (1150, 900.0)):
        t.location.x = x
        t.keyframe_insert("location", index=0, frame=f)
    for fc in t.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def far_city(K, r):
    """Beyond the detailed layouts: more of the same city, coarser, out to the haze."""
    step = 110.0
    for gx in range(int(-FAR / step), int(FAR / step)):
        for gy in range(int(-FAR / step), int(FAR / step)):
            bx, by = gx * step, gy * step
            if -DETAIL - step < bx < DETAIL and -DETAIL - step < by < DETAIL:
                continue
            if r.random() < 0.06:  # an apartment complex in the distance (never taller than G+14)
                for i in range(r.randrange(2, 5)):
                    x, y = bx + 10 + i * 24, by + 20 + r.random() * 40
                    h = building.PLINTH + 3.0 * r.randrange(8, 15)
                    K.walls.add(x, y, 0, x + 18, y + 14, h, r.random())
                    K.roof.add(x, y, h, x + 18, y + 14, h + 0.15, r.random())
                continue
            y = by + 6
            while y < by + step - 18:
                x = bx + 6
                d = 9 + r.random() * 6
                while x < bx + step - 12:
                    w = 7 + r.random() * 9
                    h = building.PLINTH + 3.0 * r.choices((1, 2, 3, 4, 5), (10, 30, 30, 20, 10))[0]
                    rnd = r.random()
                    K.walls.add(x, y, 0, x + w, y + d, h, rnd)
                    K.roof.add(x, y, h, x + w, y + d, h + 0.12, r.random())
                    if r.random() < 0.5:
                        K.tanks.append((x + 1 + r.random() * (w - 2), y + 1 + r.random() * (d - 2), h + 0.12, 0, 1, 1, 1, 0))
                    if r.random() < 0.18:
                        K.trees.append((x + w + 1.5, y - 1.5, 0, r.random() * 6.3, 1, 1, 1, r.randrange(2)))
                    x += w + 1.0 + r.random() * 2.0
                y += d + 4.0 + r.random() * 4.0


# ---------------------------------------------------------------- library props


def props(mats):
    """Small procedural props the scatters instance: tanks, solar heaters, dishes, clothes lines, canopies, cars, palms."""
    out = {}
    tank_cols = [kit.flat("sintex_black", 0x15171a, rough=0.55), kit.flat("tank_blue", 0x1f4f8f, rough=0.5),
                 kit.flat("tank_white", 0xe2e2df, rough=0.5)]
    tanks = []
    for i, (rr, hh, mat) in enumerate(((0.62, 1.35, 0), (0.48, 1.05, 0), (0.6, 1.3, 1), (0.55, 1.25, 2))):
        c = kit.coll(f"lib_tank{i}", ph.lib())
        kit.prim("cyl", f"tank{i}", tank_cols[mat], c, r=rr, h=hh, seg=18)
        tanks.append(c)
    out["tanks"] = kit.variants("lib_tanks", tanks)
    c = kit.coll("lib_solar", ph.lib())
    b = Boxes()
    for k in range(3):  # three tilted collector tubes rows on a stand, tank on top
        b.add(-1.0, -0.6 + k * 0.42, 0.25 + k * 0.32, 1.0, -0.2 + k * 0.42, 0.3 + k * 0.32)
    b.build("solar_panel", kit.flat("solar_panel", 0x1b2a44, rough=0.12, metal=0.3, coat=1.0), c)
    t = Boxes()
    t.add(-1.05, 0.55, 1.0, 1.05, 0.95, 1.4)
    t.build("solar_tank", kit.flat("solar_tank", 0xe8e8e6, rough=0.35, metal=0.3), c)
    s = Boxes()
    for x in (-0.95, 0.95):
        s.add(x - 0.03, -0.6, 0.0, x + 0.03, 0.95, 0.06)
        s.add(x - 0.03, 0.75, 0.0, x + 0.03, 0.81, 1.0)
    s.build("solar_stand", mats["metal"], c)
    out["solar"] = c
    c = kit.coll("lib_dish", ph.lib())
    d = kit.prim("sphere", "dish", kit.flat("dish_white", 0xeeeeec, rough=0.4), c, r=0.32, seg=16)
    d.scale = (1, 0.35, 1)
    d.rotation_euler = (0.5, 0, 0)
    d.location = (0, 0, 0.35)
    out["dish"] = c
    lines = []
    clothes = kit.palette_flat("clothes", [0xc23b3b, 0x2f5fa8, 0xf0e6d2, 0xe0a526, 0x3f7d5a, 0xd97aa6, 0x2b2b2f, 0x8fb7d9, 0xf5f5f0, 0x7a4d8f], rough=0.95)
    for v in range(3):
        c = kit.coll(f"lib_line{v}", ph.lib())
        rr = random.Random(500 + v)
        p, cl = Boxes(), Boxes()
        for x in (-2.0, 2.0):
            p.add(x - 0.03, -0.03, 0, x + 0.03, 0.03, 1.8)
        p.add(-2.0, -0.005, 1.78, 2.0, 0.005, 1.79)
        x = -1.85
        while x < 1.7:
            w = 0.25 + rr.random() * 0.55
            cl.add(x, -0.01, 1.78 - 0.3 - rr.random() * 0.6, min(1.9, x + w), 0.01, 1.78, rr.random())
            x += w + 0.05 + rr.random() * 0.25
        p.build("line_poles", mats["metal"], c)
        cl.build("line_clothes", clothes, c)
        lines.append(c)
    out["lines"] = kit.variants("lib_lines", lines)
    c = kit.coll("lib_sheet", ph.lib())
    sh = Boxes()
    sh.add(-0.5, -0.5, 2.3, 0.5, 0.5, 2.33)
    sh.build("sheet", kit.pbr("cement_sheet", "corrugated_iron", 1.2, tint=0xa9aaa5, grime=0.7, bump=0.6, res="1k"), c)
    po = Boxes()
    for x, y in ((-0.48, -0.48), (0.48, -0.48), (-0.48, 0.48), (0.48, 0.48)):
        po.add(x - 0.02, y - 0.02, 0, x + 0.02, y + 0.02, 2.3)
    po.build("sheet_posts", mats["metal"], c)
    out["sheets"] = c
    out["cars"] = cars()
    out["palms"] = palms()
    return out


def cars():
    """Hatchback, sedan, SUV, autorickshaw, a white van: bodies share one paint material (colour per instance)."""
    paint = kit.palette_flat("car_paint", [0xf2f2f2, 0x1d1f22, 0x8d9299, 0xb02a2a, 0xc9ccd1, 0x2d3b4f, 0xe8e2d6, 0x5a5f66], rough=0.25, metal=0.6)
    glass = kit.flat("car_glass", 0x0d1114, rough=0.05, metal=0.2)
    tyre = kit.flat("tyre", 0x101010, rough=0.8)
    auto_y = kit.flat("auto_yellow", 0xf2c12e, rough=0.45)
    auto_g = kit.flat("auto_green", 0x2f7d3b, rough=0.45)
    out = []
    specs = [(3.8, 1.7, 1.5, 0.55), (4.4, 1.75, 1.45, 0.5), (4.6, 1.85, 1.75, 0.6), (2.7, 1.3, 1.75, 0.0), (4.8, 1.9, 2.0, 0.85)]
    for i, (L, W, H, cab) in enumerate(specs):
        c = kit.coll(f"lib_car{i}", ph.lib())
        body, win, wh = Boxes(), Boxes(), Boxes()
        if i == 3:  # autorickshaw: yellow canopy, green body
            g = Boxes()
            g.add(-L / 2, -W / 2, 0.3, L / 2, W / 2, 0.95)
            g.build("auto_body", auto_g, c)
            y = Boxes()
            y.add(-L / 2 + 0.2, -W / 2, 1.55, L / 2 - 0.1, W / 2, 1.75)
            for x in (-L / 2 + 0.25, L / 2 - 0.2):
                y.add(x - 0.04, -W / 2, 0.95, x + 0.04, -W / 2 + 0.08, 1.55)
                y.add(x - 0.04, W / 2 - 0.08, 0.95, x + 0.04, W / 2, 1.55)
            y.build("auto_top", auto_y, c)
        else:
            body.add(-L / 2, -W / 2, 0.3, L / 2, W / 2, 0.3 + H * 0.45)
            cl = L * (0.5 if i != 4 else 0.95)
            body.add(-L / 2 + (L - cl) * cab, -W / 2 + 0.08, 0.3 + H * 0.45, -L / 2 + (L - cl) * cab + cl, W / 2 - 0.08, 0.3 + H * 0.82)
            win.add(-L / 2 + (L - cl) * cab - 0.01, -W / 2 + 0.06, 0.3 + H * 0.5, -L / 2 + (L - cl) * cab + cl + 0.01, W / 2 - 0.06, 0.3 + H * 0.78)
            body.build("car_body", paint, c)
            win.build("car_windows", glass, c)
        for x in ((-L / 2 + 0.7, L / 2 - 0.7) if i != 3 else (-L / 2 + 0.5, L / 2 - 0.4)):
            for y in (-W / 2 + 0.05, W / 2 - 0.25):
                wh.add(x - 0.32, y, 0.0, x + 0.32, y + 0.2, 0.62)
        wh.build("wheels", tyre, c)
        for o in c.objects:
            bev = o.modifiers.new("round", "BEVEL")
            bev.width = 0.08 if o.name.startswith(("car_body", "auto")) else 0.03
            bev.segments = 3
        out.append(c)
    return kit.variants("lib_cars", out)


def palms():
    """Coconut palms: a leaning ringed trunk and a crown of drooping fronds, three shapes."""
    trunk_m = kit.flat("palm_trunk", 0x7a6a58, rough=0.95)
    leaf = kit.leaf("palm_leaf", 0x5f7a2a)
    out = []
    for v in range(3):
        rr = random.Random(900 + v)
        c = kit.coll(f"lib_palm{v}", ph.lib())
        h = 9 + v * 2.5
        lean = (rr.random() - 0.5) * 0.25
        verts, faces = [], []
        seg = 10
        for s in range(seg + 1):  # trunk as a tapered 8-sided tube with a gentle curve
            z = h * s / seg
            ox = lean * z + 0.4 * math.sin(z / h * math.pi) * lean * 4
            rad = 0.2 - 0.06 * s / seg
            for k in range(8):
                a = k / 8 * math.tau
                verts.append((ox + math.cos(a) * rad, math.sin(a) * rad, z))
        for s in range(seg):
            for k in range(8):
                a, b = s * 8 + k, s * 8 + (k + 1) % 8
                faces.append((a, b, b + 8, a + 8))
        kit.mesh_obj("palm_trunk", verts, faces, trunk_m, c, smooth=True)
        top = (lean * h + 0.4 * math.sin(math.pi) * lean * 4, 0.0, h)
        verts, faces = [], []
        fronds = 18
        for f in range(fronds):  # each frond: an arching spine with leaflets hanging in a V either side
            a = f / fronds * math.tau + rr.random() * 0.35
            droop = 0.9 + rr.random() * 0.6
            L = 4.0 + rr.random() * 1.4
            spine = []
            for s in range(9):
                u = s / 8
                d = L * u
                spine.append((top[0] + math.cos(a) * d, top[1] + math.sin(a) * d, top[2] + 1.1 * u - droop * 2.8 * u * u))
            for s in range(1, 9):
                px, py, pz = spine[s]
                w = 0.75 * math.sin(math.pi * s / 9)
                for side in (-1, 1):
                    nx, ny = -math.sin(a) * side, math.cos(a) * side
                    i0 = len(verts)
                    qx, qy, qz = spine[s - 1]
                    verts += [(qx, qy, qz), (px, py, pz), (px + nx * w * 0.7, py + ny * w * 0.7, pz - 0.75 * w), (qx + nx * w * 0.55, qy + ny * w * 0.55, qz - 0.7 * w)]
                    faces.append((i0, i0 + 1, i0 + 2, i0 + 3))
        kit.mesh_obj("palm_fronds", verts, faces, leaf, c)
        out.append(c)
    return kit.variants("lib_palms", out)


# ---------------------------------------------------------------- build


def build(preview=False):
    c = kit.coll("city")
    mats = materials()
    r = random.Random(2026)
    K = Kit()
    ground = Boxes()
    ground.add(-FAR - 400, -FAR - 400, -0.3, FAR + 400, FAR + 400, 0.0)
    # roads: worn asphalt with darker patch repairs and the odd damaged, cracked stretch
    ground.build("asphalt", kit.terrain("asphalt", [("worn_asphalt", 4.0), ("asphalt_03", 5.0), ("road_damaged", 4.0)],
                                        [(28.0, 0.55, 0.05), (15.0, 0.76, 0.03)], bump=0.6), c)
    road_markings(c, random.Random(77))  # its own seed: the houses keep the layout they had
    villa_roofs = []
    market = None
    for bx0, bx1, by0, by1 in blocks():
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        if COMMUNITY[0] < cx < COMMUNITY[1] and COMMUNITY[2] < cy < COMMUNITY[3]:
            continue
        if in_lake(cx, cy, 40) or (-345 < cy < -40):
            continue
        if (cx, cy) == SCHOOL:
            school(K, r, bx0, bx1, by0, by1)
        elif (cx, cy) == HOSPITAL:
            hospital(K, r, bx0, bx1, by0, by1)
        elif (cx, cy) == PARK:
            park(K, r, bx0, bx1, by0, by1)
        elif (cx, cy) == VILLAS:
            villa_roofs = villas(K, r, bx0, bx1, by0, by1)
        elif (cx, cy) == MARKET:
            market = supermarket(K, r, bx0, bx1, by0, by1)
        elif abs(cy - MAIN_Y) < 110:
            commercial(K, r, bx0, bx1, by0, by1)
        else:
            residential(K, r, bx0, bx1, by0, by1, abs(cy - MAIN_Y) < 220)
        if abs(cx) < 400 and abs(cy) < 400:  # street trees along the block edges
            for x in range(int(bx0) + 6, int(bx1) - 4, 14):
                for y in (by0 - 1.5, by1 + 1.5):
                    if r.random() < 0.75:
                        K.trees.append((x + r.random() * 4, y, 0.0, r.random() * 6.3, 0.8 + r.random() * 0.5, 0.8 + r.random() * 0.5, 0.8 + r.random() * 0.5, r.randrange(2)))
            poles_along(K, r, bx0, bx1, by0 - 0.8, "x")
    community(K, r)
    lake(K, r, c, mats)
    metro(K, c, mats)
    far_city(K, r)

    for name in ("walls", "shops", "plain", "roof", "signs", "grille", "glass", "metal", "dark", "foot", "paved", "soil",
                 "grass", "path", "concrete", "poles", "wires", "white"):
        getattr(K, name).build("city_" + name, mats[name], c)
    if villa_roofs:
        clay = kit.pbr("clay_tiles", "clay_roof_tiles", 1.5, bump=0.6, res="1k")
        verts, faces = [], []
        for cx, cy, w, d, _ in villa_roofs:  # hipped roofs
            i = len(verts)
            z0, z1 = 6.4, 9.0
            verts += [(cx - w / 2, cy - d / 2, z0), (cx + w / 2, cy - d / 2, z0), (cx + w / 2, cy + d / 2, z0), (cx - w / 2, cy + d / 2, z0),
                      (cx - w / 4, cy, z1), (cx + w / 4, cy, z1)]
            faces += [(i, i + 1, i + 5, i + 4), (i + 2, i + 3, i + 4, i + 5), (i + 1, i + 2, i + 5), (i + 3, i, i + 4)]
        kit.mesh_obj("villa_roofs", verts, faces, clay, c)

    P = props(mats)
    plants = kit.variants("lib_pots", [ph.model(a)[0] for a in ("potted_plant_01", "potted_plant_02", "potted_plant_04")])
    tree_models = [ph.model(a) for a in ("island_tree_02", "island_tree_01")]
    trees = kit.variants("lib_trees", [m for m, _ in tree_models])
    fit = [13.0 / max(1.0, h) for _, h in tree_models]  # rain trees about 13 m tall, before each one's own scale
    shrubs = kit.variants("lib_shrubs", [ph.model(a)[0] for a in ("shrub_02", "shrub_04", "shrub_01")])
    kit.scatter("roof_tanks", P["tanks"], K.tanks, c)
    kit.scatter("roof_solar", P["solar"], K.solar, c)
    kit.scatter("roof_dishes", P["dish"], K.dish, c)
    kit.scatter("roof_lines", P["lines"], K.lines, c)
    kit.scatter("roof_sheets", P["sheets"], K.sheets, c)
    kit.scatter("roof_pots", plants, K.pots, c)
    kit.scatter("parked_cars", P["cars"], K.cars, c)
    kit.scatter("palms", P["palms"], K.palms, c)
    kit.scatter("trees", trees, [t[:4] + tuple(s * fit[t[7]] for s in t[4:7]) + t[7:] for t in K.trees], c)
    kit.scatter("shrubs", shrubs, K.shrubs, c)
    grass_models = [ph.model(a) for a in ("grass_medium_02", "grass_bermuda_01")]
    gfit = [0.32 / max(0.05, h) for _, h in grass_models]  # clumps about 30 cm tall, before each one's own scale
    kit.scatter("grass_tufts", kit.variants("lib_tufts", [m for m, _ in grass_models]),
                [t[:4] + tuple(s * gfit[t[7]] for s in t[4:7]) + t[7:] for t in K.tufts], c)
    roof_life(c, mats)
    traffic(c, P["cars"])
    pins = {
        "home": (0.0, 0.0, building.ROOF + 6),
        "metro": (STATION_X, MAIN_Y, 22.0),
        "lake": (LAKE[0] - 120, LAKE[1], 2.0),
        "school": (SCHOOL[0] + 30, SCHOOL[1] + 30, 14.0),
        "hospital": (HOSPITAL[0], HOSPITAL[1], 24.0),
        "supermarket": ((market[0] + market[1]) / 2, market[2] + 16, 9.0) if market else (MARKET[0], MARKET[1], 9.0),
    }
    return pins


def roof_life(c, mats):
    """Two terrace gardens and two sit-outs on houses near the block, where the camera passes over them."""
    r = random.Random(31)
    chair, _ = ph.model("plastic_monobloc_chair_01")
    plants = [ph.model(a)[0] for a in ("potted_plant_01", "potted_plant_02", "potted_plant_04")]
    green = Boxes()
    pergola = Boxes()
    for (x, y, z) in ((118.0, -20.0, 9.27), (-125.0, 30.0, 6.27)):  # roofs east and west of the community
        green.add(x - 4, y - 3, z, x + 4, y + 3, z + 0.25)
        for i in range(5):
            pergola.add(x - 4 + i * 2, y - 3, z + 2.4, x - 3.9 + i * 2, y + 3, z + 2.5)
        for px, py in ((x - 4, y - 3), (x + 4, y - 3), (x - 4, y + 3), (x + 4, y + 3)):
            pergola.add(px - 0.06, py - 0.06, z, px + 0.06, py + 0.06, z + 2.5)
        for k in range(12):
            kit.instance(f"garden_pot{x}_{k}", plants[k % 3], x - 5 + r.random() * 10, y - 3.6 + r.random() * 0.3, z, r.random() * 6.3, 0.9, collection=c)
    for (x, y, z) in ((-118.0, -18.0, 12.27), (128.0, 34.0, 6.27)):
        for k in range(3):
            a = k / 3 * math.tau
            kit.instance(f"sitout_chair{x}_{k}", chair, x + math.cos(a) * 1.1, y + math.sin(a) * 1.1, z, a + math.pi / 2, collection=c)
        pergola.add(x - 0.4, y - 0.4, z, x + 0.4, y + 0.4, z + 0.72)
    green.build("terrace_gardens", mats["grass"], c)
    pergola.build("pergolas", kit.pbr("pergola_wood", "american_walnut_veneer", 1.0, bump=0.1, res="1k"), c)


def traffic(c, cars_coll):
    """Cars and autos moving along the main road and the lake road (keyframed, linear)."""
    r = random.Random(88)
    variants = list(cars_coll.children)
    for lane, (y, d) in enumerate(((MAIN_Y - 10.5, 1), (MAIN_Y - 6.5, 1), (MAIN_Y + 6.5, -1), (MAIN_Y + 10.5, -1), (-42.0, 1), (-38.0, -1))):
        for k in range(26 if lane < 4 else 10):
            v = variants[r.choices(range(len(variants)), (3, 3, 2, 3, 1))[0]]
            x = -1100 + r.random() * 2200
            speed = (8 + r.random() * 6) * d
            o = kit.instance(f"traffic{lane}_{k}", v, x, y, 0.0, 0 if d > 0 else math.pi, collection=c)
            for f in (1, 1201):
                o.location.x = x + speed * (f - 1) / 24.0
                o.keyframe_insert("location", index=0, frame=f)
            for fc in o.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
