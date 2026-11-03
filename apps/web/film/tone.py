"""Writes, for every frame, whether the film is dark behind the nav logo, so the page can switch it to white there.

  python apps/web/film/tone.py   (encode.py runs it too)

ffmpeg averages the logo's patch of each rendered frame down to one grey pixel: one for the desktop film (the logo sits
top-left of the full frame) and one for the phone cut (top-left of the centre 9:16 crop, after its cover crop on a phone).
A short median and a little hysteresis stop the logo flickering where the film hovers around the threshold.
"""
import glob
import json
import os
import subprocess
import tempfile

ROOT = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "gharaana-film")
FILM_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "components", "tour", "film.json")
PATCH = {"desk": "crop=240:60:60:20", "phone": "crop=225:43:735:27"}  # x, y of the logo in the 1920x1080 frame


def tones(frames, crop, dark=140, band=10):
    # 140 of 255: the busy aerial city reads as dark to the eye, so the wordmark is white there; bright rooms get black
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-framerate", "24", "-i", frames,
                          "-vf", f"{crop},scale=1:1:flags=area,format=gray", "-f", "rawvideo", "-"],
                         check=True, capture_output=True).stdout
    lum = [sorted(raw[max(0, i - 3):i + 4])[len(raw[max(0, i - 3):i + 4]) // 2] for i in range(len(raw))]
    out, state = [], lum[0] < dark
    for v in lum:
        if state and v > dark + band:
            state = False
        elif not state and v < dark - band:
            state = True
        out.append("D" if state else "L")
    # a switch that would last under ~0.75 s is just a blink: fold it into what surrounds it
    i = 0
    while i < len(out):
        j = i
        while j < len(out) and out[j] == out[i]:
            j += 1
        if j - i < 18 and i > 0:
            out[i:j] = [out[i - 1]] * (j - i)
        i = j
    return "".join(out)


if __name__ == "__main__":
    with open(FILM_JSON, encoding="utf-8") as f:
        film = json.load(f)
    # every frame 1..1201: frames-1080 first, then any set-aside frames-1080-* folder (a partial re-render still measures)
    dirs = [os.path.join(ROOT, "frames-1080")] + sorted(glob.glob(os.path.join(ROOT, "frames-1080-*")))
    with tempfile.TemporaryDirectory(dir=ROOT) as seq:
        last = None
        for n in range(1, film["frames"] + 1):
            last = next((p for d in dirs if os.path.exists(p := os.path.join(d, f"f{n:04d}.png"))), last)
            os.link(last, os.path.join(seq, f"{n:04d}.png"))
        film["logo"] = {k: tones(os.path.join(seq, "%04d.png"), c) for k, c in PATCH.items()}
    # frame 1 is the hero (the film holds it under the title): white there, whatever the patch measures
    film["logo"] = {k: "D" + v[1:] for k, v in film["logo"].items()}
    with open(FILM_JSON, "w", encoding="utf-8") as f:
        json.dump(film, f, separators=(",", ":"))
    for k, s in film["logo"].items():
        print(k, len(s), "frames,", s.count("D"), "dark")
