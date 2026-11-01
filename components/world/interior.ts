import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "@/lib/geo";
import { CEIL_H, T, UNIT_Y, glassZ, sp } from "./tower";
import { leafTexture, marbleTexture, printTexture, rugTexture, tileTexture, woodTexture } from "./textures";
import { applyPbr, loadModel, preparePbr, worldUv } from "./assets";

/*
 * Floor 24: the apartment we fly into, plus the rest of the floor plate so the top-down view reads as a real plan.
 * Local coordinates: y = 0 is the finished floor. The apartment spans x in [-7, 7], z from the back wall (3) to the glass (~13).
 */

const BACK = 3, SPLIT = 7.4, W = T.unitHalf;

/** Direction the sunlight travels while we're inside (must match LIGHT.sunElev / sunAzim around tick 46-66). */
export const INTERIOR_SUN = { elev: 22, azim: 40 };

export function buildFloor() {
  const g = new THREE.Group();
  g.position.y = UNIT_Y;
  const ceilingBits = new THREE.Group();
  g.add(ceilingBits);

  /* ---- materials: procedural first, real Poly Haven surfaces swap in as they load ---- */
  const wood = woodTexture();
  wood.repeat.set(0.36, 0.36);
  const M = {
    wall: new THREE.MeshStandardMaterial({ color: 0xe8e6e2, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.5, envMapIntensity: 0.9 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe4e1db, roughness: 0.8 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 1 }),
    navy: new THREE.MeshStandardMaterial({ color: 0x1d3b6c, roughness: 0.95 }),
    sun: new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.95 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x1560bd, roughness: 0.9 }),
    marble: new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.16 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.55, roughness: 0.4 }),
    oak: new THREE.MeshStandardMaterial({ map: wood.clone(), color: 0x9b7a5c, roughness: 0.5 }),
    lacquer: new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.3 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb48f55, metalness: 1, roughness: 0.28 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xf5f5f3, roughness: 0.95 }),
    duvet: new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 1 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.08 }),
    pot: new THREE.MeshStandardMaterial({ color: 0x8f8d88, roughness: 0.85 }),
    leaf: new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
    rug: new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }),
    tiles: new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.25 }),
    print: new THREE.MeshStandardMaterial({ map: printTexture(), roughness: 0.8 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.7, roughness: 0.35 }),
    shade: new THREE.MeshStandardMaterial({ color: 0xfff3dd, emissive: 0xffcf8a, emissiveIntensity: 1.6, side: THREE.DoubleSide }),
    spot: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 2.5 }),
    sheer: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 1, side: THREE.DoubleSide, depthWrite: false }),
  };
  worldUv(M.oak, 1.4);
  worldUv(M.wall, 2.2);
  // Real surfaces are fetched with the furniture (when the tour starts), not on arrival; their map slots exist from
  // the start so nothing recompiles when they land.
  const ALL = { map: true, normal: true, rough: true };
  preparePbr(M.oak, ALL); preparePbr(M.floor, ALL);
  preparePbr(M.wall, { normal: true, rough: true }, 0.5); preparePbr(M.fabric, { normal: true, rough: true }, 0.8);
  preparePbr(M.rug, { normal: true }, 0.7);
  const dress = () => {
    M.oak.color.set(0xffffff);
    applyPbr(M.oak, "oak_veneer_01", 1);
    applyPbr(M.floor, "herringbone_parquet", 0.55);
    applyPbr(M.wall, "painted_plaster_wall", 1, { map: false, normal: true, rough: true }, 0.5);
    applyPbr(M.fabric, "rough_linen", 2.5, { map: false, normal: true, rough: true }, 0.8);
    applyPbr(M.rug, "velour_velvet", 3, { map: false, normal: true, rough: false }, 0.7);
  };

  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const group = (x = 0, z = 0, ry = 0) => { const o = new THREE.Group(); o.position.set(x, 0, z); o.rotation.y = ry; g.add(o); return o; };
  const rb = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
  const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const wall = (x0: number, z0: number, x1: number, z1: number, t = 0.14) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    put(bx(len, CEIL_H, t), M.wall, (x0 + x1) / 2, CEIL_H / 2, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0));
  };

  /* ---- floor plate: the whole level, then the apartment's parquet on top ---- */
  const plateShape = new THREE.Shape(Array.from({ length: 160 }, (_, k) => { const p = sp((k / 160) * Math.PI * 2); return new THREE.Vector2(p.x, -p.z); }));
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), M.plate);
  plate.rotation.x = -Math.PI / 2; plate.position.y = 0.002; plate.receiveShadow = true;
  g.add(plate);

  const front = Array.from({ length: 41 }, (_, k) => { const x = W - (k / 40) * 2 * W; return new THREE.Vector2(x, -(glassZ(x) - 0.05)); });
  const unitShape = new THREE.Shape([new THREE.Vector2(-W, -BACK), new THREE.Vector2(W, -BACK), ...front]);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(unitShape), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.006; floor.receiveShadow = true;
  g.add(floor);
  const bath = new THREE.Mesh(new THREE.PlaneGeometry(3.2, SPLIT - BACK), M.tiles);
  bath.rotation.x = -Math.PI / 2; bath.position.set(0, 0.01, (BACK + SPLIT) / 2); bath.receiveShadow = true;
  g.add(bath);

  /* ---- walls ---- */
  wall(-W, BACK, W, BACK);
  wall(-W, BACK, -W, glassZ(W) - 0.05);
  wall(W, BACK, W, glassZ(W) - 0.05);
  wall(-W, SPLIT, -3.45, SPLIT); wall(-2.55, SPLIT, -0.45, SPLIT); wall(0.45, SPLIT, 2.55, SPLIT); wall(3.45, SPLIT, W, SPLIT);
  wall(-1.6, BACK, -1.6, SPLIT); wall(1.6, BACK, 1.6, SPLIT);
  // skirting along the living-room walls
  put(bx(2 * W, 0.08, 0.02), M.lacquer, 0, 0.04, SPLIT + 0.08);

  /* ---- the rest of the floor: core and four neighbouring flats ---- */
  put(bx(9, CEIL_H, 5.6), new THREE.MeshStandardMaterial({ color: 0xbdbab3, roughness: 0.9 }), 0, CEIL_H / 2, -0.2);
  wall(-W, BACK, -W, -glassZ(W)); wall(W, BACK, W, -glassZ(W));
  wall(-T.a, 0, -W, 0); wall(W, 0, T.a, 0);
  wall(-W, -3, W, -3);
  for (const [x, z, ry] of [[-12, 6.5, 0], [12, 6.5, 0], [-12, -6.5, Math.PI], [12, -6.5, Math.PI], [0, -8.5, Math.PI]] as const) {
    put(rb(1.8, 0.5, 2.1, 0.08), M.linen, x - 1.8, 0.25, z, ry);
    put(rb(2.4, 0.75, 0.95, 0.12), M.fabric, x + 1.6, 0.38, z + (ry ? 1.5 : -1.5), ry);
  }

  /* ---- window wall: mullions, transom and sill (they cast the striped sun patches) ---- */
  for (let x = -W + 1.4; x < W - 0.5; x += 1.4) {
    put(bx(0.05, CEIL_H, 0.09), M.frame, x, CEIL_H / 2, glassZ(x) - 0.03, Math.atan(-(glassZ(x + 0.01) - glassZ(x - 0.01)) / 0.02));
  }
  put(bx(2 * W, 0.07, 0.1), M.frame, 0, CEIL_H - 0.04, glassZ(0) - 0.08);
  put(bx(2 * W, 0.06, 0.18), M.frame, 0, 0.03, glassZ(0) - 0.12);

  /* ---- living: sofa facing the view, rug, coffee table, chairs, lamp, print ---- */
  put(new THREE.PlaneGeometry(3.8, 2.7), M.rug, -3.8, 0.012, 10.0).rotation.x = -Math.PI / 2;
  const sofa = group(-3.8, 8.3);
  put(rb(3.0, 0.42, 1.05, 0.06), M.fabric, 0, 0.29, 0, 0, sofa);
  put(rb(3.0, 0.5, 0.24, 0.1), M.fabric, 0, 0.72, -0.42, 0, sofa);
  put(rb(1.42, 0.16, 0.86, 0.07), M.fabric, -0.72, 0.56, 0.06, 0, sofa);
  put(rb(1.42, 0.16, 0.86, 0.07), M.fabric, 0.72, 0.56, 0.06, 0, sofa);
  put(rb(0.24, 0.62, 1.05, 0.1), M.fabric, -1.5, 0.39, 0, 0, sofa);
  put(rb(0.24, 0.62, 1.05, 0.1), M.fabric, 1.5, 0.39, 0, 0, sofa);
  put(rb(0.5, 0.44, 0.14, 0.07), M.sun, -0.95, 0.85, -0.22, 0.18, sofa).rotation.x = -0.2;
  put(rb(0.46, 0.42, 0.14, 0.07), M.navy, 0.9, 0.84, -0.22, -0.15, sofa).rotation.x = -0.2;
  put(rb(0.9, 0.04, 0.7, 0.02), M.linen, 1.0, 0.66, 0.18, 0.3, sofa).rotation.z = 0.05; // a throw
  for (const sx of [-1.4, 1.4]) put(bx(0.05, 0.08, 0.9), M.black, sx, 0.04, 0, 0, sofa);

  const fbCoffee = group();
  put(new THREE.CylinderGeometry(0.58, 0.58, 0.045, 48), M.marble, -3.8, 0.4, 9.85, 0, fbCoffee);
  put(new THREE.CylinderGeometry(0.16, 0.22, 0.38, 24), M.black, -3.8, 0.19, 9.85, 0, fbCoffee);

  const fbChair = group(-1.25, 10.2, -2.2);
  put(rb(0.85, 0.4, 0.8, 0.08), M.navy, 0, 0.3, 0, 0, fbChair);
  put(rb(0.85, 0.5, 0.18, 0.08), M.navy, 0, 0.7, -0.34, 0, fbChair);

  put(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 32), M.black, -5.65, 0.015, 7.95);
  put(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 8), M.brass, -5.65, 0.79, 7.95);
  put(new THREE.CylinderGeometry(0.17, 0.25, 0.32, 32, 1, true), M.shade, -5.65, 1.62, 7.95);
  const lamp = new THREE.PointLight(0xffc489, 40, 9, 2); lamp.position.set(-5.65, 1.55, 7.95); g.add(lamp);

  put(bx(1.7, 1.05, 0.04), M.print, -3.8, 1.75, SPLIT + 0.1);
  put(bx(1.78, 1.13, 0.03), M.frame, -3.8, 1.75, SPLIT + 0.085);

  /* ---- plants by the glass (stand-ins until the real ones load) ---- */
  const fbPlants = group();
  const plant = (x: number, z: number, s = 1) => {
    put(new THREE.CylinderGeometry(0.26 * s, 0.2 * s, 0.5 * s, 24), M.pot, x, 0.25 * s, z, 0, fbPlants);
    const r = rng(Math.round(x * 100 + z * 7) + 1000);
    for (let k = 0; k < 22; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.34 * s, 0.68 * s), M.leaf);
      const a = r() * Math.PI * 2, h = 0.6 + r() * 1.2;
      leaf.position.set(x + Math.cos(a) * 0.22 * s, h * s, z + Math.sin(a) * 0.22 * s);
      leaf.rotation.set(-0.5 - r() * 0.6, a, (r() - 0.5) * 0.6);
      leaf.castShadow = true;
      fbPlants.add(leaf);
    }
  };
  plant(-6.3, 12.0, 1.1);
  plant(6.3, 12.05, 1);

  /* ---- dining ---- */
  put(bx(2.1, 0.05, 0.95), M.oak, 1.7, 0.75, 10.5);
  for (const [lx, lz] of [[-0.95, -0.38], [0.95, -0.38], [-0.95, 0.38], [0.95, 0.38]]) put(bx(0.05, 0.73, 0.05), M.black, 1.7 + lx, 0.365, 10.5 + lz);
  for (const [cx, cz, ry] of [[1.05, 9.8, 0], [2.35, 9.8, 0], [1.05, 11.2, Math.PI], [2.35, 11.2, Math.PI], [0.35, 10.5, Math.PI / 2], [3.05, 10.5, -Math.PI / 2]] as const) {
    const c = group(cx, cz, ry);
    put(rb(0.46, 0.05, 0.44, 0.02), M.oak, 0, 0.46, 0, 0, c);
    put(rb(0.46, 0.42, 0.04, 0.02), M.oak, 0, 0.7, -0.21, 0, c);
    for (const [lx, lz] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) put(bx(0.03, 0.46, 0.03), M.black, lx, 0.23, lz, 0, c);
  }
  const fbPendant = new THREE.Group(); ceilingBits.add(fbPendant);
  put(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 6), M.black, 1.7, CEIL_H - 0.45, 10.5, 0, fbPendant);
  put(new THREE.SphereGeometry(0.24, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.shade, 1.7, CEIL_H - 0.95, 10.5, 0, fbPendant).rotation.x = Math.PI;
  const pendant = new THREE.PointLight(0xffd29a, 30, 7, 2); pendant.position.set(1.7, CEIL_H - 1.05, 10.5); g.add(pendant);

  /* ---- kitchen ---- */
  put(rb(1.0, 0.9, 2.5, 0.02), M.lacquer, 5.0, 0.45, 9.6);
  put(bx(1.08, 0.04, 2.58), M.marble, 5.0, 0.92, 9.6);
  for (const sz of [8.9, 9.6, 10.3]) {
    put(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), M.oak, 4.25, 0.7, sz);
    put(new THREE.CylinderGeometry(0.015, 0.015, 0.68, 8), M.black, 4.25, 0.34, sz);
  }
  put(bx(0.64, 0.9, 2.4), M.lacquer, W - 0.38, 0.45, 10.0);
  put(bx(0.68, 0.04, 2.44), M.marble, W - 0.38, 0.92, 10.0);
  put(bx(0.64, 2.5, 1.2), M.lacquer, W - 0.38, 1.25, 8.2);
  put(bx(0.02, 0.6, 2.4), M.marble, W - 0.06, 1.25, 10.0);
  put(bx(0.4, 0.05, 0.35), M.black, W - 0.4, 0.95, 10.4);
  put(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), M.brass, W - 0.5, 1.1, 10.4);

  /* ---- bedrooms and bath ---- */
  for (const sx of [-1, 1]) {
    const bxp = sx * 4.3;
    put(rb(1.9, 0.32, 2.15, 0.05), M.oak, bxp, 0.16, BACK + 1.2);
    put(rb(1.8, 0.24, 2.0, 0.08), M.linen, bxp, 0.42, BACK + 1.22);
    put(rb(1.84, 0.08, 1.35, 0.04), M.duvet, bxp, 0.57, BACK + 1.6);
    put(rb(0.62, 0.14, 0.4, 0.07), M.linen, bxp - 0.42, 0.6, BACK + 0.45);
    put(rb(0.62, 0.14, 0.4, 0.07), M.linen, bxp + 0.42, 0.6, BACK + 0.45);
    put(bx(2.1, 1.1, 0.06), M.oak, bxp, 0.6, BACK + 0.1);
    for (const nx of [-1.25, 1.25]) put(rb(0.45, 0.5, 0.4, 0.03), M.lacquer, bxp + nx, 0.25, BACK + 0.32);
    put(bx(0.6, 2.4, 2.2), M.lacquer, sx * (W - 0.38), 1.2, BACK + 2.2);
  }
  put(rb(1.65, 0.55, 0.78, 0.12), M.ceramic, 0, 0.275, BACK + 0.48);
  put(rb(0.5, 0.82, 1.2, 0.03), M.lacquer, 1.32, 0.41, 5.6);
  put(rb(0.4, 0.12, 0.5, 0.06), M.ceramic, 1.3, 0.88, 5.6);
  put(rb(0.4, 0.42, 0.62, 0.15), M.ceramic, -1.3, 0.21, 5.4);

  /* ---- sheer curtains at the edges of the glass ---- */
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.9, CEIL_H - 0.08, 12, 1), M.sheer);
    const pos = c.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 18) * 0.05);
    c.geometry.computeVertexNormals();
    c.position.set(sx * (W - 0.55), (CEIL_H - 0.08) / 2, glassZ(W - 0.55) - 0.25);
    g.add(c);
  }

  /* ---- plaster ceiling and recessed lights (hidden when the floors above lift away) ---- */
  const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(unitShape), M.wall);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = CEIL_H - 0.005;
  ceiling.receiveShadow = true;
  ceilingBits.add(ceiling);
  for (const [x, z] of [[-4.8, 9.3], [-2.6, 9.3], [-4.8, 11.3], [-2.6, 11.3], [4.6, 8.6], [4.6, 10.6], [-4.3, 5.2], [4.3, 5.2], [0, 5.2]]) {
    put(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16), M.spot, x, CEIL_H - 0.01, z, 0, ceilingBits).castShadow = false;
  }

  /* ---- sunlight: soft shafts through each pane, and dust drifting in them ---- */
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - INTERIOR_SUN.elev), THREE.MathUtils.degToRad(INTERIOR_SUN.azim));
  const ray = sun.clone().negate();
  const L = (CEIL_H - 0.1) / -ray.y; // until the top of the window reaches the floor
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let v = 0;
  for (let x = -W + 0.7; x < W - 0.3; x += 1.4) {
    for (const dx of [-0.35, 0, 0.35]) {
      const z0 = glassZ(x + dx) - 0.1;
      const a = [x + dx, 0.15, z0], b = [x + dx, CEIL_H - 0.1, z0];
      const c = [b[0] + ray.x * L, b[1] + ray.y * L, b[2] + ray.z * L];
      const d = [a[0] + ray.x * L * 0.06, a[1] + ray.y * L * 0.06, a[2] + ray.z * L * 0.06];
      pos.push(...a, ...b, ...c, ...d);
      const k = dx === 0 ? 0.11 : 0.06;
      col.push(1, 0.92, 0.78, k * 0.4, 1, 0.92, 0.78, k, 1, 0.88, 0.7, 0, 1, 0.88, 0.7, 0);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  beamGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  beamGeo.setIndex(idx);
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 1, toneMapped: false, fog: false });
  const beams = new THREE.Mesh(beamGeo, beamMat);
  beams.renderOrder = 2;
  g.add(beams);

  const dustN = 420, dr = rng(55);
  const dustPos = new Float32Array(dustN * 3), dustBase = new Float32Array(dustN * 3);
  for (let k = 0; k < dustN; k++) {
    const t = dr() * 0.8, x = -W + 0.5 + dr() * (2 * W - 1), y = 0.3 + dr() * (CEIL_H - 0.5);
    const z = glassZ(x) - 0.3 + ray.z * t * L * 0.9;
    dustBase.set([x + ray.x * t * L * 0.9, y, z], k * 3);
  }
  dustPos.set(dustBase);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xfff1d8, size: 0.012, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  g.add(dust);

  function update(time: number, light: number) {
    beams.visible = dust.visible = light > 0.01;
    beamMat.opacity = light;
    dustMat.opacity = 0.8 * light;
    if (!dust.visible) return;
    for (let k = 0; k < dustN; k++) {
      const p = k * 3, ph = k * 1.37;
      dustPos[p] = dustBase[p] + Math.sin(time * 0.13 + ph) * 0.25;
      dustPos[p + 1] = dustBase[p + 1] + Math.sin(time * 0.09 + ph * 2.1) * 0.18;
      dustPos[p + 2] = dustBase[p + 2] + Math.cos(time * 0.11 + ph) * 0.22;
    }
    dustGeo.getAttribute("position").needsUpdate = true;
  }

  /* ---- real furniture from Poly Haven: placed when loaded, stand-ins hidden ---- */
  async function furnish(compile: (o: THREE.Object3D) => Promise<unknown>) {
    dress();
    const fit = (o: THREE.Object3D, height?: number) => {
      const box = new THREE.Box3().setFromObject(o);
      if (height) o.scale.multiplyScalar(height / (box.max.y - box.min.y));
      box.setFromObject(o);
      o.position.y -= box.min.y;
      return box;
    };
    // top surface in room coordinates (the floor group sits at UNIT_Y in the world)
    const top = (o: THREE.Object3D) => { o.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(o).max.y - g.position.y; };
    const at = (o: THREE.Object3D, x: number, z: number, ry: number, parent: THREE.Object3D = g) => {
      o.rotation.y = ry;
      const wrap = new THREE.Group();
      wrap.add(o);
      fit(o);
      wrap.position.set(x, 0, z);
      parent.add(wrap);
      return wrap;
    };
    const face = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
    const load = (id: string) => loadModel(id).catch(() => null);

    const [table, lounge, arm, plantA, plantB, vase, lampM, cabinet, frame, pillows, bowl, wine] = await Promise.all([
      load("coffee_table_round_01"), load("mid_century_lounge_chair"), load("modern_arm_chair_01"),
      load("potted_plant_02"), load("potted_plant_04"), load("ceramic_vase_01"),
      load("modern_ceiling_lamp_01"), load("modern_wooden_cabinet"), load("standing_picture_frame_01"),
      load("throw_pillows_01"), load("wooden_bowl_01"), load("wine_bottles_01"),
    ]);
    await Promise.all([table, lounge, arm, plantA, plantB, vase, lampM, cabinet, frame, pillows, bowl, wine].filter((m): m is THREE.Group => !!m).map(compile));
    if (pillows) at(pillows, -3.8, 8.42, 0).position.y = 0.6;
    if (bowl) at(bowl, 1.55, 10.45, 0.3).position.y = 0.775;
    if (wine) at(wine, W - 0.42, 10.75, -Math.PI / 2).position.y = 0.94;

    if (table) {
      const t = at(table, -3.8, 9.85, 0);
      fbCoffee.visible = false;
      if (vase) { const v2 = vase.clone(); at(v2, -3.62, 9.78, 0.4).position.y = top(t); }
    }
    if (lounge) { at(lounge, -1.55, 10.75, face(-1.55, 10.75, -3.8, 9.6)); fbChair.visible = false; }
    if (arm) at(arm, -6.05, 10.75, face(-6.05, 10.75, -3.8, 9.6));
    if (plantA) {
      fit(plantA, 1.35);
      at(plantA, -6.25, 12.0, 0.6);
      fbPlants.visible = false;
    }
    if (plantB) {
      fit(plantB, 0.8);
      at(plantB, 6.3, 12.05, 0);
      const small = plantB.clone(); fit(small, 0.55); at(small, 5.0, 10.6, 1.2).position.y = 0.94;
    }
    if (lampM) {
      const wrap = at(lampM, 1.7, 10.5, 0, ceilingBits);
      wrap.position.y = CEIL_H - (top(wrap) - wrap.position.y);
      fbPendant.visible = false;
    }
    if (cabinet) {
      const c = at(cabinet, 1.55, SPLIT + 0.32, 0);
      const ct = top(c);
      if (frame) at(frame, 1.15, SPLIT + 0.3, 0.15).position.y = ct;
      if (vase) at(vase, 2.05, SPLIT + 0.32, 0).position.y = ct;
    }
  }

  // ~200 static pieces become one mesh per material: far fewer draw calls (and shadow-pass calls)
  mergeStatic(g, new Set<THREE.Object3D>([ceilingBits, fbCoffee, fbChair, fbPlants, fbPendant]));

  // ponytail: two point lights only; every lit pixel in the city pays for each light, so kitchen and bedrooms rely on daylight
  return { group: g, ceilingBits, lights: [lamp, pendant], shades: [M.shade, M.spot], update, furnish };
}

/** Merges every static, opaque mesh under root into one mesh per material (skipping the groups in keep). */
function mergeStatic(root: THREE.Group, keep: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    for (let p = m.parent; p && p !== root; p = p.parent) if (keep.has(p)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent) return;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(toRoot.clone().multiply(m.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") geo.deleteAttribute(k);
    if (!geo.attributes.uv || !geo.attributes.normal) return;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(geo);
    merged.push(m);
  });
  for (const m of merged) m.removeFromParent();
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
}
