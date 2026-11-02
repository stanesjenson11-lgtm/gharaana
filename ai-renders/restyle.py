# Make the recorded 3D tour (videos/tour-3d.mp4 + tour-3d.json, from record.mjs) photoreal, keeping its camera path,
# as ONE continuous shot.
#
# Gemini Omni Flash edits at most 10 s per call, so the film is made in segments. Each segment after the first is fed
# the last CONTEXT seconds of the previous segment's finished photoreal footage followed by the next stretch of the 3D
# recording, and told to keep that opening exactly and carry on. The model sees one clip that already starts photoreal,
# so its own temporal consistency carries the same tower, floor, art and light forward. The join then cuts inside that
# shared overlap at the frame where both versions match best (per-frame SSIM), with a 6-frame crossfade.
#
# Usage: python restyle.py [n ...]   restyle segments n.. (1-based, in order; default: all), then join + site files
#        python restyle.py --join    only rebuild videos/tour-real.mp4 from the existing segments (+ site files)
#        python restyle.py --site    only re-encode public/tour-1080.mp4 and public/tour-720.mp4 from the master
import base64, json, os, re, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).parent
VID = HERE / "videos"; SEG = VID / "segments"; SEG.mkdir(parents=True, exist_ok=True)
SRC = VID / "tour-3d.mp4"
API = "https://generativelanguage.googleapis.com"
KEY = {"x-goog-api-key": os.environ.get("GEMINI_API_KEY", "")}  # only needed to restyle; --join works without it
MODEL = os.environ.get("VIDEO_MODEL", "gemini-omni-1.1-flash")
W, H, RES = 1920, 1080, "1080p"
XF = 6  # crossfade frames at each join

INTERIOR = ("herringbone oak parquet floor with natural grain, varied plank tones and a soft satin sheen; linen sofa with "
            "yellow, navy and patterned cushions; above the sofa a framed abstract print of blue and yellow wavy horizontal "
            "lines (keep it exactly as in the input, it is not a famous painting); two smaller framed abstract prints; a "
            "leather lounge chair; a wooden armchair; a round marble coffee table; a side table with a brass vase; a low oak "
            "console with a ceramic vase; a large floor plant and plants in clay pots; an oak dining table with brass "
            "candleholders; a white kitchen with marble counters")
NAMES = ["1-descent", "2-orbit", "3-door", "4-living-plan", "5-rise", "6-evening"]
WHAT = [
    "A drone shot descending through thin morning haze and soft, realistic clouds over a modern city toward a luxury "
    "residential glass tower with curved white balcony bands, ending as the camera begins to circle the tower. Every "
    "window on every building is closed glass. Clouds are natural soft cumulus and haze, not cartoon puffs. No birds.",
    "The camera keeps circling the luxury glass tower and starts moving closer to its curved white balconies. Every "
    "window on the tower is closed, reflective glass.",
    "The camera flies up to one window on a high floor of the tower. As it arrives the reflective glass turns clear, a "
    "glass sliding door slides open, and the camera glides through the doorway into a bright, sunlit, richly furnished "
    f"living room: {INTERIOR}. It settles looking across the sofa.",
    f"Inside the sunlit living room ({INTERIOR}), the camera turns slowly across the room, then rises straight up "
    "through the ceiling and looks down at the apartment as an architectural cutaway with the roof removed, and keeps "
    "rising until the whole floor of the tower is visible as a cutaway plan: four furnished apartments around a central "
    "lift core, with wooden corner terraces with planters and small tables. Nothing covers the plan; there is no roof.",
    "The camera keeps rising straight up over the cutaway floor plan; the tower shrinks into its plaza with lawns, "
    "trees and a reflecting pool, and the dense city neighbourhood comes into view from high above: streets with cars, "
    "a park with a pond, and detailed rooftops with HVAC units, air-conditioning plant, parapets and solar panels.",
    "The camera tilts up from the aerial view and glides down to a wide view of the city skyline and the glass "
    "residential tower at golden hour: warm low sun, long soft shadows, glowing glass, realistic soft clouds. Rooftops "
    "keep the same detailed photoreal look, with HVAC units, parapets and solar panels.",
]
STYLE = ("Make this video photorealistic, like real drone and interior footage shot on a high-end cinema camera: real "
         "glass, concrete, wood and fabric, real trees, cars and clouds, natural light, crisp focus and fine detail. Keep "
         "the exact same camera motion, speed, timing, framing and composition as the input video, and keep every "
         "building, room, piece of furniture and street in the same place. One continuous shot with no cuts, no flashes "
         "and no fades. Generic city with no famous landmarks, no text or logos. "
         "Audio: soft ambient city sound only, no music, no dialogue.")

meta = json.loads((VID / "tour-3d.json").read_text())
FPS, CTX = meta["fps"], meta["context"]
NCTX = round(CTX * FPS)
BOUNDS = [0, *meta["cuts"], meta["frames"] - 1]  # frame index where each segment's new footage starts / ends
assert len(BOUNDS) == len(NAMES) + 1, f"tour-3d.json must have {len(NAMES) - 1} seams"
# Worded as an EDIT of the whole clip: "continue"/"carry on" made the model treat it as an extension (it kept the 3D
# frames as they were and appended ~10 s of invented footage).
def context_text(secs):
    return (f"This is a video edit, not an extension. Return a video of exactly the same length as the input "
            f"({secs:.1f} seconds), frame for frame, and add nothing after its end. The first {CTX:g} seconds of the "
            "input are already finished photoreal footage: leave them unchanged. Every frame after that is a simple 3D "
            "render: repaint each of those frames into the same photoreal footage, so the whole clip looks like one real "
            "camera shot with identical buildings, materials, furniture, artwork, colours, exposure and light throughout. ")

def new_frames(i): return BOUNDS[i + 1] - BOUNDS[i]
def ctx_frames(i): return NCTX if i else 0
def fit_path(i): return SEG / f"{NAMES[i]}-fit.mp4"

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

def find_usage(node, out=None):
    """Every token-count field in the response, so the real cost of a call (e.g. at 1080p) can be reported."""
    out = {} if out is None else out
    if isinstance(node, dict):
        for k, v in node.items():
            if k != "input" and "token" in k.lower() and isinstance(v, (int, float)): out[k] = out.get(k, 0) + v
            elif k != "input": find_usage(v, out)
    elif isinstance(node, list):
        for x in node: find_usage(x, out)
    return out

def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *map(str, args)], check=True)

def probe(p, entries):
    return subprocess.run(["ffprobe", "-v", "error", *entries, "-of", "csv=p=0", str(p)], capture_output=True, text=True, check=True).stdout.strip()

def duration(p): return float(probe(p, ["-show_entries", "format=duration"]))
def has_audio(p): return bool(probe(p, ["-select_streams", "a", "-show_entries", "stream=index"]))

def build_input(i):
    """3D frames of this segment, preceded (after the first) by the previous segment's last CONTEXT seconds."""
    out = SEG / f"{NAMES[i]}-in.mp4"
    part = f"trim=start_frame={BOUNDS[i]}:end_frame={BOUNDS[i + 1]},setpts=PTS-STARTPTS,scale={W}:{H},fps={FPS},format=yuv420p"
    if i == 0:
        ff("-i", SRC, "-vf", part, "-an", "-c:v", "libx264", "-crf", "18", out)
    else:
        prev = fit_path(i - 1)
        n_prev = ctx_frames(i - 1) + new_frames(i - 1)
        ff("-i", prev, "-i", SRC, "-filter_complex",
           f"[0:v]trim=start_frame={n_prev - NCTX}:end_frame={n_prev},setpts=PTS-STARTPTS,scale={W}:{H},fps={FPS},format=yuv420p[c];"
           f"[1:v]{part}[p];[c][p]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "18", out)
    return out

def fit(i):
    """Retime the model's output to exactly the frames it stands for (it drifts by a few), at 1080p/24 fps, with audio."""
    real, n = SEG / f"{NAMES[i]}-real.mp4", ctx_frames(i) + new_frames(i)
    secs = n / FPS
    k = secs / duration(real)
    audio = ["-i", real] if has_audio(real) else ["-f", "lavfi", "-t", f"{secs:.4f}", "-i", "anullsrc=r=48000:cl=stereo"]
    a_in = "1:a" if not has_audio(real) else "0:a"
    ff("-i", real, *audio, "-filter_complex",
       f"[0:v]setpts={k:.6f}*PTS,fps={FPS},scale={W}:{H}:flags=lanczos,tpad=stop_mode=clone:stop=4,trim=end_frame={n},setpts=PTS-STARTPTS[v];"
       f"[{a_in}]{'atempo=%.6f,' % (1 / k) if has_audio(real) else ''}aresample=48000,apad,atrim=end={secs:.4f},asetpts=PTS-STARTPTS[a]",
       "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", fit_path(i))

def restyle(i):
    name = NAMES[i]
    if i and not fit_path(i - 1).exists(): raise RuntimeError(f"{name} needs {NAMES[i - 1]} first")
    clip = build_input(i)
    sent = (ctx_frames(i) + new_frames(i)) / FPS
    text = (context_text(sent) if i else f"Return a video of exactly the same length as the input ({sent:.1f} seconds). ") + f"{WHAT[i]} {STYLE}"
    body = {"model": MODEL, "input": [{"type": "video", "uri": upload(clip)["uri"], "mime_type": "video/mp4"}, {"type": "text", "text": text}],
            "response_format": {"type": "video", "aspect_ratio": "16:9", "resolution": RES, "delivery": "uri"},
            "background": False, "store": True, "stream": False}  # store=True is required for URI delivery
    for attempt in range(6):
        try:
            res = http(f"{API}/v1beta/interactions", body); break
        except urllib.error.HTTPError as err:
            msg = err.read().decode()[:600]
            if err.code in (429, 500, 503) and attempt < 5 and "per day" not in msg: time.sleep(45); continue  # daily caps won't clear
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
    real = SEG / f"{name}-real.mp4"
    real.write_bytes(data)
    usage = json.dumps(find_usage(res))
    got = duration(real)
    if abs(got - sent) > 1.0:  # an extension, not an edit: squeezing it into the timeline would wreck the motion
        raise RuntimeError(f"{name}: sent {sent:.2f}s but got {got:.2f}s back; not using it. usage={usage}")
    fit(i)
    print(f"ok {name} sent={sent:.2f}s got={got:.2f}s size={len(data)} bytes usage={usage}", flush=True)

def best_join(i):
    """Frame inside the overlap (0..NCTX-1) where the previous segment's tail and this segment's head match best."""
    n_prev = ctx_frames(i - 1) + new_frames(i - 1)
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(fit_path(i - 1)), "-i", str(fit_path(i)), "-lavfi",
                        f"[0:v]trim=start_frame={n_prev - NCTX}:end_frame={n_prev},setpts=PTS-STARTPTS,scale=640:360[a];"
                        f"[1:v]trim=end_frame={NCTX},setpts=PTS-STARTPTS,scale=640:360[b];[a][b]ssim=stats_file=-",
                        "-f", "null", "-"], capture_output=True, text=True, check=True)
    scores = [float(m) for m in re.findall(r"All:([0-9.]+)", r.stdout)]
    # any frame whose XF-frame crossfade still fits inside the overlap (the best match can sit right at its end)
    lo, hi = XF // 2, NCTX - XF // 2 + 1
    j = max(range(lo, min(hi, len(scores))), key=lambda f: scores[f])
    print(f"join {NAMES[i - 1]} -> {NAMES[i]}: cut at overlap frame {j}, SSIM {scores[j]:.3f} (range {min(scores):.3f}-{max(scores):.3f})")
    return j

def join():
    """Cut each overlap at its best-matching frame with a short crossfade; no white, no blur. Then deflicker + sharpen."""
    n = len(NAMES)
    lens = [ctx_frames(i) + new_frames(i) for i in range(n)]
    a, b = [0] * n, lens[:]
    for i in range(1, n):
        j = best_join(i)
        b[i - 1] = lens[i - 1] - NCTX + j + XF // 2   # previous segment runs a little past the cut frame...
        a[i] = j - XF // 2                             # ...and this one starts a little before it: XF frames overlap
    d = XF / FPS
    inputs, chains = [], []
    for i in range(n):
        inputs += ["-i", fit_path(i)]
        chains.append(f"[{i}:v]trim=start_frame={a[i]}:end_frame={b[i]},setpts=PTS-STARTPTS[v{i}]")
        chains.append(f"[{i}:a]atrim=start={a[i] / FPS:.5f}:end={b[i] / FPS:.5f},asetpts=PTS-STARTPTS[a{i}]")
    vacc, aacc, length = "[v0]", "[a0]", (b[0] - a[0]) / FPS
    for i in range(1, n):
        chains.append(f"{vacc}[v{i}]xfade=transition=fade:duration={d:.5f}:offset={length - d:.5f}[x{i}]")
        chains.append(f"{aacc}[a{i}]acrossfade=d={d:.5f}[y{i}]")
        vacc, aacc = f"[x{i}]", f"[y{i}]"
        length += (b[i] - a[i]) / FPS - d
    chains.append(f"{vacc}deflicker=mode=pm:size=10,unsharp=5:5:0.45:5:5:0[vout]")
    out = VID / "tour-real.mp4"
    ff(*inputs, "-filter_complex", ";".join(chains), "-map", "[vout]", "-map", aacc, "-c:v", "libx264", "-crf", "16",
       "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out)
    print("wrote", out, f"{duration(out):.2f}s")

def site():
    """The two files the site scrubs (public/, gitignored: the 1080p one is over GitHub's 100 MB limit). All-intra so
    every scroll seek lands on a keyframe; Tour.tsx picks 1080p for screens >= 1280 px wide, 720p otherwise."""
    master, pub = VID / "tour-real.mp4", HERE.parent / "public"
    common = ["-c:v", "libx264", "-g", "1", "-keyint_min", "1", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"]
    ff("-i", master, "-crf", "21", *common, pub / "tour-1080.mp4")
    ff("-i", master, "-vf", "scale=1280:720:flags=lanczos", "-crf", "20", *common, pub / "tour-720.mp4")
    print("wrote public/tour-1080.mp4 and public/tour-720.mp4")

if __name__ == "__main__":
    if sys.argv[1:] == ["--site"]:
        site()
    elif sys.argv[1:] == ["--join"]:
        join(); site()
    else:
        picks = [int(x) - 1 for x in sys.argv[1:]] or list(range(len(NAMES)))
        if not KEY["x-goog-api-key"]: sys.exit("GEMINI_API_KEY is not set")
        for i in picks: restyle(i)  # in order: each one continues from the previous segment's finished footage
        if all(fit_path(i).exists() for i in range(len(NAMES))): join(); site()
