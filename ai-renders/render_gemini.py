# Screenshot -> photoreal with Gemini image editing (Nano Banana), key from GEMINI_API_KEY.
import base64, json, os, sys, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from prompts import PROMPTS  # noqa: E402

HERE = Path(__file__).parent
OUT = HERE / "renders_gemini"; OUT.mkdir(exist_ok=True)
MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

for name in sys.argv[1:] or PROMPTS:
    body = {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "image/png", "data": base64.b64encode((HERE / f"in_{name}.png").read_bytes()).decode()}},
            {"text": PROMPTS[name]},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9"}},
    }
    req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=180))
        parts = res["candidates"][0]["content"]["parts"]
        img = next(p["inlineData"] for p in parts if "inlineData" in p)
        ext = "png" if "png" in img["mimeType"] else "jpg"
        (OUT / f"{name}.{ext}").write_bytes(base64.b64decode(img["data"]))
        print("ok", name, ext, res.get("usageMetadata", {}).get("totalTokenCount"), flush=True)
    except urllib.error.HTTPError as e:
        print("FAIL", name, e.code, e.read().decode()[:500], flush=True)
    except Exception as e:
        print("FAIL", name, repr(e)[:400], flush=True)
