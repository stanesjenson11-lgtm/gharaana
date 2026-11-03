# The whole 3D tour as ONE Gemini Omni generation: the 45.6 s recording sped up to 9.9 s (the model's input limit), so
# one call restyles everything with one consistent light and grade. The site scrubs it by scroll, so the speed-up never
# shows; public/tour-timing.json is rewritten so each scroll tick still lands on the matching frame.
# Usage: python oneshot.py          (paid: one 1080p call, ~$1.50; key from GEMINI_API_KEY)
#        python oneshot.py --site   (re-encode the site files from videos/oneshot-fit.mp4, no call)
import base64, json, shutil, subprocess, sys, time, urllib.error
from pathlib import Path
import numpy as np
import restyle as R

VID, PUB = R.VID, R.HERE.parent / "public"
SRC, IN, REAL, FIT = VID / "tour-3d.mp4", VID / "oneshot-in.mp4", VID / "oneshot-real.mp4", VID / "oneshot-fit.mp4"
SECS = 9.9
REFS = [R.SEG / "ref-opening.jpg", R.SEG / "ref-tower.jpg", R.SEG / "ref-interior.jpg"]
# (seconds in the 9.9 s clip, seconds in the 45.6 s recording): every part of the flow gets its own share, so the
# model has time for each (an even 4.6x squeeze left ~2 s for the top view and the way back, and it skipped them)
END = (round(SECS * R.FPS) - 1) / R.FPS  # the clip's last frame is the recording's last frame (= the opening view)
KNOTS = [(0, 0), (1.6, 12.7), (3.6, 20.6), (4.5, 23.0), (6.7, 33.5), (7.7, 37.3), (END, 1094 / R.FPS)]

def source_frames():
    """Clip frame -> recording frame, through KNOTS with a smooth (monotone cubic) speed so no part jerks."""
    xs, ys = (np.array(v, float) for v in zip(*KNOTS))
    d = np.diff(ys) / np.diff(xs)
    m = np.r_[d[0], [2 / (1 / a + 1 / b) for a, b in zip(d[:-1], d[1:])], d[-1]]
    out = []
    for t in np.arange(round(SECS * R.FPS)) / R.FPS:
        k = min(np.searchsorted(xs, t, side="right") - 1, len(xs) - 2)
        h = xs[k + 1] - xs[k]; s = (t - xs[k]) / h
        y = (2*s**3 - 3*s**2 + 1) * ys[k] + (s**3 - 2*s**2 + s) * h * m[k] + (-2*s**3 + 3*s**2) * ys[k + 1] + (s**3 - s**2) * h * m[k + 1]
        out.append(min(1094, int(round(y * R.FPS))))
    assert out == sorted(out) and out[0] == 0, "time map must run forward from the first frame"
    return out

PROMPT = (
    f"Return a video of exactly the same length as the input ({SECS} seconds), following its camera motion frame by "
    "frame. Analyse this video carefully: it is a rough real-time 3D render of one continuous camera move through a "
    "city and into an apartment. Re-create it as real, photorealistic footage shot on a high-end cinema camera, as one "
    "single continuous drone and interior shot with no cuts, fades or flashes. Keep the camera path, the timing and the "
    "layout of every building, street, room and piece of furniture from the render, but make all of it look real: "
    "natural sunlight and soft sky light, true reflections in glass, water and polished surfaces, soft accurate "
    "shadows and contact shadows, real materials and textures (glass curtain walls, concrete, brick, plaster, honey "
    "oak floor, linen, leather, marble, brass, foliage), realistic trees, cars and people-free streets, rooftops with "
    "air-conditioning units, water tanks, solar panels, plants and laundry, and a cinematic, natural colour grade. "
    "Be creative: add realistic detail, depth and atmosphere (thin morning haze, natural clouds, beautiful light) to "
    "make it as beautiful and believable as possible, as long as it stays one continuous shot in one consistent world: "
    "every building, floor count, room and piece of furniture keeps its shape and position whenever it is in view, "
    "the light, shadows and colour grade stay consistent from the first frame to the last, and the last frame shows "
    "the same view as the first. Follow every part of the input's camera move in order and never skip, shorten or "
    "cut any of it: 0-1.6 s the whole tower among dark glass skyscrapers in thin morning haze, the camera coming down "
    "and circling it; 1.6-3.6 s it flies in to one window on a high floor, the glass sliding door slides open and it "
    "glides into the living room; 3.6-4.5 s the bright sunlit living room; 4.5-6.7 s it cranes up and looks straight "
    "down as the room becomes an architectural cutaway, rises over the whole furnished floor, and the tower's real "
    "roof closes over it; 6.7-7.7 s the view straight down from high above: the tower's rooftop in its plaza among the "
    "neighbourhood's streets, park and rooftops; 7.7-9.9 s the camera tilts up and comes back down in one smooth move "
    "to exactly the opening view of the whole tower. "
    "The tower is ONE building, identical from far away and up close: a tall white residential tower whose every floor "
    "is wrapped by a smooth, curved white balcony slab with clear glass railings and floor-to-ceiling glass behind; "
    "when the camera comes close it shows exactly the same facade, floor heights and balcony shape as from afar, never "
    "a different design. Image 1 shows the look wanted for the city and the tower from afar, image 2 the same tower "
    "close up, image 3 the living room. No text, logos, watermarks or birds.")

def frames(p): return int(R.probe(p, ["-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames"]).split(",")[0])

def build_input():
    """The clip the model gets: the recording's frames picked by source_frames()."""
    pick, size = source_frames(), R.W * R.H * 3
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(SRC), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{R.W}x{R.H}", "-r",
                            str(R.FPS), "-i", "-", "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(IN)],
                           stdin=subprocess.PIPE)
    n, j = 0, 0
    while j < len(pick) and (buf := dec.stdout.read(size)) and len(buf) == size:
        while j < len(pick) and pick[j] == n: enc.stdin.write(buf); j += 1
        n += 1
    dec.stdout.close(); dec.wait(); enc.stdin.close(); enc.wait()
    print(f"input: {len(pick)} frames from recording frames {pick[0]}..{pick[-1]}")

def generate():
    build_input()
    parts = [{"type": "video", "uri": R.upload(IN)["uri"], "mime_type": "video/mp4"}]
    parts += [{"type": "image", "mime_type": "image/jpeg", "data": base64.b64encode(p.read_bytes()).decode()} for p in REFS]
    body = {"model": R.MODEL, "input": [*parts, {"type": "text", "text": PROMPT}],
            "response_format": {"type": "video", "aspect_ratio": "16:9", "resolution": R.RES, "delivery": "uri"},
            "background": False, "store": True, "stream": False}
    for attempt in range(4):  # only transient server errors are retried (no video was made, nothing billed)
        try:
            res = R.http(f"{R.API}/v1beta/interactions", body); break
        except urllib.error.HTTPError as err:
            msg = err.read().decode()[:600]
            if err.code in (500, 503) and attempt < 3: time.sleep(45); continue
            raise RuntimeError(f"HTTP {err.code} {msg}")
    v = R.find_video(res)
    if not v: raise RuntimeError(f"no video in response: {json.dumps(res)[:600]}")
    if "data" in v:
        data = base64.b64decode(v["data"])
    else:
        fid = v["uri"].rstrip("/").split("/files/")[-1].split(":")[0]
        for _ in range(60):
            if R.http(f"{R.API}/v1beta/files/{fid}").get("state") == "ACTIVE": break
            time.sleep(5)
        data = R.http(f"{R.API}/v1beta/files/{fid}:download?alt=media", raw=True)
    REAL.write_bytes(data)
    print(f"ok sent={R.duration(IN):.2f}s got={R.duration(REAL):.2f}s usage={json.dumps(R.find_usage(res))}", flush=True)

def fit():
    """Retime the model's output to exactly the input's frame count (it drifts a little), 1080p/24."""
    n = frames(IN)
    k = n / R.FPS / R.duration(REAL)
    R.ff("-i", REAL, "-vf", f"setpts={k:.6f}*PTS,fps={R.FPS},scale={R.W}:{R.H}:flags=lanczos,tpad=stop_mode=clone:stop=4,"
         f"trim=end_frame={n},setpts=PTS-STARTPTS", "-an", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", FIT)
    return n

def site(n):
    """Site files from the one-shot, and a tick table for its frames (the 3D recording's table is kept alongside)."""
    keep = PUB / "tour-timing-3d.json"
    if not keep.exists(): shutil.copy(PUB / "tour-timing.json", keep)
    t3 = json.loads(keep.read_text())["ticks"]
    pick = source_frames()
    assert len(pick) == n, f"clip has {n} frames, time map {len(pick)}"
    ticks = [t3[i] for i in pick]
    assert ticks[0] == t3[0] and ticks[-1] == t3[-1] and ticks == sorted(ticks), "tick table must span the tour in order"
    (PUB / "tour-timing.json").write_text(json.dumps({"fps": R.FPS, "ticks": ticks}))
    R.site(FIT)
    print(f"site: {n} frames, ticks {ticks[0]}..{ticks[-1]}")

if __name__ == "__main__":
    if sys.argv[1:] == ["--site"]:
        site(frames(FIT))  # as it is (keeps any manual fixes to oneshot-fit.mp4)
    else:
        if not R.KEY["x-goog-api-key"]: sys.exit("GEMINI_API_KEY is not set")
        generate()
        site(fit())
