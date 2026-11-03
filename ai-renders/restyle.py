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
NAMES = ["1-descent", "2-orbit", "3-door", "4-craneup", "5-plan-rise", "6-final"]
WHAT = [
    "A drone shot descending through thin morning haze and soft, realistic clouds over a modern city toward a luxury "
    "residential glass tower with curved white balcony bands, ending as the camera begins to circle the tower. Every "
    "window on every building is closed glass. Clouds are natural soft cumulus and haze, not cartoon puffs. No birds.",
    "The camera keeps circling the luxury glass tower and starts moving closer to its curved white balconies. Every "
    "window on the tower is closed, reflective glass.",
    "The camera flies up to one window on a high floor of the tower. As it arrives the reflective glass turns clear, a "
    "glass sliding door slides open, and the camera glides through the doorway into a bright, sunlit, richly furnished "
    f"living room: {INTERIOR}. It settles looking across the sofa.",
    f"Inside the sunlit living room ({INTERIOR}), the camera turns slowly, then cranes smoothly up toward ceiling "
    "height while tilting down to look at the living area from above, and keeps rising straight up so the room is seen "
    "from directly above; as it rises past the top of the walls, they read as a clean architectural cutaway of the "
    "apartment, with every piece of furniture staying in place. One smooth, continuous crane move.",
    "Looking straight down, the camera keeps rising smoothly: the cutaway apartment opens out into the full floor plan, "
    "four furnished apartments around a central lift core with wooden corner terraces and planters, then the camera "
    "climbs above the top of the tower. As it rises, the open floor plan is covered smoothly by the tower's real roof: "
    "a closed concrete rooftop with a parapet, air-conditioning units and vents, water tanks, solar panels and a lift "
    "machine room; from then on the tower always has this closed roof and is never open or see-through. The camera keeps "
    "climbing until the whole tower stands in its plaza with lawns, trees and a reflecting pool among the dense "
    "neighbourhood: streets with cars, a park with a pond, detailed rooftops with HVAC units, parapets and solar panels. "
    "Every building, room and piece of furniture keeps exactly the same shape, colour and position in every frame: "
    "nothing morphs, swaps or is redrawn, and the light and shadows stay the same throughout, like one real drone take.",
    "From high above, looking straight down at the city, the camera tilts up and comes down in one smooth move, back to "
    "exactly the view the film opened on: the tall white residential tower with curved white balcony bands rising "
    "through soft morning haze among dark blue-grey glass skyscrapers, the same soft morning light and clouds. Every "
    "building keeps its real glass, concrete and windows, never plain, smooth or windowless blocks.",
]
CITY_DETAIL = ("Every rooftop, terrace and balcony in view looks lived-in and real: air-conditioning units and vents, water "
               "tanks, solar panels, railings and parapets, potted plants and rooftop gardens, clothes drying on lines, "
               "satellite dishes, weathering and stains on concrete, real textures, layers and soft natural shadows. ")
WHAT[4] = WHAT[4] + " " + CITY_DETAIL
WHAT[5] = WHAT[5] + " " + CITY_DETAIL
# Later segments used to drift to a different tower and a beige "massing model" city, so the exterior segments after
# the interior are also shown the established tower and city and told to match them. (file, frame in that segment's fit)
# References per segment, in IMAGE_REF order: (name, segment fit, frame) pulled from the finished film, or a path to an
# approved storyboard still (keyframes.py) for the views the segment passes through.
INTERIOR_REF, TOWER_REF, OPENING_REF = ("ref-interior", 2, 175), ("ref-tower", 1, 48), ("ref-opening", 0, 1)
# Only real frames from the film go in as references, for LOOK. Intermediate stills (keyframes.py) were tried as "views
# the camera passes through": the model held one still's framing, then jumped to the next, instead of following the
# 3D camera. The stills' look is carried by these references and the prompt text instead.
REFS = {
    3: [INTERIOR_REF],
    4: [INTERIOR_REF, TOWER_REF],
    5: [OPENING_REF, TOWER_REF],
}
ANCHOR = {
    3: ("<IMAGE_REF_0> is this same living room a few seconds earlier: every frame keeps exactly its colour grading, warm "
        "natural light, materials, furniture and realism; use it for the look only, not for the camera position. "),
    4: ("The apartment and floor plan keep the colour grading, light and realism of the living room in <IMAGE_REF_0>. When "
        "the whole tower comes into view it is the tall white residential tower with curved white balcony bands in "
        "<IMAGE_REF_1>, complete from the ground to its roof. Use both images for the look only, not for camera position. "),
    5: ("<IMAGE_REF_0> is the opening frame of this film. The video must end on exactly that view: the same tower, the same "
        "surrounding buildings, the same haze, clouds, light and colour grading. The tower is the one in <IMAGE_REF_1>, "
        "complete from the ground to its roof. Until the end, follow the input video's camera exactly. "),
}
# the end of the film is colour-matched to the opening frame (gradematch.py), ramping in over these seconds
GRADE_RAMP = (38.6, 42.6)
STYLE = ("Make this video photorealistic, like real drone and interior footage shot on a high-end cinema camera: real "
         "glass, concrete, wood and fabric, real trees, cars and clouds, natural light, crisp focus and fine detail. Keep "
         "the exact same camera motion, speed, timing, framing and composition as the input video, and keep every "
         "building, room, piece of furniture and street in the same place. One continuous shot with no cuts, no flashes "
         "and no fades. The camera never pauses, holds or jumps: frame by frame it moves exactly as smoothly and "
         "continuously as in the input video. Generic city with no famous landmarks, no text or logos. "
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

def smooth(i):
    """The model steps its camera a little once a second (every 24th frame, at frame 12 mod 24), and where the context
    ends it sometimes snaps from the previous segment's framing to the 3D's. Find those steps and replace the frames
    around each with motion-interpolated in-betweens, so each one becomes part of the move. One re-encode per segment."""
    import numpy as np, tempfile
    from PIL import Image
    p, size = fit_path(i), W * H * 3
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-vf", "scale=320:180", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    g = np.frombuffer(raw, np.uint8).reshape(-1, 180, 320).astype(np.float32)
    d, nf = np.abs(np.diff(g, axis=0)).mean((1, 2)), len(g)
    wins = []
    for k in range(11, len(d), 24):  # d[k] is the step into frame k + 1
        s, ratio = k + 1, d[k] / (np.median(d[max(0, k - 6):k + 7]) + 1e-6)
        if i and s == NCTX and ratio > 2.5: wins.append((NCTX - 1, NCTX + 12))  # the context snap: spread over half a second
        elif ratio > 1.3 and s + 2 < nf: wins.append((s - 3, s + 2))
    if not wins: print(f"smooth {NAMES[i]}: nothing to do"); return
    tmp, mids = Path(tempfile.mkdtemp()), {}
    for a, b in wins:
        ff("-i", p, "-vf", f"select='eq(n\\,{a})+eq(n\\,{b})'", "-fps_mode", "vfr", tmp / "k%d.png")
        for k, src in enumerate(["k1", "k2", "k2", "k2"]): (tmp / f"s{k}.png").write_bytes((tmp / f"{src}.png").read_bytes())
        # b - a steps from a to b at 24 fps (scd=none: a big move is not a scene cut)
        ff("-framerate", str(FPS / (b - a)), "-start_number", "0", "-i", tmp / "s%d.png", "-vf",
           f"minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:vsbmc=1:scd=none", "-start_number", "0", tmp / "o%d.png")
        mids.update({a + k: np.asarray(Image.open(tmp / f"o{k}.png").convert("RGB")).tobytes() for k in range(1, b - a)})
        for f in tmp.glob("*.png"): f.unlink()
    out = p.with_name(p.stem + "-smooth.mp4")
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(p), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                            "-i", "-", "-i", str(p), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "14",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", str(out)], stdin=subprocess.PIPE)
    n = 0
    while (buf := dec.stdout.read(size)) and len(buf) == size:
        enc.stdin.write(mids.get(n, buf)); n += 1
    enc.stdin.close(); dec.wait(); enc.wait()
    if enc.returncode: raise RuntimeError("smooth encode failed")
    out.replace(p)
    print(f"smooth {NAMES[i]}: interpolated", ", ".join(f"{a + 1}-{b - 1}" for a, b in wins))

def ref_jpg(ref):
    """A reference image on disk: an approved still path, or a frame pulled from a finished segment."""
    if isinstance(ref, str):
        return HERE / ref
    name, seg, frame = ref
    jpg = SEG / f"{name}.jpg"
    if not jpg.exists():
        ff("-i", fit_path(seg), "-vf", f"select=eq(n\\,{frame})", "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "2", jpg)
    return jpg

def restyle(i):
    name = NAMES[i]
    if i and not fit_path(i - 1).exists(): raise RuntimeError(f"{name} needs {NAMES[i - 1]} first")
    clip = build_input(i)
    sent = (ctx_frames(i) + new_frames(i)) / FPS
    text = (context_text(sent) if i else f"Return a video of exactly the same length as the input ({sent:.1f} seconds). ") + f"{WHAT[i]} {STYLE}"
    parts = [{"type": "video", "uri": upload(clip)["uri"], "mime_type": "video/mp4"}]
    for ref in REFS.get(i, []):
        parts.append({"type": "image", "mime_type": "image/jpeg", "data": base64.b64encode(ref_jpg(ref).read_bytes()).decode()})
    if i in ANCHOR:
        text = ANCHOR[i] + text
    body = {"model": MODEL, "input": [*parts, {"type": "text", "text": text}],
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

# joins that don't use the best overlap frame: segment index -> (cut frame in that segment, crossfade frames).
# 6-final copied the old segment 5's top view for 40 frames, then snapped to the 3D layout; it now starts after the snap,
# crossfading from segment 5's last (held) frame while the camera is nearly still at the top-view hold
JOIN_AT = {5: (47, 12)}

def join():
    """Cut each overlap at its best-matching frame with a short crossfade; no white, no blur. Then deflicker + sharpen."""
    n = len(NAMES)
    lens = [ctx_frames(i) + new_frames(i) for i in range(n)]
    a, b, xf = [0] * n, lens[:], [XF] * n
    for i in range(1, n):
        j, xf[i] = JOIN_AT.get(i, (None, XF))
        if j is None: j = best_join(i)
        b[i - 1] = lens[i - 1] - NCTX + j + xf[i] // 2   # previous segment runs a little past the cut frame...
        a[i] = j - xf[i] // 2                             # ...and this one starts a little before it: they overlap
    inputs, chains = [], []
    for i in range(n):
        inputs += ["-i", fit_path(i)]
        # tpad/apad: a JOIN_AT cut can run past the end of the previous segment, which then holds its last frame
        chains.append(f"[{i}:v]tpad=stop_mode=clone:stop=48,trim=start_frame={a[i]}:end_frame={b[i]},setpts=PTS-STARTPTS[v{i}]")
        chains.append(f"[{i}:a]apad,atrim=start={a[i] / FPS:.5f}:end={b[i] / FPS:.5f},asetpts=PTS-STARTPTS[a{i}]")
    vacc, aacc, length = "[v0]", "[a0]", (b[0] - a[0]) / FPS
    for i in range(1, n):
        d = xf[i] / FPS
        chains.append(f"{vacc}[v{i}]xfade=transition=fade:duration={d:.5f}:offset={length - d:.5f}[x{i}]")
        chains.append(f"{aacc}[a{i}]acrossfade=d={d:.5f}[y{i}]")
        vacc, aacc = f"[x{i}]", f"[y{i}]"
        length += (b[i] - a[i]) / FPS - d
    chains.append(f"{vacc}deflicker=mode=pm:size=10,unsharp=5:5:0.45:5:5:0[vout]")
    out, joined = VID / "tour-real.mp4", VID / "tour-joined.mp4"
    ff(*inputs, "-filter_complex", ";".join(chains), "-map", "[vout]", "-map", aacc, "-c:v", "libx264", "-crf", "16",
       "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", joined)
    # the last shot lands on the opening frame: match its colour grading to that frame, ramping in over GRADE_RAMP
    import gradematch
    gradematch.match_video(joined, ref_jpg(OPENING_REF), out, *GRADE_RAMP)
    joined.unlink()
    print("wrote", out, f"{duration(out):.2f}s")

# The 3D recording as the hero (one scene, so every frame shows the same building, room and city): a filmic grade
# instead of the render's saturated game look. Softer colour, warm highlights / cool shadows, a gentle glow and vignette;
# no grain (grain changes every frame).
GRADE_3D = ("eq=saturation=0.9:contrast=1.05,colorbalance=rs=-0.02:bs=0.025:rh=0.03:bh=-0.03,"
            "split[a][b];[b]gblur=sigma=14[g];[a][g]blend=all_mode=screen:all_opacity=0.10,vignette=PI/7")

def site(master=None, grade=None):
    """The two files the site scrubs (public/, gitignored: the 1080p one is over GitHub's 100 MB limit). All-intra so
    every scroll seek lands on a keyframe; Tour.tsx picks 1080p for screens >= 1280 px wide, 720p otherwise."""
    master, pub = master or VID / "tour-real.mp4", HERE.parent / "public"
    pre = grade + "," if grade else ""
    common = ["-c:v", "libx264", "-g", "1", "-keyint_min", "1", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"]
    ff("-i", master, "-vf", pre + "null", "-crf", "21", *common, pub / "tour-1080.mp4")
    ff("-i", master, "-vf", pre + "scale=1280:720:flags=lanczos", "-crf", "20", *common, pub / "tour-720.mp4")
    print(f"wrote public/tour-1080.mp4 and public/tour-720.mp4 from {master.name}")

if __name__ == "__main__":
    if sys.argv[1:] == ["--site"]:
        site()
    elif sys.argv[1:] == ["--site3d"]:
        site(VID / "tour-3d.mp4", GRADE_3D)
    elif sys.argv[1:2] == ["--smooth"]:
        for x in sys.argv[2:]: smooth(int(x) - 1)
    elif sys.argv[1:] == ["--join"]:
        join(); site()
    else:
        picks = [int(x) - 1 for x in sys.argv[1:]] or list(range(len(NAMES)))
        if not KEY["x-goog-api-key"]: sys.exit("GEMINI_API_KEY is not set")
        for i in picks: restyle(i)  # in order: each one continues from the previous segment's finished footage
        if all(fit_path(i).exists() for i in range(len(NAMES))): join(); site()
