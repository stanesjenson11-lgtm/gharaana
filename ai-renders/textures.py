# Photoreal surfaces for the 3D city, made with Gemini's image model: facades, rooftops and clouds.
# The scene stays one 3D world (so nothing changes between frames); only its surfaces get real-photo detail.
# Usage: python textures.py [name ...]   (default: all; key from GEMINI_API_KEY; ~$0.067 per image, each made once)
# Writes apps/web/public/tex/<name>.jpg (facades, roofs) and public/tex/<name>.png (clouds, alpha from the black background).
import base64, io, json, os, sys, urllib.request, urllib.error
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).parent.parent / "apps" / "web" / "public" / "tex"; OUT.mkdir(parents=True, exist_ok=True)
MODEL = os.environ.get("IMAGE_MODEL", "gemini-3.1-flash-image")
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

FACADE = ("A real photograph used as a seamless tileable texture: a straight-on, perfectly flat orthographic elevation of "
          "a building facade filling the entire frame edge to edge. Exactly 4 floors high and exactly 4 window bays "
          "wide, evenly spaced, the pattern continuing past every edge so it tiles. No sky, no ground, no roof edge, no "
          "perspective or vanishing lines, soft even overcast daylight with no strong shadows, no people, no text. ")
ROOF = ("A real aerial photograph taken from directly above (orthographic, top-down, no perspective) of one flat "
        "rooftop filling the entire frame edge to edge, no street, no parapet edge, no sky. Soft daylight, real "
        "textures and weathering, no people, no text. ")
CLOUD = ("A real photograph of a single isolated cloud against a pure black background, nothing else in the frame, "
         "black margins all around, centred. Sunlit bright white top, soft grey shaded underside, natural soft wispy "
         "edges, photographic detail. ")

SHOTS = {
    "facade0": FACADE + "A mid-rise residential apartment block in an Indian city: off-white painted concrete, every "
               "bay has a window with a small balcony and metal railing; some balconies have potted plants and clothes "
               "drying, split air-conditioner units mounted beside some windows, light rain stains and weathering.",
    "facade1": FACADE + "A modern office building: pale limestone cladding with deep-set dark glass windows in a "
               "regular grid, slim metal frames, a few blinds half drawn.",
    "facade2": FACADE + "A red-brown brick apartment building: rows of white-framed windows, small air-conditioner "
               "units in some windows, a few window boxes with plants, light weathering.",
    "facade3": FACADE + "A beige plastered residential building in an Indian city: recessed windows with concrete sun "
               "shades (chajjas) above each, air-conditioner units, a few plants and a clothes line, light weathering.",
    "roof0": ROOF + "Grey waterproof membrane with seams, several air-conditioning condenser units, a black water tank, "
             "ducting and vents, a small concrete stair and lift room.",
    "roof1": ROOF + "Rows of solar panels on one half; concrete tiles and gravel on the other with potted plants, a "
             "clothes line with drying laundry, two white water tanks and air-conditioner units.",
    "cloud0": CLOUD + "A wide, flat-bottomed fair-weather cumulus cloud.",
    "cloud1": CLOUD + "A tall, puffy, rounded cumulus cloud.",
    "cloud2": CLOUD + "A thin, wispy, stretched stratocumulus cloud.",
}

def save(name, data):
    img = Image.open(io.BytesIO(data)).convert("RGB")
    if name.startswith("cloud"):
        # alpha from brightness against the black background; colour un-premultiplied so edges stay white, not grey
        a = np.asarray(img.resize((768, 432), Image.LANCZOS), np.float32) / 255
        alpha = np.clip((a.max(-1) - 0.05) / 0.55, 0, 1) ** 0.85
        rgb = np.clip(a / np.maximum(alpha[..., None], 1e-3), 0, 1)
        Image.fromarray((np.dstack([rgb, alpha]) * 255).astype(np.uint8), "RGBA").save(OUT / f"{name}.png", optimize=True)
    else:
        img.resize((1024, 1024), Image.LANCZOS).save(OUT / f"{name}.jpg", quality=86)

def make(name):
    aspect = "16:9" if name.startswith("cloud") else "1:1"
    body = {"contents": [{"parts": [{"text": SHOTS[name]}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}}}
    req = urllib.request.Request(URL, json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=240))
    except urllib.error.HTTPError as e:
        print(f"FAIL {name} HTTP {e.code} {e.read().decode()[:300]}", flush=True); return
    parts = res.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    img = next((p["inlineData"] for p in parts if "inlineData" in p), None)
    if not img:
        print(f"FAIL {name} no image: {json.dumps(res)[:300]}", flush=True); return
    save(name, base64.b64decode(img["data"]))
    print(f"ok {name} usage={json.dumps(res.get('usageMetadata', {}))}", flush=True)

if __name__ == "__main__":
    if not os.environ.get("GEMINI_API_KEY"): sys.exit("GEMINI_API_KEY is not set")
    for name in sys.argv[1:] or SHOTS: make(name)  # once each, no automatic retries
