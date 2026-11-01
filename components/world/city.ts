import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { rng } from "@/lib/geo";
import { applyPbr, loadModel, worldUv } from "./assets";
import { buildTrees } from "./trees";

/*
 * The neighbourhood around the tower (which stands at the origin on its own plaza).
 * Streets every 150 m. A park to the north-east, a river to the south (the apartment looks out over it),
 * and a cluster of taller towers to the north that rises out of the morning mist.
 */

export const PITCH = 150, ROAD = 18, HALF = (PITCH - ROAD) / 2;
const RANGE = 7; // blocks each way
export const PARK = { x: 150, z: -150 };
export const RIVER = { z0: 262, z1: 338 };
export const POOL = { x: 0, z: 40 };

const isRiverRow = (j: number) => j === 2;

/** Facade shader in world space: windows and floor bands for concrete, mullions and panels for glass. */
function facadeMaterial(kind: "concrete" | "glass") {
  const m = kind === "glass"
    ? new THREE.MeshStandardMaterial({ color: 0x9db1c4, metalness: 0.82, roughness: 0.1, envMapIntensity: 1.15 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying vec3 vInstC;\nvarying float vInstTop;")
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 wpos = vec4(transformed, 1.0);
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wpos = instanceMatrix * wpos;
          wn = mat3(instanceMatrix) * wn;
        #endif
        vWPos = (modelMatrix * wpos).xyz;
        vWNorm = normalize(mat3(modelMatrix) * wn);
        vInstC = vec3(0.0);
        vInstTop = 1e5;
        #ifdef USE_INSTANCING
          vInstC = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
          vInstTop = vInstC.y + length(instanceMatrix[1].xyz);
        #endif`,
      );
    const common = `#include <common>
      varying vec3 vWPos;
      varying vec3 vWNorm;
      varying vec3 vInstC;
      varying float vInstTop;
      float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`;
    const facade = kind === "glass"
      ? `vec3 wN = normalize(vWNorm);
        float side = 1.0 - step(0.6, abs(wN.y));
        float hc = abs(wN.x) > abs(wN.z) ? vWPos.z : vWPos.x;
        vec2 rc = vWPos.xz - vInstC.xz;
        if (abs(wN.x) > 0.2 && abs(wN.z) > 0.2) hc = atan(rc.y, rc.x) * length(rc);
        vec2 cell = vec2(hc / 1.6, vWPos.y / 3.6);
        vec2 fc = fract(cell);
        float mull = side * (1.0 - step(0.05, fc.x) * step(fc.x, 0.95));
        float band = side * (1.0 - step(0.16, fc.y));
        float pane = side * (1.0 - max(mull, band));
        vec3 pid = vec3(floor(cell), floor(vWPos.x / 50.0) + floor(vWPos.z / 50.0) * 7.0);
        float tint = h31(pid);
        diffuseColor.rgb *= mix(1.0, 0.82 + 0.3 * tint, pane);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.18, 0.21), max(mull, band) * 0.9);
        float roof = step(0.6, wN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.51, 0.52), roof);`
      : `vec3 wN = normalize(vWNorm);
        float side = 1.0 - step(0.5, abs(wN.y));
        float hc = abs(wN.x) > abs(wN.z) ? vWPos.z : vWPos.x;
        vec2 cell = vec2(hc / 2.8, vWPos.y / 3.4);
        vec2 fc = fract(cell);
        float upper = step(4.4, vWPos.y) * (1.0 - step(vInstTop - 1.1, vWPos.y));
        float pane = side * upper * step(0.16, fc.x) * step(fc.x, 0.84) * step(0.26, fc.y) * step(fc.y, 0.86);
        float frame = side * upper * (1.0 - pane) * step(0.12, fc.x) * step(fc.x, 0.88) * step(0.22, fc.y) * step(fc.y, 0.9);
        float band = side * (1.0 - step(0.08, fc.y)) * step(4.0, vWPos.y);
        float shop = side * (1.0 - step(4.0, vWPos.y)) * step(0.5, vWPos.y) * step(0.04, fract(hc / 6.0)) * step(fract(hc / 6.0), 0.96);
        float parapet = side * step(vInstTop - 0.9, vWPos.y);
        vec3 pid = vec3(floor(cell), floor(wN.x * 3.0 + wN.z * 7.0) + floor(vWPos.x / 40.0) * 13.0 + floor(vWPos.z / 40.0) * 29.0);
        float tint = h31(pid);
        // glass: dark with a hint of what's inside; some panes have curtains or half-drawn blinds
        vec3 glassC = vec3(0.1, 0.13, 0.17) + 0.03 * tint;
        float curtain = step(0.9, tint);
        float blind = step(0.8, tint) * (1.0 - curtain) * step(1.0 - (tint - 0.8) * 8.0, fc.y);
        glassC = mix(glassC, vec3(0.72, 0.68, 0.6), curtain * 0.8);
        glassC = mix(glassC, vec3(0.8, 0.79, 0.76), blind * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, glassC, pane);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, frame);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.09, 0.11), shop * 0.92);
        diffuseColor.rgb *= 1.0 + band * 0.08 + parapet * 0.1;`;
    const glassRough = kind === "glass"
      ? "roughnessFactor = mix(roughnessFactor, 0.05 + 0.12 * tint, pane);\nroughnessFactor = mix(roughnessFactor, 0.85, roof);"
      : "roughnessFactor = mix(roughnessFactor, 0.06 + 0.3 * (curtain + blind), pane);\nroughnessFactor = mix(roughnessFactor, 0.05, shop);";
    const glassMetal = kind === "glass"
      ? "metalnessFactor = mix(metalnessFactor, 0.0, roof);"
      : "metalnessFactor = mix(metalnessFactor, 0.6 * (1.0 - curtain - blind), pane);\nmetalnessFactor = mix(metalnessFactor, 0.7, shop);";
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", common)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${facade}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${glassRough}`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\n${glassMetal}`);
  };
  m.customProgramCacheKey = () => `facade-${kind}`;
  return m;
}

const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), V0 = new THREE.Vector3(), V1 = new THREE.Vector3();
const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => M4.compose(V0.set(x, y, z), Q0, V1.set(sx, sy, sz)).clone();

/* Hand-placed skyline north of the tower: [block i, block j, height, form] */
const SKYLINE: [number, number, number, "step" | "cyl" | "spire" | "twin"][] = [
  [-1, -1, 150, "cyl"], [1, -2, 192, "step"], [2, -1, 168, "twin"], [2, -2, 226, "spire"], [3, -1, 136, "step"],
  [0, -2, 176, "cyl"], [-2, -2, 150, "step"], [3, -3, 210, "step"], [1, -4, 184, "spire"], [4, -2, 158, "cyl"],
  [-1, -3, 140, "step"], [2, 0, 124, "step"], [-2, 0, 118, "cyl"], [0, -4, 198, "step"], [-3, -2, 132, "step"],
];

export function buildCity(q: { leafCards: number; treeReach: number }) {
  const group = new THREE.Group();
  const r = rng(101);

  /* ---- ground: asphalt everywhere, raised paving per block ---- */
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x6a6e74, roughness: 0.95 });
  applyPbr(asphalt, "asphalt_02", 1, { map: true, normal: true, rough: true, exterior: true });
  worldUv(asphalt, 7);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const paving = new THREE.MeshStandardMaterial({ color: 0xd8d5ce, roughness: 0.9 });
  applyPbr(paving, "concrete_pavement", 1, { map: true, normal: true, rough: true, exterior: true });
  worldUv(paving, 4);
  const grass = new THREE.MeshStandardMaterial({ color: 0x8aa765, roughness: 1 });
  applyPbr(grass, "leafy_grass", 1, { map: true, normal: true, rough: false, exterior: true });
  worldUv(grass, 5);
  const water = new THREE.MeshPhysicalMaterial({ color: 0x1b3a54, roughness: 0.04, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.6 });

  const blocks: { i: number; j: number }[] = [];
  for (let i = -RANGE; i <= RANGE; i++) for (let j = -RANGE; j <= RANGE; j++) if (!isRiverRow(j)) blocks.push({ i, j });
  const curb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), paving, blocks.length);
  blocks.forEach((b, k) => curb.setMatrixAt(k, place(b.i * PITCH, 0.1, b.j * PITCH, HALF * 2, 0.2, HALF * 2)));
  curb.receiveShadow = true;
  group.add(curb);

  // Lane markings and zebra crossings.
  const dash = document.createElement("canvas"); dash.width = 64; dash.height = 4;
  const dg = dash.getContext("2d")!; dg.fillStyle = "#fff"; dg.fillRect(0, 0, 36, 4);
  const dashTex = new THREE.CanvasTexture(dash); dashTex.wrapS = THREE.RepeatWrapping; dashTex.repeat.set(220, 1);
  const lineMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, opacity: 0.65, color: 0xe8e8e8 });
  const lines: THREE.BufferGeometry[] = [];
  for (let k = -RANGE; k < RANGE; k++) {
    const c = k * PITCH + PITCH / 2;
    if (c < RIVER.z0 || c > RIVER.z1) lines.push(new THREE.PlaneGeometry(2 * RANGE * PITCH, 0.25).rotateX(-Math.PI / 2).translate(0, 0.03, c));
    lines.push(new THREE.PlaneGeometry(0.25, 2 * RANGE * PITCH).rotateX(-Math.PI / 2).translate(c, 0.03, 0));
  }
  group.add(new THREE.Mesh(mergeGeometries(lines), lineMat));
  const zebra: THREE.BufferGeometry[] = [];
  for (let a = -3; a < 3; a++) for (let b = -3; b < 2; b++) {
    const cx = a * PITCH + PITCH / 2, cz = b * PITCH + PITCH / 2;
    for (let s = -7; s <= 7; s += 1.6) {
      zebra.push(new THREE.PlaneGeometry(0.8, 4).rotateX(-Math.PI / 2).translate(cx + s, 0.035, cz - ROAD / 2 - 3));
      zebra.push(new THREE.PlaneGeometry(4, 0.8).rotateX(-Math.PI / 2).translate(cx - ROAD / 2 - 3, 0.035, cz + s));
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(zebra), new THREE.MeshBasicMaterial({ color: 0xe6e6e6, transparent: true, opacity: 0.75 })));

  /* ---- buildings ---- */
  type Box = { x: number; y: number; z: number; w: number; h: number; d: number; c?: THREE.Color };
  const concreteBoxes: Box[] = [], glassBoxes: Box[] = [], glassCyl: Box[] = [], roofBoxes: Box[] = [], spires: Box[] = [];
  // real-city facade palette: concrete greys, limestone, sandstone, a little brick
  const tones = [0xb9b5ad, 0xc9c2b4, 0xd2c3a6, 0xa9aaa8, 0xc4b59a, 0xa8806a, 0xd8d4cc, 0x9c9c98].map((c) => new THREE.Color(c));
  const glassTones = [0xa6b8ca, 0x93a8bd, 0xb4c3d1, 0x8aa0b3].map((c) => new THREE.Color(c));
  const skyline = new Map(SKYLINE.map((s) => [`${s[0]},${s[1]}`, s]));
  const roofUnits = (x: number, top: number, z: number, w: number, d: number) => {
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) roofBoxes.push({ x: x + (r() - 0.5) * w * 0.5, y: top, z: z + (r() - 0.5) * d * 0.5, w: 3 + r() * 6, h: 2 + r() * 3, d: 3 + r() * 5 });
  };

  for (const b of blocks) {
    const cx = b.i * PITCH, cz = b.j * PITCH;
    if (b.i === 0 && b.j === 0) continue; // the tower's plaza
    if (cx === PARK.x && cz === PARK.z) continue;
    const sk = skyline.get(`${b.i},${b.j}`);
    if (sk) {
      const [, , h, form] = sk;
      const gc = glassTones[Math.floor(r() * glassTones.length)];
      concreteBoxes.push({ x: cx, y: 0.2, z: cz, w: 96, h: 12, d: 84, c: tones[3] });
      if (form === "cyl") {
        glassCyl.push({ x: cx, y: 12, z: cz, w: 38, h: h - 12, d: 38, c: gc });
        roofUnits(cx, h, cz, 16, 16);
      } else if (form === "twin") {
        glassBoxes.push({ x: cx - 22, y: 12, z: cz, w: 30, h: h - 12, d: 34, c: gc });
        glassBoxes.push({ x: cx + 24, y: 12, z: cz + 6, w: 28, h: h * 0.82 - 12, d: 30, c: gc });
      } else {
        const w = 38 + r() * 8, d = 32 + r() * 6;
        glassBoxes.push({ x: cx, y: 12, z: cz, w, h: h * 0.62, d, c: gc });
        glassBoxes.push({ x: cx, y: 12 + h * 0.62, z: cz, w: w * 0.82, h: h * 0.26, d: d * 0.82, c: gc });
        glassBoxes.push({ x: cx, y: 12 + h * 0.88, z: cz, w: w * 0.6, h: h * 0.12 - 12, d: d * 0.6, c: gc });
        if (form === "spire") spires.push({ x: cx, y: h, z: cz, w: 1.2, h: 46, d: 1.2 });
        else roofUnits(cx, h, cz, w * 0.6, d * 0.6);
      }
      continue;
    }
    const dist = Math.hypot(cx, cz);
    const n = 2 + Math.floor(r() * 2);
    for (let a = 0; a < n; a++) for (let c = 0; c < 2; c++) {
      if (r() < 0.1) continue;
      const lw = (HALF * 2) / n, ld = HALF;
      const w = lw * (0.66 + r() * 0.26), d = ld * (0.66 + r() * 0.26);
      const hMax = dist < 200 ? 40 : dist < 500 ? 72 : 96;
      const h = 14 + r() * (hMax - 14);
      const x = cx - HALF + lw * (a + 0.5), z = cz - HALF / 2 + c * HALF + (c ? 2 : -2);
      const glass = r() < 0.22 && h > 34;
      const tone = glass ? glassTones[Math.floor(r() * glassTones.length)] : tones[Math.floor(r() * tones.length)];
      if (h > 30 && r() < 0.6) {
        // podium + set-back body
        concreteBoxes.push({ x, y: 0.2, z, w, h: 8, d, c: tones[Math.floor(r() * tones.length)] });
        (glass ? glassBoxes : concreteBoxes).push({ x, y: 8.2, z, w: w * 0.8, h: h - 8, d: d * 0.8, c: tone });
        roofUnits(x, h + 0.2, z, w * 0.8, d * 0.8);
      } else {
        (glass ? glassBoxes : concreteBoxes).push({ x, y: 0.2, z, w, h, d, c: tone });
        roofUnits(x, h + 0.2, z, w, d);
      }
    }
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 40).translate(0, 0.5, 0);
  const concrete = facadeMaterial("concrete");
  applyPbr(concrete, "brushed_concrete", 1, { map: false, normal: true, rough: false, exterior: true }, 0.6);
  worldUv(concrete, 6);
  const glass = facadeMaterial("glass");
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9d0d8, metalness: 0.9, roughness: 0.25 });
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Box[], round = false) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, k) => {
      m.setMatrixAt(k, place(b.x, b.y, b.z, round ? b.w / 2 : b.w, b.h, round ? b.d / 2 : b.d));
      if (b.c) m.setColorAt(k, b.c);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  inst(unitBox, concrete, concreteBoxes);
  inst(unitBox, glass, glassBoxes);
  inst(unitCyl, glass, glassCyl, true);
  inst(unitBox, roofMat, roofBoxes);
  inst(new THREE.CylinderGeometry(0.4, 1, 1, 12).translate(0, 0.5, 0), steel, spires);

  /* ---- the tower's plaza: lawns, a reflecting pool on the river side ---- */
  for (const [x, z] of [[-44, -44], [44, -44], [-44, 44], [44, 44]]) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(34, 0.3, 34), grass);
    lawn.position.set(x, 0.2, z); lawn.receiveShadow = true; group.add(lawn);
  }
  const pool = new THREE.Mesh(new THREE.BoxGeometry(44, 0.3, 12), water);
  pool.position.set(POOL.x, 0.22, POOL.z); pool.receiveShadow = true; group.add(pool);

  /* ---- the park: lawn, pond, winding paths ---- */
  const park = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.32, HALF * 2), grass);
  park.position.set(PARK.x, 0.2, PARK.z); park.receiveShadow = true; group.add(park);
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 48), water);
  pond.scale.set(26, 1, 16); pond.position.set(PARK.x + 18, 0.24, PARK.z + 14); group.add(pond);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xe2dccf, roughness: 0.95 });
  for (const pts of [
    [[-66, 40], [-30, 20], [0, -10], [30, -30], [66, -40]],
    [[-40, -66], [-20, -30], [-25, 10], [-10, 50], [10, 66]],
  ]) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(PARK.x + x, 0.38, PARK.z + z)));
    const path = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 1.8, 6, false), pathMat);
    path.scale.y = 0.05; path.position.y = 0.36; path.receiveShadow = true;
    group.add(path);
  }

  /* ---- the river with promenades ---- */
  const river = new THREE.Mesh(new THREE.PlaneGeometry(RANGE * 2 * PITCH + 400, RIVER.z1 - RIVER.z0), water);
  river.rotation.x = -Math.PI / 2; river.position.set(0, -0.6, (RIVER.z0 + RIVER.z1) / 2); group.add(river);
  for (const z of [RIVER.z0 - 6, RIVER.z1 + 6]) {
    const prom = new THREE.Mesh(new THREE.BoxGeometry(RANGE * 2 * PITCH + 400, 0.5, 12), grass);
    prom.position.set(0, 0.25, z); prom.receiveShadow = true; group.add(prom);
  }

  /* ---- trees: two or three overlapping crowns each ---- */
  const spots: [number, number, number][] = [];
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2, rad = 54 + (k % 2) * 4;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (Math.abs(x) < 26 && z > 30 && z < 52) continue;
    spots.push([x, z, 3.4 + r() * 1.2]);
  }
  for (let k = 0; k < 130; k++) {
    const x = PARK.x + (r() - 0.5) * 124, z = PARK.z + (r() - 0.5) * 124;
    if (Math.hypot((x - PARK.x - 18) / 30, (z - PARK.z - 14) / 20) < 1) continue;
    spots.push([x, z, 3 + r() * 2.8]);
  }
  for (let k = -RANGE * 2; k <= RANGE * 2; k++) for (const z of [RIVER.z0 - 6, RIVER.z1 + 6]) spots.push([k * 52 + r() * 8, z, 3 + r()]);
  const inRiver = (z: number) => z > RIVER.z0 - 10 && z < RIVER.z1 + 10;
  for (let k = -4; k < 4; k++) {
    const road = k * PITCH + PITCH / 2;
    for (let s = -600; s <= 600; s += 22) {
      if (Math.abs((((s % PITCH) + PITCH) % PITCH) - PITCH / 2) < 14) continue;
      for (const side of [-1, 1]) {
        const off = road + side * (ROAD / 2 + 2.2);
        if (!inRiver(road)) spots.push([s, off, 2.4 + r() * 0.9]);
        if (!inRiver(s)) spots.push([off, s, 2.4 + r() * 0.9]);
      }
    }
  }
  // far street trees are sub-pixel on small screens: the tier decides how far out they go
  const trees = buildTrees(spots.filter(([x, z]) => Math.hypot(x, z) < q.treeReach), q.leafCards);
  group.add(trees.group);

  /* ---- street lights (off: the tour ends at sunset) ---- */
  const lampsPos: [number, number][] = [];
  for (let k = -RANGE; k < RANGE; k++) {
    const road = k * PITCH + PITCH / 2;
    for (let s = -RANGE * PITCH; s <= RANGE * PITCH; s += 36) {
      if (!inRiver(road)) lampsPos.push([s, road + ROAD / 2 - 0.6]);
      if (!inRiver(s)) lampsPos.push([road + ROAD / 2 - 0.6, s]);
    }
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.4 });
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 8, 6), lampMat, lampsPos.length);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.6, roughness: 0.5 }), lampsPos.length);
  lampsPos.forEach(([x, z], k) => { lamps.setMatrixAt(k, place(x, 6.1, z, 1, 1, 1)); poles.setMatrixAt(k, place(x, 0, z, 1, 1, 1)); });
  group.add(lamps, poles);

  /* ---- traffic ---- */
  type Car = { axis: "x" | "z"; road: number; lane: number; s: number; v: number; min: number; max: number };
  const cars: Car[] = [];
  for (let k = -3; k < 3; k++) {
    const road = k * PITCH + PITCH / 2;
    for (let n = 0; n < 14; n++) {
      const dir = n % 2 ? 1 : -1;
      if (!inRiver(road)) cars.push({ axis: "x", road, lane: dir * 2.6, s: -560 + r() * 1120, v: dir * (9 + r() * 6), min: -560, max: 560 });
      cars.push({ axis: "z", road, lane: -dir * 2.6, s: -560 + r() * 780, v: dir * (9 + r() * 6), min: -560, max: RIVER.z0 - 30 });
    }
  }
  const carPaint = [0xf2f2f2, 0x1d1f22, 0x8d9299, 0x1560bd, 0xc9ccd1, 0x5c1f1f, 0x2d3b4f].map((c) => new THREE.Color(c));
  const body = new THREE.InstancedMesh(new RoundedBoxGeometry(4.4, 1.0, 1.9, 2, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.3 }), cars.length);
  const cabin = new THREE.InstancedMesh(new RoundedBoxGeometry(2.4, 0.7, 1.7, 2, 0.25), new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.4, roughness: 0.15 }), cars.length);
  cars.forEach((_, k) => body.setColorAt(k, carPaint[Math.floor(r() * carPaint.length)]));
  body.castShadow = true;
  group.add(body, cabin);
  const yaw = new THREE.Quaternion(), carM = new THREE.Matrix4(), off = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  function updateCars(dt: number) {
    cars.forEach((c, k) => {
      c.s += c.v * dt;
      if (c.s > c.max) c.s = c.min; else if (c.s < c.min) c.s = c.max;
      const x = c.axis === "x" ? c.s : c.road + c.lane, z = c.axis === "x" ? c.road + c.lane : c.s;
      const heading = c.axis === "x" ? (c.v > 0 ? 0 : Math.PI) : (c.v > 0 ? -Math.PI / 2 : Math.PI / 2);
      yaw.setFromAxisAngle(V1.set(0, 1, 0), heading);
      carM.compose(V0.set(x, 0.75, z), yaw, one);
      body.setMatrixAt(k, carM);
      cabin.setMatrixAt(k, off.makeTranslation(-0.3, 0.75, 0).premultiply(carM));
    });
    body.instanceMatrix.needsUpdate = cabin.instanceMatrix.needsUpdate = true;
  }
  updateCars(0);

  /* ---- the plaza, close up: real street lamps and shrubs (Poly Haven), desktop only ---- */
  async function furnish(compile: (o: THREE.Object3D) => Promise<unknown>) {
    const load = (id: string) => loadModel(id).catch(() => null);
    const [lamp, shrub] = await Promise.all([load("street_lamp_02"), load("shrub_02")]);
    // every copy of a model shares one draw call per sub-mesh
    const props = new THREE.Group();
    const instance = (src: THREE.Object3D, spots: THREE.Matrix4[]) => {
      src.updateMatrixWorld(true);
      src.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const im = new THREE.InstancedMesh(m.geometry, m.material, spots.length);
        spots.forEach((p, k) => im.setMatrixAt(k, p.clone().multiply(m.matrixWorld)));
        im.castShadow = im.receiveShadow = true;
        props.add(im);
      });
    };
    const at = (x: number, z: number, ry: number, s = 1) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, 0.3, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    if (lamp) instance(lamp, Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2 + 0.26; return at(Math.cos(a) * 62, Math.sin(a) * 62, -a); }));
    if (shrub) {
      const r2 = rng(313);
      const spots: THREE.Matrix4[] = [];
      for (const [cx, cz] of [[-44, -44], [44, -44], [-44, 44], [44, 44]]) {
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          spots.push(at(cx + Math.cos(a) * 15.5, cz + Math.sin(a) * 15.5, r2() * 6, 1.4 + r2() * 0.8));
        }
      }
      instance(shrub, spots);
    }
    await compile(props);
    group.add(props);
  }

  return { group, updateCars, updateTrees: trees.update, furnish, reflective: [concrete, glass, water] };
}
