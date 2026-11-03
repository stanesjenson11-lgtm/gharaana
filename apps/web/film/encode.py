"""Encodes rendered frames into the home page's films and posters (needs ffmpeg on PATH).

  python apps/web/film/encode.py [--draft]

Desktop: HEVC, AV1 and H.264, in the order Tour.tsx tries them (HEVC is the smallest, and decoded in hardware where it
plays). Phones: a portrait cut from the centre of the frame, which is all a phone shows anyway, so it is sharper there
and a fraction of the size (HEVC at full crop size for iPhones, H.264 for the rest). Scrolling forward plays the video
(Tour.tsx), so sparse keyframes are enough: every 1/3 s on desktop (60 fps, g=20), every 1/2 s on phones (30 fps,
g=15); faststart lets the browser begin before the whole file is in.
Works on a partial render too: each rendered frame is held until the next one.
"""
import glob
import os
import subprocess
import sys
import tempfile

SRC = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "gharaana-film",
                   "frames-draft" if "--draft" in sys.argv else "frames-1080")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "tour")
CLEAN = "hqdn3d=1:1:4:4"  # a very light temporal denoise: takes the render's leftover grain, keeps the detail
# the grade: a little less contrast, colours that pop (vibrance, and the sky's blues and cyans pushed), a cool sky lift
GRADE = ("eq=contrast=0.9:brightness=0.01:gamma=1.03:saturation=1.08,vibrance=intensity=0.45,"
         "huesaturation=saturation=0.55:colors=c+b:strength=3,colorbalance=bh=0.06:rh=-0.02")
SHARP = "cas=strength=0.55"  # contrast-adaptive sharpening, after any scaling
MATTE = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "gharaana-film", "matte-0001.png")  # cutout.py
PHONE = "crop=608:1080:656:0"  # the centre 9:16 of the 1920x1080 frame at full resolution (Tour.tsx PHONE_CROP)
# 60 fps: RIFE (on the GPU) draws the in-between frames, so scrolling never steps through 24 fps frames
FPS_OUT = 60
def gop(fps, every):
    return ["-r", str(fps), "-g", str(every), "-keyint_min", str(every), "-sc_threshold", "0", "-movflags", "+faststart",
            "-an", "-pix_fmt", "yuv420p"]


GOP = gop(FPS_OUT, 20)
RIFE = (glob.glob(os.path.join(os.path.dirname(SRC), "rife", "*", "rife-ncnn-vulkan.exe")) or [None])[0]
H264 = ["-c:v", "libx264", "-preset", "veryslow", "-tune", "film", *GOP]
AV1 = ["-c:v", "libsvtav1", "-preset", "5", *GOP]
# the first desktop choice wherever the browser plays it (Safari on Macs, Chrome/Edge with hardware HEVC)
HEVC = ["-c:v", "libx265", "-preset", "slow", "-tag:v", "hvc1", "-x265-params", "log-level=error", *GOP]


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


rendered = {int(f[1:5]): f for f in os.listdir(SRC) if f.startswith("f") and f.endswith(".png")}
os.makedirs(OUT, exist_ok=True)
with tempfile.TemporaryDirectory(dir=os.path.dirname(SRC)) as seq:  # same drive as the frames, so hard links work
    last = None
    for n in range(1, max(rendered) + 1):
        last = rendered.get(n, last)
        os.link(os.path.join(SRC, last), os.path.join(seq, f"{n:04d}.png"))
    print(f"{len(rendered)} of {max(rendered)} frames rendered")
    frames = ["-framerate", "24", "-i", os.path.join(seq, "%04d.png")]
    if RIFE:  # 24 -> 60 fps, same 50 s: n = (frames - 1) * 60 / 24 + 1
        smooth = os.path.join(os.path.dirname(SRC), "frames-60")
        os.makedirs(smooth, exist_ok=True)
        for f in os.listdir(smooth):
            os.remove(os.path.join(smooth, f))
        n = (max(rendered) - 1) * FPS_OUT // 24 + 1
        subprocess.run([RIFE, "-i", seq, "-o", smooth, "-m", "rife-v4.6", "-n", str(n), "-f", "%05d.png"], check=True,
                       cwd=os.path.dirname(RIFE), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        frames = ["-framerate", str(FPS_OUT), "-i", os.path.join(smooth, "%05d.png")]
    DESK = f"{CLEAN},{GRADE},scale=1920:1080:flags=lanczos,{SHARP}"
    CUT = f"{CLEAN},{GRADE},{PHONE},{SHARP}"
    ffmpeg(*frames, "-vf", DESK, "-crf", "36", *AV1, os.path.join(OUT, "film-1080-av1.mp4"))
    ffmpeg(*frames, "-vf", DESK, "-crf", "26", *HEVC, os.path.join(OUT, "film-1080-hevc.mp4"))
    ffmpeg(*frames, "-vf", DESK, "-crf", "23", *H264, os.path.join(OUT, "film-1080.mp4"))
    # phones: 30 fps at 540x960 is plenty for a touch scroll, and keeps the download near 10 MB
    ffmpeg(*frames, "-vf", f"{CUT},scale=540:960:flags=lanczos,fps=30", "-crf", "26", "-c:v", "libx264", "-preset", "veryslow",
           "-tune", "film", *gop(30, 15), os.path.join(OUT, "film-phone.mp4"))
    # iPhones: HEVC decodes in hardware at about half H.264's size, so they get the crop's full 608x1080 for the same download
    ffmpeg(*frames, "-vf", f"{CUT},fps=30", "-crf", "28", "-c:v", "libx265", "-preset", "slow", "-tag:v", "hvc1",
           "-x265-params", "log-level=error", *gop(30, 15), os.path.join(OUT, "film-phone-hevc.mp4"))
    first = os.path.join(seq, "0001.png")
    webp = ["-c:v", "libwebp", "-quality", "70"]
    ffmpeg("-i", first, "-vf", DESK, *webp, os.path.join(OUT, "film-poster.webp"))
    ffmpeg("-i", first, "-vf", CUT, *webp, os.path.join(OUT, "film-poster-phone.webp"))
    if os.path.exists(MATTE):  # the blocks cut from frame 1, graded like the film, for the hero title to sit behind
        for name, fit in (("hero-cutout.webp", DESK), ("hero-cutout-phone.webp", CUT)):
            shape = fit.replace(f"{CLEAN},{GRADE},", "").replace(f",{SHARP}", "")
            ffmpeg("-i", first, "-i", MATTE, "-filter_complex", f"[0]{fit}[c];[1]format=gray,scale=1920:1080,{shape}[a];[c][a]alphamerge",
                   *webp, os.path.join(OUT, name))
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tone.py")], check=True)
for f in sorted(os.listdir(OUT)):
    print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1e6, 2), "MB")
