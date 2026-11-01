# Make the recorded 3D tour (videos/tour-3d.mp4 + tour-3d.json, from record.mjs) photoreal, keeping its camera path.
# Gemini Omni Flash edits at most 10 s per call, so the video is restyled in segments, cut where the camera is passing
# through something (cloud deck, the doorway, the ceiling, a cloud: CUT_TICKS in record.mjs). The join dips to white
# for a moment at each cut, so two separately generated segments never show side by side. Each segment also gets the
# previous segment's last clear frame as a look reference, so colour and materials stay consistent.
# Usage: python restyle.py [first-segment]   (restyles from that segment onwards; default: all)
#        python restyle.py --join            (only rebuild tour-real.mp4 from existing segments)
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).parent
VID = HERE / "videos"; SEG = VID / "segments"; SEG.mkdir(parents=True, exist_ok=True)
SRC = VID / "tour-3d.mp4"
API = "https://generativelanguage.googleapis.com"
KEY = {"x-goog-api-key": os.environ["GEMINI_API_KEY"]}
MODEL = os.environ.get("VIDEO_MODEL", "gemini-omni-1.1-flash")

INTERIOR = ("herringbone oak floor, linen sofa with yellow, navy and patterned cushions, leather lounge chair, wooden "
            "armchair, round marble coffee table, side table with a brass vase, plants in clay pots, framed blue-and-yellow "
            "wave print, oak dining table with brass candleholders, white kitchen with marble counters")
# one description per stretch between white-outs
NAMES = ["1-clouds", "2-tower-door", "3-living", "4-plan-hood", "5-evening"]
WHAT = [
    "The drone descends through soft morning clouds and mist toward a luxury residential glass tower with curved white "
    "balcony bands. Every window on every building is closed glass. At the end the camera enters a thick white cloud "
    "that fills the whole frame.",
    "The camera comes out of a white cloud above the city, circles the luxury glass tower and flies toward one window on "
    "a high floor. Every window on the tower stays closed glass until the camera arrives; then that window's glass "
    "sliding door slides open, revealing a furnished living room, and as the camera passes through the doorway bright "
    "sunlight fills the frame white.",
    f"The frame opens from bright white sunlight into a sunlit, richly furnished living room: {INTERIOR}. The camera "
    "turns slowly across the room, then rises toward the white ceiling until it fills the frame.",
    "From the white ceiling the view opens straight down onto the whole floor of the tower as an architectural cutaway "
    "plan: four furnished apartments around a central lift core, and wooden corner terraces with planters and small "
    "tables. The camera rises straight up; the upper floors settle back so the tower top becomes a solid roof, and the "
    "neighbourhood comes into view from high above: the tower in its plaza with lawns, trees and a reflecting pool, "
    "streets with cars, a park with a pond, rooftops. At the end the camera drops into a white cloud that fills the frame.",
    "The camera comes out of a white cloud and glides down to a wide view of the city skyline and the glass residential "
    "tower in warm golden-hour light: low sun, long shadows, glowing glass.",
]
STYLE = ("Make this video photorealistic, like real drone and interior footage shot on a cinema camera: real glass, "
         "concrete, wood and fabric, real trees, cars and clouds, natural light, fine detail. Keep the exact same camera "
         "motion, speed, timing, framing and composition as the input video, and keep every building, room, piece of "
         "furniture and street in the same place. One continuous "
         "shot, no cuts. Generic city with no famous landmarks, no text or logos. "
         "Audio: soft ambient city sound only, no music, no dialogue.")
LOOK = "Match the colour grading, light and materials of <IMAGE_REF_0>, a frame from the same film. "

meta = json.loads((VID / "tour-3d.json").read_text())
FPS = meta["fps"]
BOUNDS = [0, *meta["cuts"], meta["frames"] - 1]  # frame indices; neighbours share the white frame at each cut
SEGMENTS = [(NAMES[i], BOUNDS[i] / FPS, BOUNDS[i + 1] / FPS, WHAT[i]) for i in range(len(NAMES))]
assert len(BOUNDS) == len(NAMES) + 1, "tour-3d.json must have 4 cuts"
assert all(e - s <= 10 for _, s, e, _ in SEGMENTS), "every segment must be 10 s or less"

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
    f = http(start.headers["X-Goog-Upload-URL"], data=blob, headers={"Content-Type": "video/mp4", "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0"})["file"]
    while f.get("state") == "PROCESSING":
        time.sleep(3); f = http(f"{API}/v1beta/{f['name']}")
    if f.get("state") != "ACTIVE": raise RuntimeError(f"upload failed: {f}")
    return f

def find_video(node):
    # walk the response (skipping the echoed input) instead of hard-coding the steps/content path
    if isinstance(node, dict):
        if node.get("type") == "video" and ("uri" in node or "data" in node): return node
        node = [v for k, v in node.items() if k != "input"]
    if isinstance(node, list):
        for x in node:
            if (v := find_video(x)): return v

def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *map(str, args)], check=True)

def duration(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True, check=True).stdout)

def restyle(i):
    name, s, e, what = SEGMENTS[i]
    cut = SEG / f"{name}-3d.mp4"
    ff("-ss", f"{s:.4f}", "-i", SRC, "-t", f"{e - s + 0.5 / FPS:.4f}", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-an", cut)
    parts = [{"type": "video", "uri": upload(cut)["uri"], "mime_type": "video/mp4"}]
    text = f"{what} {STYLE}"
    if i > 0:  # the previous segment's last clear frame (1.2 s before its white-out) as the look to match
        pname, ps, pe, _ = SEGMENTS[i - 1]
        prev = SEG / f"{pname}-real.mp4"
        look = SEG / f"{name}-look.jpg"
        ff("-ss", f"{max(0, (pe - ps - 1.2)) * duration(prev) / (pe - ps):.3f}", "-i", prev, "-frames:v", "1", "-q:v", "2", look)
        parts.append({"type": "image", "mime_type": "image/jpeg", "data": base64.b64encode(look.read_bytes()).decode()})
        text = LOOK + text
    body = {"model": MODEL, "input": [*parts, {"type": "text", "text": text}],
            "response_format": {"type": "video", "aspect_ratio": "16:9", "resolution": "720p", "delivery": "uri"},
            "background": False, "store": True, "stream": False}  # store=True is required for URI delivery
    for attempt in range(6):
        try:
            res = http(f"{API}/v1beta/interactions", body); break
        except urllib.error.HTTPError as err:
            msg = err.read().decode()[:600]
            if err.code in (429, 500, 503) and attempt < 5: time.sleep(45); continue
            raise RuntimeError(f"{name}: HTTP {err.code} {msg}")
    v = find_video(res)
    if not v: raise RuntimeError(f"{name}: no video in response: {json.dumps(res)[:600]}")
    if "data" in v:
        data = base64.b64decode(v["data"])
    else:
        fid = v["uri"].rstrip("/").split("/files/")[-1].split(":")[0]
        for _ in range(60):
            if http(f"{API}/v1beta/files/{fid}").get("state") == "ACTIVE": break
            time.sleep(5)
        data = http(f"{API}/v1beta/files/{fid}:download?alt=media", raw=True)
    (SEG / f"{name}-real.mp4").write_bytes(data)
    print(f"ok {name} in={e - s:.2f}s out={len(data)} bytes", flush=True)

def join():
    # retime each AI segment to its source length (the model drifts by a few frames), dip to white over 0.45 s at each
    # inner edge, then hard-cut them together (the cut frame is white on both sides). Audio fades keep it from clicking.
    inputs, chains, labels = [], [], ""
    for i, (name, s, e, _) in enumerate(SEGMENTS):
        real = SEG / f"{name}-real.mp4"
        n = BOUNDS[i + 1] - BOUNDS[i]  # frames this segment contributes (the shared white frame goes to the next one)
        k = (e - s) / duration(real)
        inputs += ["-i", real]
        dips = (",fade=t=in:st=0:d=0.45:color=white" if i > 0 else "") + (",fade=t=out:st=%.4f:d=0.45:color=white" % (n / FPS - 0.45) if i < len(SEGMENTS) - 1 else "")
        chains.append(f"[{i}:v]setpts={k:.6f}*PTS,fps={FPS},scale=1280:720,trim=end_frame={n},setpts=PTS-STARTPTS{dips}[v{i}]")
        chains.append(f"[{i}:a]atempo={1 / k:.6f},atrim=end={n / FPS:.4f},asetpts=PTS-STARTPTS,"
                      f"afade=t=in:d=0.15,afade=t=out:st={n / FPS - 0.15:.4f}:d=0.15[a{i}]")
        labels += f"[v{i}][a{i}]"
    out = VID / "tour-real.mp4"
    ff(*inputs, "-filter_complex", ";".join(chains) + f";{labels}concat=n={len(SEGMENTS)}:v=1:a=1[v][a]",
       "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
       "-movflags", "+faststart", out)
    print("wrote", out, f"{duration(out):.2f}s")

if __name__ == "__main__":
    if sys.argv[1:] == ["--join"]:
        join()
    else:
        first = NAMES.index(sys.argv[1]) if sys.argv[1:] else 0
        for i in range(first, len(SEGMENTS)): restyle(i)  # in order: each one takes its look from the previous result
        join()
