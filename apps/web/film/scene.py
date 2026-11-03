"""Builds the home-page film's scene in Blender and renders it on the GPU (Cycles + OptiX).

  blender -b --factory-startup -P apps/web/film/scene.py -- [--preview|--draft] [--stills 22,56,105] [--frames 1-1201]

Without --stills or --frames it only builds and saves film.blend. Everything heavy lives in %LOCALAPPDATA%/gharaana-film
(assets cache, the .blend, rendered frames), never in the repo.
"""
import math
import os
import sys

sys.dont_write_bytecode = True  # no __pycache__ under apps/web (Turbopack watches it)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Euler, Matrix, Vector

import building
import city
import interior
import kit
import path
import ph
import world

OUT = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "gharaana-film")


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opt = {"preview": "--preview" in a or "--draft" in a, "draft": "--draft" in a, "stills": None, "frames": None}
    for k in ("--stills", "--frames"):
        if k in a:
            opt[k[2:]] = a[a.index(k) + 1]
    return opt


def look(pos, tgt):
    """Camera rotation looking from pos to tgt; north is 'up' when looking straight down."""
    p, q = Vector(pos), Vector(tgt)
    fwd = (q - p).normalized()
    down = min(max(((p.z - q.z) / ((q - p).length + 1e-6) - 0.85), 0.0), 0.15) / 0.15
    up = Vector((0.0, down, 1.0 - down)).normalized()
    z = -fwd
    x = up.cross(z).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed().to_euler()


def animate(cam, upper):
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, path.FRAMES + 1
    sc["night"] = 0.0
    sc["wisps"] = 1.0
    cam.data.sensor_fit = "VERTICAL"
    cam.data.sensor_height = 24.0
    for f in range(sc.frame_start, sc.frame_end + 1):
        t = path.tick_of(f)
        pos, tgt, fov = path.camera_at(t)
        dist = (Vector(tgt) - Vector(pos)).length
        hp, hr = path.handheld(f, dist)
        cam.location = Vector(pos) + Vector(hp)
        e = look(pos, tgt)
        cam.rotation_euler = Euler((e.x + hr[0], e.y + hr[1], e.z + hr[2]))
        cam.data.lens = 12.0 / math.tan(math.radians(fov) / 2)
        cam.data.clip_start = 0.04 if dist < 20 else 0.3
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)
        cam.data.keyframe_insert("lens", frame=f)
        cam.data.keyframe_insert("clip_start", frame=f)
        upper.location.z = path.pw(path.TABLES["lift"], t) * 34.0
        upper.keyframe_insert("location", index=2, frame=f)
        sc["night"] = path.pw(path.TABLES["night"], t)
        sc.keyframe_insert('["night"]', frame=f)
        sc["wisps"] = path.pw(path.TABLES["wisps"], t)
        sc.keyframe_insert('["wisps"]', frame=f)
    # constant interpolation between per-frame keys: no overshoot
    for ad in (cam.animation_data, cam.data.animation_data, upper.animation_data, sc.animation_data):
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    world.render(preview=OPT["preview"], draft=OPT["draft"])
    world.sky("4k" if OPT["preview"] else "8k")
    world.compositor()
    m, lower, upper, balconies, acs = building.build(sc.collection)
    hero = kit.coll("hero")
    kit.instance("hero_lower", lower, 0, 0, 0, collection=hero)
    up = kit.instance("hero_upper", upper, 0, 0, 0, collection=hero)
    for i, (x, y) in enumerate(((-48.0, 78.0), (48.0, 78.0))):  # the community's two sister blocks
        kit.instance(f"sister{i}_lower", lower, x, y, 0, collection=hero)
        kit.instance(f"sister{i}_upper", upper, x, y, 0, collection=hero)
    building.stilt_floor(m, hero)
    building.dress(m, lower, upper, balconies, acs)
    interior.build(upper)
    pins = city.build(OPT["preview"])
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    animate(cam, up)
    world.wisps(kit.coll("sky"), path.frame_of(22))
    export_pins(cam, pins)
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "film-preview.blend" if OPT["preview"] else "film.blend"))


def export_pins(cam, pins):
    """Where each map pin sits on screen (0..1, top-left origin) for every frame in which the page shows pins."""
    import json
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    t0, t1 = (k for k, v in (path.TABLES["pins"][1], path.TABLES["pins"][-1]))
    f0, f1 = path.frame_of(t0), path.frame_of(t1)
    pts = {k: [] for k in pins}
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        for k, p in pins.items():
            v = world_to_camera_view(sc, cam, Vector(p))
            pts[k].append([round(v.x, 4), round(1 - v.y, 4)])
    out = {"fps": path.FPS, "frames": path.FRAMES + 1, "ticks": path.TOTAL, "pins": {"from": f0, "to": f1, "points": pts}}
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "components", "tour", "film.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    sc.frame_set(1)


def render_stills(ticks):
    sc = bpy.context.scene
    os.makedirs(os.path.join(OUT, "stills"), exist_ok=True)
    for t in ticks:
        sc.frame_set(path.frame_of(t))
        sc.render.filepath = os.path.join(OUT, "stills", f"t{t:g}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[film] still t={t} -> {sc.render.filepath}", flush=True)


OPT = args()
if __name__ == "__main__":
    build()
    if OPT["stills"]:
        render_stills([float(x) for x in OPT["stills"].split(",")])
    if OPT["frames"]:
        # Coarse to fine (every 24th frame, then 8th, 4th, 2nd, all): encode.py holds each frame until the next rendered one, so the
        # film is whole after the first pass and smoother after each. Frames already on disk are skipped, so a stopped render resumes.
        a, b = (int(x) for x in OPT["frames"].split("-"))
        sc = bpy.context.scene
        folder = os.path.join(OUT, "frames-draft" if OPT["draft"] else "frames-1080")  # (frames/ holds an unfinished 4K pass)
        os.makedirs(folder, exist_ok=True)
        done = set(os.listdir(folder))
        for step in (24, 8, 4, 2, 1):
            for f in [*range(a, b + 1, step), b]:
                name = f"f{f:04d}.png"
                if name in done:
                    continue
                sc.frame_set(f)
                sc.render.filepath = os.path.join(folder, name)
                bpy.ops.render.render(write_still=True)
                done.add(name)
                print(f"[film] pass {step}: {name}", flush=True)
