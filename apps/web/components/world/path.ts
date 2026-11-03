import * as THREE from "three";

/*
 * One continuous camera move, keyed in the same "ticks" as the page (0-110).
 * hold: ease into and out of the key so captions get a beat to read.
 */
type Key = { t: number; p: [number, number, number]; q: [number, number, number]; fov: number; hold?: boolean };

export const KEYS: Key[] = [
  { t: 0, p: [-96, 178, 214], q: [0, 132, 0], fov: 38 }, // above the clouds, the crown breaks through
  { t: 8, p: [-84, 160, 200], q: [0, 122, 0], fov: 38 },
  { t: 15, p: [-40, 118, 236], q: [0, 100, 0], fov: 38 }, // through the cloud deck
  { t: 22, p: [38, 76, 252], q: [0, 74, 0], fov: 38, hold: true }, // the whole tower
  { t: 31, p: [96, 80, 206], q: [0, 76, 0], fov: 38, hold: true },
  { t: 38, p: [36, 96, 72], q: [0, 90, 12], fov: 38 }, // closer: the balconies
  { t: 44, p: [6, 90.6, 34], q: [0, 89.4, 13], fov: 40 }, // one window
  { t: 48, p: [1.1, 89.5, 17.2], q: [0.4, 89.2, 10], fov: 46 }, // through the middle of the sliding door
  { t: 51, p: [0.9, 89.4, 12.3], q: [-0.6, 89.0, 7.6], fov: 54 }, // through the glass
  { t: 58, p: [0.4, 89.6, 12.35], q: [-4.2, 88.45, 9.2], fov: 60, hold: true }, // the living room
  { t: 63, p: [0.2, 89.8, 11.9], q: [-2.0, 88.4, 7.6], fov: 58 },
  // one crane move from the room to the plan: rise toward ceiling height while tilting down (the ceiling never enters
  // the frame), then straight up; the ceiling and floors above are removed while out of view (LIGHT.upper)
  { t: 66, p: [-1.2, 90.5, 11.2], q: [-2.4, 87.92, 9.4], fov: 56 }, // 2.6 m up, looking down at the living area
  { t: 69, p: [-1.5, 94, 10.2], q: [-1.5, 87.9, 10.1], fov: 54 }, // straight down: wall tops become the cutaway
  { t: 72, p: [-1.0, 100, 9.0], q: [-1.0, 87.9, 8.9], fov: 50 }, // the whole flat
  { t: 76, p: [0, 118, 3], q: [0, 87.9, 2.9], fov: 46, hold: true }, // the whole floor as a plan: this flat and its neighbours
  { t: 82, p: [0, 200, 25], q: [0, 0, 24.5], fov: 44 },
  { t: 90, p: [0, 560, 62], q: [0, 0, 61], fov: 42, hold: true }, // the neighbourhood, tower complete again
  // back down to exactly where the film began (t0): same camera, same light and haze, so the last frame matches the first
  { t: 96, p: [-50, 380, 200], q: [0, 90, 20], fov: 40 },
  { t: 104, p: [-92, 182, 206], q: [0, 132, 0], fov: 38, hold: true }, // settling into the opening view
  { t: 110, p: [-96, 178, 214], q: [0, 132, 0], fov: 38 }, // = the t0 key
];

const pos = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.p)), false, "centripetal");
const tgt = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.q)), false, "centripetal");

export function cameraAt(tick: number, outP: THREE.Vector3, outQ: THREE.Vector3) {
  const n = KEYS.length;
  let i = 0;
  while (i < n - 2 && tick >= KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let f = Math.min(1, Math.max(0, (tick - a.t) / (b.t - a.t)));
  if (a.hold && b.hold) f = f * f * (3 - 2 * f);
  else if (a.hold) f = f * f; // leave a hold slowly
  else if (b.hold) f = 1 - (1 - f) * (1 - f); // settle into a hold
  const u = (i + f) / (n - 1);
  pos.getPoint(u, outP);
  tgt.getPoint(u, outQ);
  return a.fov + (b.fov - a.fov) * f;
}

/** Piecewise-linear lookup in a [tick, value] table. */
export function pw(table: [number, number][], t: number) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const [t0, v0] = table[i - 1], [t1, v1] = table[i];
      const k = (t - t0) / (t1 - t0);
      const s = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * s;
    }
  }
  return table[table.length - 1][1];
}

export const LIGHT = {
  // morning sun from behind the camera, high over the room, then back to the opening's morning light at the end
  sunElev: [[0, 15], [22, 18], [44, 22], [66, 24], [90, 34], [98, 18], [104, 15], [110, 15]] as [number, number][],
  sunAzim: [[0, 48], [44, 40], [66, 40], [90, 30], [104, 48], [110, 48]] as [number, number][],
  // no golden end: the tour returns to the opening view in the same light, so the last frame matches the first
  golden: [[0, 0]] as [number, number][],
  // indoors gets far less sky light than outdoors, so sun patches and lamps read
  ambient: [[0, 1], [47, 1], [51, 0.38], [64, 0.38], [69, 0.8], [80, 0.8], [86, 1]] as [number, number][],
  // a light haze, not a white sheet: thick mist only half-covers dark trees and cars, which read as specks
  mist: [[0, 0.5], [12, 0.5], [22, 0], [96, 0], [106, 0.5]] as [number, number][],
  lowClouds: [[0, 1], [14, 1], [21, 0], [96, 0], [106, 1]] as [number, number][],
  skyClouds: [[0, 1], [76, 1], [80, 0], [94, 0], [99, 1]] as [number, number][],
  birds: [[0, 0]] as [number, number][], // kept off; birds will be overlaid later
  beams: [[0, 0], [47, 0], [51, 1], [63, 1], [66, 0]] as [number, number][],
  exposure: [[0, 1.0], [46, 1.0], [50.5, 1.45], [64, 1.45], [70, 1.15], [80, 1.15], [86, 1.0]] as [number, number][],
  // floors 25+ (and the ceiling) vanish at t66.5 while the camera already looks down (out of frame); as the camera rises
  // above the tower the roof closes back over the plan (about 1 s, tower half to a third of the frame), so every high
  // view shows a real, covered rooftop; nothing lifts
  lift: [[0, 0]] as [number, number][],
  upper: [[0, 1], [66.4, 1], [66.6, 0], [82.3, 0], [83.6, 1]] as [number, number][],
  ao: [[0, 4], [46, 4], [50, 0.7], [80, 0.7], [86, 4]] as [number, number][],
  pins: [[0, 0], [86, 0], [88.5, 1], [94.5, 1], [96.5, 0]] as [number, number][],
  // the flat's window: facade glass from afar, clearing as we arrive (1 = facade look), then the door slides open
  windowCover: [[0, 1], [40, 1], [46, 0], [86, 0], [90, 1]] as [number, number][],
  doorOpen: [[0, 0], [45.5, 0], [49.5, 1], [86, 1], [90, 0]] as [number, number][],
};
