"""The film's one continuous camera move, keyed in the page's ticks (components/tour/config.ts, TOTAL = 125).
Same maths as the old three.js camera (centripetal Catmull-Rom through the keys, eased into and out of holds).
Blender coordinates: x east, y north, z up. Our flat's floor is at z = 27.45 (building.ffl(9)), eye height ~1.55 m.
"""
import math

TOTAL = 125
FPS = 24
SECONDS_PER_TICK = 0.4
FRAMES = round(TOTAL * SECONDS_PER_TICK * FPS)  # 1200


def frame_of(tick):
    return 1 + round(tick * SECONDS_PER_TICK * FPS)


def tick_of(frame):
    return (frame - 1) / (SECONDS_PER_TICK * FPS)


EYE = 29.0
# t, camera position, look-at target, vertical fov (degrees), hold
KEYS = [
    (0, (-150, -260, 210), (0, 0, 30), 38, False),  # high over the city, the block in the middle
    (8, (-128, -232, 182), (0, 0, 29), 38, False),
    (15, (-70, -200, 118), (0, 0, 27), 38, False),  # down through the haze
    (22, (22, -150, 44), (0, 0, 23), 38, True),  # the whole block and its neighbours
    (31, (96, -112, 52), (0, 0, 23), 38, True),
    (38, (40, -56, 38), (0, -9, 27.5), 38, False),  # closer: the balconies
    (44, (8, -26, 31), (0.4, -10, 29), 40, False),  # one balcony
    (48, (1.2, -15.5, 29.3), (0.4, -9, 29.0), 46, False),
    (51, (0.5, -9.7, EYE), (0.1, -6.0, 28.8), 56, False),  # through the open sliding door
    (56, (0.6, -8.3, EYE + 0.05), (-2.3, -5.6, 28.6), 62, True),  # living room: TV wall, shelf, sofa
    (62, (0.4, -5.9, EYE + 0.05), (4.6, -2.6, 28.4), 60, True),  # dining and the kitchen
    (68, (-2.8, -5.05, EYE), (-6.3, -7.0, 28.4), 66, True),  # bedroom 1, from its door
    (73, (-3.75, -2.9, EYE), (-6.5, -3.2, 28.4), 70, True),  # the bathroom, from its door
    (78, (3.7, -5.05, EYE), (6.4, -7.0, 28.4), 66, True),  # bedroom 2, from its door
    (84, (0.4, -5.0, 37.0), (0.4, -4.99, 27.45), 56, False),  # up through the ceiling
    (91, (0.0, -5.0, 47.5), (0.0, -4.99, 27.45), 50, True),  # the same flat, as a plan
    (97, (0.0, -30.0, 160.0), (0.0, -29.9, 10.0), 46, False),
    (105, (0.0, -60.0, 520.0), (0.0, -59.9, 0.0), 42, True),  # the neighbourhood
    (111, (-170, -330, 230), (0, 0, 20), 40, False),
    (119, (-112, -152, 38), (0, 0, 26), 40, True),  # evening, the lights come on
    (125, (-102, -140, 36), (0, 0, 26), 40, False),
]

# piecewise tables in ticks, eased between rows
TABLES = {
    "lift": [(0, 0), (81, 0), (86, 1), (97, 1), (101, 0)],  # floors above ours rise away for the plan view
    "night": [(0, 0), (108, 0), (117, 1)],  # sunset sky and lit windows
    "wisps": [(0, 1), (14, 1), (21, 0)],  # low cloud wisps in the opening shot
    "pins": [(0, 0), (101, 0), (103.5, 1), (108.5, 1), (110.5, 0)],
    "inside": [(0, 0), (49, 0), (51, 1), (82, 1), (84, 0)],  # interior lamps on
}


def pw(table, t):
    if t <= table[0][0]:
        return table[0][1]
    for (t0, v0), (t1, v1) in zip(table, table[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return v0 + (v1 - v0) * k * k * (3 - 2 * k)
    return table[-1][1]


def _crs(points, u):
    """three.js CatmullRomCurve3('centripetal').getPoint(u), not arc-length parametrised."""
    l = len(points)
    p = (l - 1) * u
    i = math.floor(p)
    w = p - i
    if w == 0 and i == l - 1:
        i, w = l - 2, 1.0
    sub = lambda a, b: tuple(x - y for x, y in zip(a, b))
    add = lambda a, b: tuple(x + y for x, y in zip(a, b))
    p0 = points[i - 1] if i > 0 else add(sub(points[0], points[1]), points[0])
    p1, p2 = points[i], points[i + 1]
    p3 = points[i + 2] if i + 2 < l else add(sub(points[l - 1], points[l - 2]), points[l - 1])
    d = lambda a, b: sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.25
    dt0, dt1, dt2 = d(p0, p1), d(p1, p2), d(p2, p3)
    if dt1 < 1e-4:
        dt1 = 1.0
    if dt0 < 1e-4:
        dt0 = dt1
    if dt2 < 1e-4:
        dt2 = dt1
    out = []
    for x0, x1, x2, x3 in zip(p0, p1, p2, p3):
        t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
        t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
        c0, c1, c2, c3 = x1, t1, -3 * x1 + 3 * x2 - 2 * t1 - t2, 2 * x1 - 2 * x2 + t1 + t2
        out.append(c0 + c1 * w + c2 * w * w + c3 * w * w * w)
    return tuple(out)


_P = [k[1] for k in KEYS]
_Q = [k[2] for k in KEYS]


def camera_at(tick):
    """(position, target, fov degrees) at a tick."""
    n = len(KEYS)
    i = 0
    while i < n - 2 and tick >= KEYS[i + 1][0]:
        i += 1
    a, b = KEYS[i], KEYS[i + 1]
    f = min(1.0, max(0.0, (tick - a[0]) / (b[0] - a[0])))
    if a[4] and b[4]:
        f = f * f * (3 - 2 * f)
    elif a[4]:
        f = f * f
    elif b[4]:
        f = 1 - (1 - f) * (1 - f)
    u = (i + f) / (n - 1)
    return _crs(_P, u), _crs(_Q, u), a[3] + (b[3] - a[3]) * f


def handheld(frame, dist):
    """A filmed camera never sits perfectly still: small slow drift, scaled with how far we are from the subject."""
    t = frame / FPS
    amp = min(0.25, 0.01 + dist * 0.0015)
    ang = math.radians(0.12)
    pos = (amp * (math.sin(t * 0.71) * 0.6 + math.sin(t * 1.93 + 1.3) * 0.4),
           amp * (math.sin(t * 0.53 + 2.1) * 0.6 + math.sin(t * 1.61) * 0.4),
           amp * 0.6 * (math.sin(t * 0.87 + 0.4) * 0.7 + math.sin(t * 2.3) * 0.3))
    rot = (ang * math.sin(t * 0.61 + 0.7), ang * 0.5 * math.sin(t * 0.37), ang * math.sin(t * 0.83 + 2.2))
    return pos, rot
