"""Poly Haven (CC0) assets for the film: downloaded once into the cache, then imported or wired into materials."""
import json
import os
import urllib.request

import bpy
from mathutils import Vector

CACHE = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "gharaana-film", "assets")
API = "https://api.polyhaven.com/files/"


def _get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "gharaana-film/1"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path + ".part", "wb") as f:
        f.write(r.read())
    os.replace(path + ".part", path)
    return path


def _files(asset):
    path = os.path.join(CACHE, "_api", asset + ".json")
    _get(API + asset, path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def texture(asset, res="2k"):
    """Downloads a texture set; returns {'diff','rough','nor','disp'} -> local paths (missing maps are skipped)."""
    files = _files(asset)
    out = {}
    for key, name in (("Diffuse", "diff"), ("Rough", "rough"), ("nor_gl", "nor"), ("Displacement", "disp")):
        if key == "Diffuse" and key not in files:  # patterned fabrics ship colour variants instead
            key = next((k for k in ("col_1", "col_01", "col_03") if k in files), key)
        entry = files.get(key, {}).get(res, {})
        entry = entry.get("jpg") or entry.get("png")
        if entry:
            out[name] = _get(entry["url"], os.path.join(CACHE, "tex", asset, os.path.basename(entry["url"])))
    return out


def hdri(asset, res="4k"):
    entry = _files(asset)["hdri"][res]["hdr"]
    return _get(entry["url"], os.path.join(CACHE, "hdri", os.path.basename(entry["url"])))


def tonemapped(asset):
    entry = _files(asset)["tonemapped"]
    return _get(entry["url"], os.path.join(CACHE, "hdri", asset + "_tonemapped.jpg"))


_models = {}


def lib():
    """A collection excluded from the view layer: sources for instancing (instances of it still render)."""
    c = bpy.data.collections.get("_lib")
    if not c:
        c = bpy.data.collections.new("_lib")
        bpy.context.scene.collection.children.link(c)
        bpy.context.view_layer.layer_collection.children[c.name].exclude = True
    return c


def model(asset, res="1k"):
    """Imports a Poly Haven model once into its own collection under _lib; returns (collection, height in metres)."""
    if asset in _models:
        return _models[asset]
    g = _files(asset)["gltf"][res]["gltf"]
    base = os.path.join(CACHE, "models", asset, res)
    gltf = _get(g["url"], os.path.join(base, os.path.basename(g["url"])))
    for rel, inc in g.get("include", {}).items():
        _get(inc["url"], os.path.join(base, rel))
    coll = bpy.data.collections.new("m_" + asset)
    lib().children.link(coll)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=gltf)
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    lo, hi = float("inf"), float("-inf")
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
        if o.type == "MESH":
            for corner in o.bound_box:
                z = (o.matrix_world @ Vector(corner)).z
                lo, hi = min(lo, z), max(hi, z)
    _models[asset] = (coll, max(0.0, hi - lo) if hi > lo else 1.0)
    return _models[asset]
