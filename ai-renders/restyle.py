# Make the recorded 3D tour photoreal while keeping its camera path:
# cut tour-3d.mp4 into <=10 s segments split at camera holds (with a small overlap),
# restyle each with Gemini Omni Flash using the still renders as the look, then crossfade them back together.
# Usage: python restyle.py [segment-name ...]   then   python restyle.py --join
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
VID = HERE / "videos"; SEG = VID / "segments"; SEG.mkdir(parents=True, exist_ok=True)
SRC = VID / "tour-3d.mp4"
API = "https://generativelanguage.googleapis.com"
KEY = {"x-goog-api-key": os.environ["GEMINI_API_KEY"]}
MODEL = os.environ.get("VIDEO_MODEL", "gemini-omni-1.1-flash")
TPS, XF = 3.5, 0.5  # ticks per second used by record.mjs; crossfade length in seconds

# name: (start tick, end tick, reference renders). Cuts sit on camera holds (31, 58, 90) so seams land on calm moments.
SEGMENTS = {
    "a-sky-tower": (0, 31, ["01-sky", "02-tower"]),
    "b-tower-inside": (31, 58, ["02-tower", "03-inside"]),
    "c-inside-plan-hood": (58, 90, ["03-inside", "04-plan", "05-hood"]),
    "d-hood-evening": (90, 110, ["05-hood", "06-evening"]),
}
PROMPT = ("Make this video photorealistic, like real drone and interior footage shot on a cinema camera: real glass, concrete, "
          "wood and fabric, real trees, cars and clouds, natural light. Match the photographic look of {refs}. "
          "Keep the exact same camera motion, speed, timing, framing and composition, and keep every building, room, "
          "piece of furniture and street in the same place. No cuts. Keep everything else the same. "
          "Generic city with no famous landmarks, no text or logos. Audio: soft ambient city sound only, no music, no dialogue.")

def span(name):
    a, b, _ = SEGMENTS[name]
    last = max(v[1] for v in SEGMENTS.values())
    s = max(0.0, a / TPS - XF / 2)
    e = b / TPS + (XF / 2 if b < last else 0.1)
    return s, e - s

def http(url, body=None, headers=None, raw=False, data=None):
    req = urllib.request.Request(url, data if data is not None else (json.dumps(body).encode() if body else None),
                                 {"Content-Type": "application/json", **KEY, **(headers or {})})
    with urllib.request.urlopen(req, timeout=900) as r:
        return r if raw == "resp" else (r.read() if raw else json.load(r))

def upload(path):
    """Files API resumable upload; returns the file resource once it is ACTIVE."""
    blob = path.read_bytes()
    start = http(f"{API}/upload/v1beta/files", {"file": {"display_name": path.name}}, raw="resp", headers={
        "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(len(blob)), "X-Goog-Upload-Header-Content-Type": "video/mp4"})
    up_url = start.headers["X-Goog-Upload-URL"]
    f = http(up_url, data=blob, headers={"Content-Type": "video/mp4", "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0"})["file"]
    while f.get("state") == "PROCESSING":
        time.sleep(3); f = http(f"{API}/v1beta/{f['name']}")
    if f.get("state") != "ACTIVE": raise RuntimeError(f"upload failed: {f}")
    return f

def find_video(node, skip_input=True):
    if isinstance(node, dict):
        if node.get("type") == "video" and ("uri" in node or "data" in node): return node
        node = [v for k, v in node.items() if not (skip_input and k == "input")]
    if isinstance(node, list):
        for x in node:
            if (v := find_video(x, skip_input)): return v

def restyle(name):
    s, d = span(name)
    cut = SEG / f"{name}-3d.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{s:.3f}", "-i", str(SRC), "-t", f"{d:.3f}",
                    "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-an", str(cut)], check=True)
    f = upload(cut)
    refs = SEGMENTS[name][2]
    imgs = [{"type": "image", "mime_type": "image/jpeg", "data": base64.b64encode((HERE / f"{r}.jpg").read_bytes()).decode()} for r in refs]
    text = PROMPT.format(refs=", ".join(f"<IMAGE_REF_{i}>" for i in range(len(refs))))
    body = {"model": MODEL, "input": [{"type": "video", "uri": f["uri"], "mime_type": "video/mp4"}, *imgs, {"type": "text", "text": text}],
            "response_format": {"type": "video", "aspect_ratio": "16:9", "resolution": "720p", "delivery": "uri"},
            "background": False, "store": True, "stream": False}
    for attempt in range(6):
        try:
            res = http(f"{API}/v1beta/interactions", body); break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:600]
            if e.code in (429, 503) and attempt < 5: time.sleep(45); continue
            return f"FAIL {name} {e.code} {msg}"
    v = find_video(res)
    if not v: return f"FAIL {name} no video in response: {json.dumps(res)[:600]}"
    if "data" in v:
        data = base64.b64decode(v["data"])
    else:
        fid = v["uri"].rstrip("/").split("/files/")[-1].split(":")[0]
        for _ in range(60):
            if http(f"{API}/v1beta/files/{fid}").get("state") == "ACTIVE": break
            time.sleep(5)
        data = http(f"{API}/v1beta/files/{fid}:download?alt=media", raw=True)
    out = SEG / f"{name}-real.mp4"; out.write_bytes(data)
    return f"ok {name} in={d:.2f}s out={len(data)} bytes"

def duration(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True, check=True).stdout)

def join():
    # retime each AI segment to its source length (in case the model drifts), then crossfade at the overlaps
    names = list(SEGMENTS)
    parts = []
    for n in names:
        src_len, real = span(n)[1], SEG / f"{n}-real.mp4"
        k = src_len / duration(real)
        fixed = SEG / f"{n}-fit.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(real), "-vf", f"setpts={k:.6f}*PTS,fps=24,scale=1280:720",
                        "-af", f"atempo={1 / k:.6f}", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(fixed)], check=True)
        parts.append((fixed, duration(fixed)))
    inputs, vf, af, t = [], [], [], 0.0
    for p, _ in parts: inputs += ["-i", str(p)]
    vlast, alast = "[0:v]", "[0:a]"
    for i in range(1, len(parts)):
        t += parts[i - 1][1] - XF
        vf.append(f"{vlast}[{i}:v]xfade=transition=fade:duration={XF}:offset={t:.3f}[v{i}]"); vlast = f"[v{i}]"
        af.append(f"{alast}[{i}:a]acrossfade=d={XF}[a{i}]"); alast = f"[a{i}]"
    out = VID / "tour-real.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf + af), "-map", vlast, "-map", alast,
                    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)], check=True)
    print("wrote", out, f"{duration(out):.2f}s")

if __name__ == "__main__":
    if sys.argv[1:] == ["--join"]: join()
    else:
        with ThreadPoolExecutor(4) as pool:
            for line in pool.map(restyle, sys.argv[1:] or SEGMENTS): print(line, flush=True)
