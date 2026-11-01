# Five transition clips with Gemini Omni Flash (Interactions API): each starts on one render and ends on the next.
# Veo 3.1 preview was shut down on the Gemini API on 2026-10-22; Omni Flash is its replacement.
# Usage: python video.py [clip-name ...]   (key from GEMINI_API_KEY; output in videos/)
import base64, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "videos"; OUT.mkdir(exist_ok=True)
MODEL = os.environ.get("VIDEO_MODEL", "gemini-omni-1.1-flash")
API = "https://generativelanguage.googleapis.com/v1beta"
KEY = {"x-goog-api-key": os.environ["GEMINI_API_KEY"]}

SHOT = ("One smooth continuous 8-second cinematic drone shot, no cuts, steady motion, photorealistic, natural light. "
        "Generic city, no text or logos. Audio: soft ambient city sound only, no music, no dialogue.")
CLIPS = {  # name: (first frame, last frame, motion)
    "1-sky-to-tower": ("01-sky", "02-tower", "The drone descends gently through the morning fog; the mist burns off and thins to reveal the sunlit glass residential tower and the city around it under a blue sky."),
    "2-tower-to-inside": ("02-tower", "03-inside", "The camera flies steadily toward the curved glass tower, approaches a window on a high floor and glides through the glass into a bright, sunlit living room."),
    "3-inside-to-plan": ("03-inside", "04-plan", "The camera rises slowly and tilts straight down as the ceiling dissolves away, revealing the whole two-bedroom apartment from directly above like an architectural cutaway."),
    "4-plan-to-hood": ("04-plan", "05-hood", "The camera keeps rising straight up from the apartment; it shrinks into the tower roof as the plaza, streets, park and surrounding blocks come into view from high above."),
    "5-hood-to-evening": ("05-hood", "06-evening", "From the top-down view the camera tilts up and pulls back to a wide skyline view while the daylight warms into a golden-hour sunset glowing on the glass towers."),
}

def img(name):
    return {"type": "image", "data": base64.b64encode((HERE / f"{name}.jpg").read_bytes()).decode(), "mime_type": "image/jpeg"}

def http(url, body=None, raw=False):
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None, {"Content-Type": "application/json", **KEY})
    with urllib.request.urlopen(req, timeout=900) as r:
        return r.read() if raw else json.load(r)

def find_video(node):
    # ponytail: walk the response instead of hard-coding the steps/content path, which is new and may shift
    if isinstance(node, dict):
        if node.get("type") == "video" and ("uri" in node or "data" in node): return node
        node = list(node.values())
    if isinstance(node, list):
        for x in node:
            if (v := find_video(x)): return v

def make(name):
    a, b, motion = CLIPS[name]
    body = {"model": MODEL, "input": [img(a), img(b), {"type": "text", "text": f"{motion} {SHOT}"}],
            "response_format": {"type": "video", "aspect_ratio": "16:9", "resolution": "720p", "delivery": "uri"},
            "background": False, "store": True, "stream": False}  # store=True is required for URI delivery
    for attempt in range(6):
        try:
            res = http(f"{API}/interactions", body); break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:500]
            if e.code in (429, 503) and attempt < 5: time.sleep(45); continue
            return f"FAIL {name} {e.code} {msg}"
    v = find_video(res)
    if not v: return f"FAIL {name} no video in response: {json.dumps(res)[:500]}"
    if "data" in v:
        data = base64.b64decode(v["data"])
    else:
        fid = v["uri"].rstrip("/").split("/files/")[-1].split(":")[0]
        for _ in range(60):
            if http(f"{API}/files/{fid}").get("state") == "ACTIVE": break
            time.sleep(5)
        data = http(f"{API}/files/{fid}:download?alt=media", raw=True)
    (OUT / f"{name}.mp4").write_bytes(data)
    return f"ok {name} {len(data)} bytes"

if __name__ == "__main__":
    with ThreadPoolExecutor(5) as pool:
        for line in pool.map(make, sys.argv[1:] or CLIPS): print(line, flush=True)
