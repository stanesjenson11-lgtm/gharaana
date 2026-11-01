import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mullionTexture } from "./textures";
import { applyPbr, worldUv } from "./assets";

/* The Gharaana tower. Metres. Centred on the origin; the apartment we visit faces +z on floor 24. */

export const T = {
  a: 17, b: 13, n: 3.2, // superellipse footprint (half-width, half-depth, squareness)
  floors: 42, f2f: 3.4, base: 6, slab: 0.32,
  unit: 24, unitHalf: 7, // the apartment: floor 24, x in [-7, 7], front facade
  seg: 160,
};
export const floorY = (i: number) => T.base + i * T.f2f; // underside of slab i
export const UNIT_Y = floorY(T.unit) + T.slab; // finished floor of the apartment
export const CEIL_H = T.f2f - T.slab; // clear height
export const TOWER_TOP = floorY(T.floors) + T.slab;

type P = { x: number; z: number; nx: number; nz: number };

function raw(t: number) {
  const c = Math.cos(t), s = Math.sin(t), e = 2 / T.n;
  return [T.a * Math.sign(c) * Math.abs(c) ** e, T.b * Math.sign(s) * Math.abs(s) ** e] as const;
}
export function sp(t: number): P {
  const [x, z] = raw(t);
  const [x1, z1] = raw(t + 1e-4), [x0, z0] = raw(t - 1e-4);
  let nx = z1 - z0, nz = -(x1 - x0);
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  if (nx * x + nz * z < 0) { nx = -nx; nz = -nz; }
  return { x, z, nx, nz };
}
/** Depth of the facade glass at x on the front (+z) side. */
export const glassZ = (x: number) => T.b * (1 - Math.abs(x / T.a) ** T.n) ** (1 / T.n);

/** Balcony depth: ripples around the plan and drifts floor to floor, so the edges read as contour lines. */
const balcony = (t: number, i: number) => 1.2 + 1.2 * (0.5 + 0.5 * Math.sin(3 * t + i * 0.45));

const TS = Array.from({ length: T.seg }, (_, k) => (k / T.seg) * Math.PI * 2);
const BASE = TS.map(sp);
const ARC = (() => {
  const acc = [0];
  for (let k = 1; k <= T.seg; k++) {
    const p = BASE[k % T.seg], q = BASE[k - 1];
    acc.push(acc[k - 1] + Math.hypot(p.x - q.x, p.z - q.z));
  }
  return acc;
})();
export const PERIM = ARC[T.seg];

function outline(i: number, extra = 0) {
  return BASE.map((p, k) => {
    const d = i < 0 ? extra : balcony(TS[k], i) + extra;
    return { x: p.x + p.nx * d, z: p.z + p.nz * d };
  });
}

function slab(pts: { x: number; z: number }[], y: number, h: number) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** A vertical ribbon following a closed outline. */
function ribbon(pts: { x: number; z: number }[], y0: number, y1: number, skip?: (x: number, z: number) => boolean) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let v = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    if (skip?.((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
    pos.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z);
    uv.push(ARC[k] / PERIM, 0, ARC[k + 1] / PERIM, 0, ARC[k + 1] / PERIM, 1, ARC[k] / PERIM, 1);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2); // wound so normals face outward
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The glass skin for one floor band, with uv.v mapped to the floor (one mullion row per floor). */
function band(i: number, skip?: (x: number, z: number) => boolean) {
  const y0 = floorY(i) + T.slab, y1 = floorY(i + 1);
  const g = ribbon(BASE, y0, y1, skip);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setY(k, (i + uv.getY(k)) / T.floors);
  return g;
}

const inUnit = (x: number, z: number) => z > 0 && Math.abs(x) < T.unitHalf;

export function buildTower() {
  const cols = Math.round(PERIM / 1.5);
  const mullions = mullionTexture();
  mullions.wrapS = mullions.wrapT = THREE.RepeatWrapping;
  mullions.repeat.set(cols, T.floors);

  /** One set per half of the tower: the upper half fades on its own when the floors above lift away. */
  const makeMats = (fadeable: boolean) => {
    const concrete = new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.6, transparent: fadeable });
    applyPbr(concrete, "brushed_concrete", 1, { map: false, normal: true, rough: true, exterior: true }, 0.7);
    worldUv(concrete, 3);
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x9fb2c6, metalness: 0.55, roughness: 0.07, envMapIntensity: 1.25,
      map: mullions,
      clearcoat: 1, clearcoatRoughness: 0.05, transparent: fadeable,
    });
    const rail = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ec, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.8, roughness: 0.35, transparent: fadeable });
    return { concrete, glass, rail, metal };
  };
  const lo = makeMats(false), up = makeMats(true);
  const lobby = new THREE.MeshPhysicalMaterial({ color: 0x334250, metalness: 0.4, roughness: 0.1 });
  const brandYellow = new THREE.MeshStandardMaterial({ color: 0xffda1a, roughness: 0.45 });

  const lower = new THREE.Group(), upper = new THREE.Group();
  const lowS: THREE.BufferGeometry[] = [], upS: THREE.BufferGeometry[] = [];
  const lowG: THREE.BufferGeometry[] = [], upG: THREE.BufferGeometry[] = [];
  const lowR: THREE.BufferGeometry[] = [], upR: THREE.BufferGeometry[] = [];
  const lowM: THREE.BufferGeometry[] = [], upM: THREE.BufferGeometry[] = [];

  for (let i = 0; i <= T.floors; i++) {
    const roof = i === T.floors;
    const pts = roof ? outline(-1, 0.6) : outline(i);
    (i <= T.unit ? lowS : upS).push(slab(pts, floorY(i), T.slab));
    if (!roof && i >= 1) {
      const inner = pts.map((p, k) => ({ x: p.x - BASE[k].nx * 0.06, z: p.z - BASE[k].nz * 0.06 }));
      (i <= T.unit ? lowR : upR).push(ribbon(inner, floorY(i) + T.slab, floorY(i) + 1.38));
      (i <= T.unit ? lowM : upM).push(ribbon(inner, floorY(i) + 1.38, floorY(i) + 1.43));
    }
    if (!roof) (i <= T.unit ? lowG : upG).push(band(i, i === T.unit ? inUnit : undefined));
  }
  // Roof parapet and plant room.
  upR.push(ribbon(outline(-1, 0.55), TOWER_TOP, TOWER_TOP + 1.2));

  const add = (grp: THREE.Group, geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  add(lower, lowS, lo.concrete); add(upper, upS, up.concrete);
  add(lower, lowG, lo.glass); add(upper, upG, up.glass);
  add(lower, lowR, lo.rail, false); add(upper, upR, up.rail, false);
  add(lower, lowM, lo.metal); add(upper, upM, up.metal);
  add(upper, [slab(outline(-1, -7), TOWER_TOP, 4.2)], up.concrete);

  // Recessed lobby under the first slab, and the two yellow lines of the logo painted on the first two slab edges.
  lower.add(new THREE.Mesh(ribbon(outline(-1, -2), 0, T.base), lobby));
  const leds = [1, 2].map((i) => ribbon(outline(i, 0.02), floorY(i) + 0.1, floorY(i) + 0.22));
  lower.add(new THREE.Mesh(mergeGeometries(leds), brandYellow));

  // The apartment's own window: clear glass so we can fly through it.
  const unitGlassMat = new THREE.MeshPhysicalMaterial({ color: 0xe6f0f7, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  const unitGlass = new THREE.Mesh(band(T.unit, (x, z) => !inUnit(x, z)), unitGlassMat);
  lower.add(unitGlass);

  return { lower, upper, glasses: [lo.glass, up.glass], upperMats: collectMats(upper), unitGlass };
}

function collectMats(g: THREE.Object3D) {
  const out: { m: THREE.Material; base: number }[] = [];
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) out.push({ m, base: m.opacity });
  });
  return out;
}
