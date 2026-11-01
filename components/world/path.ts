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
  { t: 48, p: [0.8, 89.5, 17.2], q: [0, 89.2, 10], fov: 46 },
  { t: 51, p: [0.2, 89.4, 12.3], q: [-0.6, 89.0, 7.6], fov: 54 }, // through the glass
  { t: 58, p: [0.4, 89.6, 12.35], q: [-4.2, 88.45, 9.2], fov: 60, hold: true }, // the living room
  { t: 63, p: [0.2, 89.8, 11.9], q: [-2.0, 88.4, 7.6], fov: 58 },
  { t: 69, p: [0.2, 99, 8.6], q: [0, 87.9, 8.5], fov: 52 }, // up through the ceiling
  { t: 76, p: [0, 106, 8.2], q: [0, 87.9, 8.1], fov: 46, hold: true }, // the same flat, as a plan
  { t: 82, p: [0, 190, 30], q: [0, 0, 29.5], fov: 44 },
  { t: 90, p: [0, 560, 62], q: [0, 0, 61], fov: 42, hold: true }, // the neighbourhood, tower in the middle
  { t: 96, p: [-150, 330, 400], q: [0, 70, 30], fov: 40 },
  { t: 104, p: [-158, 96, 236], q: [-34, 86, 0], fov: 40, hold: true }, // evening
  { t: 110, p: [-142, 92, 214], q: [-34, 86, 0], fov: 40 },
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
  // morning sun from behind the camera, high over the room, then low and golden at sunset (the tour ends there)
  sunElev: [[0, 15], [22, 18], [44, 22], [66, 24], [90, 34], [97, 18], [103, 8], [110, 6]] as [number, number][],
  sunAzim: [[0, 48], [44, 40], [66, 40], [90, 30], [100, 66], [110, 72]] as [number, number][],
  golden: [[0, 0], [96, 0], [104, 1]] as [number, number][],
  // indoors gets far less sky light than outdoors, so sun patches and lamps read
  ambient: [[0, 1], [47, 1], [51, 0.38], [64, 0.38], [69, 0.8], [80, 0.8], [86, 1]] as [number, number][],
  mist: [[0, 1], [12, 1], [22, 0]] as [number, number][],
  lowClouds: [[0, 1], [14, 1], [21, 0]] as [number, number][],
  skyClouds: [[0, 1], [76, 1], [80, 0], [94, 0], [99, 1]] as [number, number][],
  birds: [[0, 1], [16, 1], [21, 0]] as [number, number][],
  beams: [[0, 0], [47, 0], [51, 1], [63, 1], [66, 0]] as [number, number][],
  exposure: [[0, 1.0], [46, 1.0], [50.5, 1.45], [64, 1.45], [70, 1.15], [80, 1.15], [86, 1.0], [98, 1.0], [104, 1.25], [110, 1.3]] as [number, number][],
  lift: [[0, 0], [63, 0], [68, 1], [84, 1], [90, 0]] as [number, number][],
  upper: [[0, 1], [63.5, 1], [67, 0], [85, 0], [89.5, 1]] as [number, number][],
  ao: [[0, 4], [46, 4], [50, 0.7], [80, 0.7], [86, 4]] as [number, number][],
  pins: [[0, 0], [86, 0], [88.5, 1], [94.5, 1], [96.5, 0]] as [number, number][],
};
