// Record the 3D tour's real camera path (ticks 0-110) frame by frame into one continuous video.
// Needs the site on :3125 (next start -p 3125). Usage: node record.mjs
//
// The page eases the camera into and out of each caption "hold"; on video that reads as a series of separate shots.
// So the recording undoes those holds and gives each stretch of the path its own length in seconds, with the speed
// blended smoothly across the joins (monotone cubic), so it plays as one continuous camera move.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KEYS } from "../components/world/path.ts";
import { openTour } from "./cdp.mjs";

const FPS = 24, W = 1280, H = 720;
// Where restyle.py cuts the video into AI segments, in ticks: moments the frame is naturally "passing through"
// something (cloud deck, the doorway, the ceiling, a cloud on the way down). The joined video dips to white there.
const CUT_TICKS = [18.5, 50.5, 65.65, 92];
// seconds for each stretch between KEYS (17 stretches for 18 keys); chosen so the gaps between the cuts stay under
// the 10 s the video model accepts per call
const SECS = [3.0, 3.0, 2.6, 2.3, 1.8, 1.6, 1.6, 1.5, 3.2, 2.4, 2.4, 2.4, 2.2, 2.6, 3.0, 3.6, 2.6];
if (SECS.length !== KEYS.length - 1) throw new Error("SECS must have one entry per stretch of KEYS");
const T = SECS.reduce((acc, s) => [...acc, acc[acc.length - 1] + s], [0]); // time of each key
export const DURATION = T[T.length - 1];

// Fritsch-Carlson monotone cubic through (T[k], k): key index as a smooth function of time
const n = KEYS.length, d = [], m = [];
for (let k = 0; k < n - 1; k++) d.push(1 / SECS[k]);
for (let k = 0; k < n; k++) m.push(k === 0 ? d[0] : k === n - 1 ? d[n - 2] : (d[k - 1] * d[k] > 0 ? 2 / (1 / d[k - 1] + 1 / d[k]) : 0));
function keyAt(t) {
  if (t <= 0) return 0;
  if (t >= DURATION) return n - 1;
  let k = 0;
  while (t > T[k + 1]) k++;
  const h = SECS[k], s = (t - T[k]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * k + (s3 - 2 * s2 + s) * h * m[k] + (-2 * s3 + 3 * s2) * (k + 1) + (s3 - s2) * h * m[k + 1];
}
// the tick that makes path.ts's eased cameraAt land on key position k (inverts its hold easing)
function tickAt(t) {
  const kk = Math.min(keyAt(t), n - 1 - 1e-9), i = Math.floor(kk), f = kk - i, a = KEYS[i], b = KEYS[i + 1];
  const x = a.hold && b.hold ? 0.5 - Math.sin(Math.asin(1 - 2 * f) / 3) : a.hold ? Math.sqrt(f) : b.hold ? 1 - Math.sqrt(1 - f) : f;
  return a.t + x * (b.t - a.t);
}
export const tickAtTime = tickAt;

/** First frame at or past each of CUT_TICKS: restyle.py cuts its segments exactly there. */
export function cutFrames() {
  const total = Math.round(DURATION * FPS);
  return CUT_TICKS.map((c) => { let f = 0; while (f < total && tickAt(f / FPS) < c) f++; return f; });
}

if (import.meta.main) {
  const DIR = join(import.meta.dirname, "videos"), FRAMES = join(DIR, "frames");
  const cuts = cutFrames(), bounds = [0, ...cuts, Math.round(DURATION * FPS)];
  const lengths = bounds.slice(1).map((b, i) => (b - bounds[i]) / FPS);
  console.log("cuts at", cuts.map((c) => (c / FPS).toFixed(2) + "s").join(", "), "| segments", lengths.map((l) => l.toFixed(2)).join(", "));
  if (lengths.some((l) => l > 9.9)) throw new Error("a segment is over 10 s; adjust SECS or CUT_TICKS");
  writeFileSync(join(DIR, "tour-3d.json"), JSON.stringify({ fps: FPS, frames: Math.round(DURATION * FPS) + 1, cuts }));
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const tour = await openTour({ url: "http://localhost:3125/?debug&quality=high", width: W, height: H, port: 9334 });
  try {
    // warm up every part of the path once so shader compiles and sky rebuilds don't land in the recording
    for (let t = 0; t <= 110; t += 5) await tour.setTick(t, 4);
    const total = Math.round(DURATION * FPS);
    for (let f = 0; f <= total; f++) {
      await tour.setTick(tickAt(f / FPS), 3);
      writeFileSync(join(FRAMES, `${String(f).padStart(5, "0")}.jpg`), await tour.shot());
      if (f % 120 === 0) console.log(`frame ${f}/${total}`);
    }
  } finally { tour.close(); }
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(FRAMES, "%05d.jpg"),
    "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", join(DIR, "tour-3d.mp4")]);
  rmSync(FRAMES, { recursive: true, force: true });
  console.log("wrote", join(DIR, "tour-3d.mp4"), `${DURATION.toFixed(1)} s`);
}
