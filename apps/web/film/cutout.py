"""Cuts the community's three blocks out of the film's first frame, so the hero title can sit behind them.

  blender -b %LOCALAPPDATA%/gharaana-film/film.blend -P apps/web/film/cutout.py

Renders a matte of the blocks (everything else held out), run through the same lens distortion as the film so the
edges line up. encode.py merges it with the graded frame 1 into the transparent WebPs the page uses.
"""
import os

import bpy

FILM = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "gharaana-film")
MATTE = os.path.join(FILM, "matte-0001.png")

sc = bpy.context.scene
sc.frame_set(1)
vl = sc.view_layers[0]


def walk(lc):
    yield lc
    for c in lc.children:
        yield from walk(c)


for lc in walk(vl.layer_collection):  # everything but the blocks becomes a transparent hole
    if lc.name not in ("hero", "Scene Collection") and lc.collection.name != "hero":
        lc.holdout = True
for o in sc.objects:
    if o.name.startswith("wisps"):
        o.animation_data_clear()  # their keyframed visibility would switch them back on
        o.hide_render = True
c = sc.cycles
c.samples, c.use_denoising = 16, False
c.max_bounces = c.diffuse_bounces = c.glossy_bounces = c.transmission_bounces = 1
sc.render.film_transparent = True
# compositor: alpha only, through the film's lens distortion
t = sc.node_tree
t.nodes.clear()
rl = t.nodes.new("CompositorNodeRLayers")
lens = t.nodes.new("CompositorNodeLensdist")
lens.inputs["Dispersion"].default_value = 0.006
lens.inputs["Distortion"].default_value = -0.008
t.links.new(rl.outputs["Alpha"], lens.inputs["Image"])
comp = t.nodes.new("CompositorNodeComposite")
t.links.new(lens.outputs[0], comp.inputs["Image"])
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "BW"
sc.render.filepath = MATTE
bpy.ops.render.render(write_still=True)

print("[film] matte ->", MATTE)
