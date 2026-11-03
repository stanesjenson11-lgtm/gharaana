// Record the 3D tour's real camera path (ticks 0-110) frame by frame into one continuous video.
// Needs the site on :3125 (pnpm build, then pnpm --filter web start -p 3125). Usage: node record.mjs
//
// The page eases the camera into and out of each caption "hold"; on video that reads as a series of separate shots.
// So the recording undoes those holds and gives each stretch of the path its own length in seconds, with the speed
// blended smoothly across the joins (monotone cubic), so it plays as one continuous camera move.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KEYS } from "../apps/web/components/world/path.ts";
import { openTour } from "./cdp.mjs";

const FPS = 24, W = 1920, H = 1080; // 1080p source: more fine detail for the photoreal pass to keep
// Where restyle.py starts each new AI segment, in seconds: calm moments of the camera move (orbit, approach,
// living-room hold, plan hold, start of the final tilt). Each segment after the first also gets CONTEXT seconds of
// the previous segment's finished footage prepended, and the model accepts at most 10 s per call.
// (the first three are unchanged so segments 1-3 stay valid; then one seam while rising straight down over the flat
// and one at the top view, after the roof is back so the last segment starts from a complete tower)
const SEAMS = [9.5, 12.7, 20.6, 28.9, 37.3];
export const CONTEXT = 1.5;
// seconds for each stretch between KEYS (17 stretches for 18 keys)
// The first ten (up to the living room, tick 63) must not change: segments 1-3 were made from those frames.
const SECS = [3.0, 3.0, 2.6, 2.3, 1.8, 1.6, 1.6, 1.5, 3.2, 2.4, 2.4, 2.4, 2.0, 2.4, 2.4, 3.0, 2.8, 3.2, 2.0];
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

/** Frame index of each seam: restyle.py starts a new segment there. */
export function cutFrames() {
  return SEAMS.map((s) => Math.round(s * FPS));
}

if (import.meta.main) {
  const DIR = join(import.meta.dirname, "videos"), FRAMES = join(DIR, "frames");
  const cuts = cutFrames(), bounds = [0, ...cuts, Math.round(DURATION * FPS)];
  const lengths = bounds.slice(1).map((b, i) => (b - bounds[i]) / FPS);
  console.log("seams at", cuts.map((c) => (c / FPS).toFixed(2) + "s").join(", "), "| new seconds per segment", lengths.map((l) => l.toFixed(2)).join(", "));
  // what each call sends: first segment alone, the rest with CONTEXT prepended
  if (lengths.some((l, i) => l + (i ? CONTEXT : 0) > 9.9)) throw new Error("a call would exceed 10 s; adjust SEAMS");
  writeFileSync(join(DIR, "tour-3d.json"), JSON.stringify({ fps: FPS, frames: Math.round(DURATION * FPS) + 1, cuts, context: CONTEXT }));
  // the page's scroll position is in ticks; the video's speed per tick varies, so the site maps tick -> frame with this
  const ticks = Array.from({ length: Math.round(DURATION * FPS) + 1 }, (_, f) => +tickAt(f / FPS).toFixed(3));
  writeFileSync(join(import.meta.dirname, "..", "apps", "web", "public", "tour-timing.json"), JSON.stringify({ fps: FPS, ticks }));
  // FROM=n: re-render only frames n+ and keep the earlier ones from the current tour-3d.mp4
  // FROM=n KEEP=1: resume an interrupted recording; frames below n are already in videos/frames
  const FROM = +(process.env.FROM ?? 0);
  if (!process.env.KEEP) {
    rmSync(FRAMES, { recursive: true, force: true });
    mkdirSync(FRAMES, { recursive: true });
    if (FROM) execFileSync("ffmpeg", ["-v", "error", "-i", join(DIR, "tour-3d.mp4"), "-frames:v", String(FROM),
      "-start_number", "0", "-q:v", "2", join(FRAMES, "%05d.jpg")]);
  }
  const tour = await openTour({ url: "http://localhost:3125/?debug&quality=high&mode=3d&record", width: W, height: H, port: 9334 });
  try {
    // warm up every part of the path once so shader compiles and sky rebuilds don't land in the recording
    for (let t = 0; t <= 110; t += 5) await tour.setTick(t, 4);
    const total = Math.round(DURATION * FPS);
    const TO = Math.min(total, +(process.env.TO ?? total)); // TO=n (with KEEP=1): stop after frame n, keep the rest
    for (let f = FROM; f <= TO; f++) {
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
