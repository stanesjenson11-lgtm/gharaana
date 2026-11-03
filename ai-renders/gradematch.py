# Match an image's (or video frames') colour grading to a reference: mean and spread of each Lab channel are mapped onto
# the reference's (Reinhard-style transfer). Used so the last shot ends on exactly the opening frame's grade.
# Usage: python gradematch.py <in.jpg> <reference.jpg> <out.jpg> [strength 0..1]
import sys
import numpy as np
from PIL import Image, ImageCms

_SRGB = ImageCms.createProfile("sRGB")
_LAB = ImageCms.createProfile("LAB")
_TO_LAB = ImageCms.buildTransformFromOpenProfiles(_SRGB, _LAB, "RGB", "LAB")
_TO_RGB = ImageCms.buildTransformFromOpenProfiles(_LAB, _SRGB, "LAB", "RGB")

def to_lab(img):
    # Pillow stores L as 0..255 and a/b as signed bytes; read a/b through an int8 view
    raw = np.asarray(ImageCms.applyTransform(img.convert("RGB"), _TO_LAB), dtype=np.uint8)
    lab = raw.astype(np.float32)
    lab[..., 1:] = raw[..., 1:].view(np.int8).astype(np.float32)
    return lab

def from_lab(lab):
    raw = np.empty(lab.shape, dtype=np.uint8)
    raw[..., 0] = np.clip(lab[..., 0], 0, 255).astype(np.uint8)
    raw[..., 1:] = np.clip(lab[..., 1:], -128, 127).astype(np.int8).view(np.uint8)
    return ImageCms.applyTransform(Image.fromarray(raw, "LAB"), _TO_RGB)

def stats(img):
    lab = to_lab(img).reshape(-1, 3)
    return lab.mean(0), lab.std(0) + 1e-6

def apply(img, src, ref, strength=1.0):
    """Map img from the src (mean, std) grade to the ref grade; strength blends between original (0) and full match (1)."""
    lab = to_lab(img)
    matched = (lab - src[0]) / src[1] * ref[1] + ref[0]
    return from_lab(lab + (matched - lab) * strength)

def even_out(src, window):
    """Per-frame Lab (mean, std) of a video and the same stats averaged over `window` frames: brightness and colour then
    change only slowly, like one camera, instead of jumping where separately generated pieces meet."""
    import subprocess
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-vf", "scale=320:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    small = np.frombuffer(raw, np.uint8).reshape(-1, 180, 320, 3)
    s = [stats(Image.fromarray(f)) for f in small]
    m, d = np.array([x[0] for x in s]), np.array([x[1] for x in s])
    k, pad = np.ones(window) / window, window // 2
    smooth = lambda v: np.stack([np.convolve(np.pad(v[:, c], pad, mode="edge"), k, mode="valid") for c in range(3)], 1)
    M, D = smooth(m), smooth(d)
    return m, d, M, np.clip(D, d * 0.87, d * 1.15)  # spread changes stay gentle so contrast never pumps

def match_video(src, ref_path, out, ramp_from, ramp_to, window=61):
    """Even out lighting across the whole video (see even_out, ~2.5 s window), then grade the end toward a reference
    frame. The end correction is measured on the (evened) LAST frame, the shot that must look like the reference, and
    applied to every frame from ramp_from on, fading in until ramp_to, so the approach shifts together. Audio is copied."""
    import subprocess
    w, h = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                    "-of", "csv=p=0:s=x", str(src)], capture_output=True, text=True, check=True).stdout.strip().split("x"))
    fps = eval(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                               "-of", "csv=p=0", str(src)], capture_output=True, text=True, check=True).stdout.strip())
    m, d, M, D = even_out(src, window)
    src_stats = (M[-1], D[-1])
    ref_stats = stats(Image.open(ref_path).convert("RGB").resize((w, h)))
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(src), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps),
                            "-i", "-", "-i", str(src), "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "16", "-preset", "slow",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
    n, size = 0, w * h * 3
    while (buf := dec.stdout.read(size)) and len(buf) == size:
        t = n / fps
        k = 0.0 if t < ramp_from else min(1.0, (t - ramp_from) / max(1e-6, ramp_to - ramp_from))
        i = min(n, len(m) - 1)
        lab = to_lab(Image.frombytes("RGB", (w, h), buf))
        lab = (lab - m[i]) / d[i] * D[i] + M[i]  # evened lighting
        if k: lab = lab + ((lab - src_stats[0]) / src_stats[1] * ref_stats[1] + ref_stats[0] - lab) * k
        enc.stdin.write(from_lab(lab).tobytes())
        n += 1
    enc.stdin.close(); dec.wait(); enc.wait()
    if enc.returncode: raise RuntimeError("grade-matched encode failed")
    print(f"evened the lighting of {src} and graded its end toward {ref_path}: {n} frames, ramp {ramp_from}-{ramp_to}s")

if __name__ == "__main__":
    src_path, ref_path, out_path = sys.argv[1:4]
    strength = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    img, ref = Image.open(src_path), Image.open(ref_path)
    s, r = stats(img), stats(ref)
    apply(img, s, r, strength).save(out_path, quality=92)
    after = stats(Image.open(out_path))
    print("Lab mean before", np.round(s[0], 1), "after", np.round(after[0], 1), "reference", np.round(r[0], 1))
