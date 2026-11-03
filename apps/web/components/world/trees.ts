import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "@/lib/geo";

/*
 * Leaf-card trees: a trunk with a few limbs and 22-46 alpha-tested leaf clusters (by quality tier), instanced for the whole city.
 * Card normals point out from the crown centre so the canopy shades like a volume; leaves sway in the wind.
 */

function leafClusterTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(808);
  for (let k = 0; k < 150; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 104;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    const len = 14 + r() * 12, ang = r() * Math.PI * 2;
    const tone = 0.55 + r() * 0.45;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = `rgb(${Math.round(78 * tone)},${Math.round(118 * tone)},${Math.round(52 * tone)})`;
    g.beginPath();
    g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(30,45,20,${0.25 + r() * 0.2})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function treeGeometries(seed: number, cardCount: number) {
  const r = rng(seed);
  const crownY = 5.6, rx = 2.7, ry = 2.2;
  const cards: THREE.BufferGeometry[] = [];
  const centre = new THREE.Vector3(0, crownY, 0);
  const grow = Math.sqrt(46 / cardCount); // fewer cards: each a little bigger, so the crown stays full
  for (let k = 0; k < cardCount; k++) {
    const u = r() * 2 - 1, phi = r() * Math.PI * 2, rad = Math.cbrt(0.25 + r() * 0.75);
    const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(phi) * rx * rad, u * ry * rad + crownY, Math.sqrt(1 - u * u) * Math.sin(phi) * rx * rad);
    const size = (1.6 + r() * 1.1) * grow;
    const card = new THREE.PlaneGeometry(size, size);
    card.rotateX(r() * Math.PI);
    card.rotateY(r() * Math.PI);
    card.rotateZ(r() * Math.PI);
    card.translate(p.x, p.y, p.z);
    // crown-shaped normals: each vertex faces away from the crown centre
    const pos = card.getAttribute("position") as THREE.BufferAttribute, nor = card.getAttribute("normal") as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).sub(centre);
      v.y *= 1.6;
      v.normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
    }
    cards.push(card);
  }
  const wood: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.14, 0.24, crownY, 7).translate(0, crownY / 2, 0)];
  for (let k = 0; k < 4; k++) {
    const limb = new THREE.CylinderGeometry(0.05, 0.1, 2.2, 5).translate(0, 1.1, 0);
    limb.rotateZ(0.6 + r() * 0.3);
    limb.rotateY((k / 4) * Math.PI * 2 + r());
    limb.translate(0, crownY - 1.4 + r() * 0.6, 0);
    wood.push(limb);
  }
  return { leaves: mergeGeometries(cards), wood: mergeGeometries(wood) };
}

export function buildTrees(spots: [number, number, number][], cardCount = 46) {
  const group = new THREE.Group();
  const time = { value: 0 };
  const leafMat = new THREE.MeshStandardMaterial({ map: leafClusterTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  leafMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float sway = sin(uTime * 1.3 + position.x * 0.7 + position.z * 0.5) * 0.06 * smoothstep(3.5, 7.5, position.y);
        transformed.x += sway;
        transformed.z += sway * 0.6;`,
      );
  };
  leafMat.customProgramCacheKey = () => "leaf-sway";
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 });
  const greens = [0x6d8f4a, 0x7f9b52, 0x5f8344, 0x88a35a, 0x94a35b, 0x6a8a3e].map((c) => new THREE.Color(c));
  const r = rng(909);

  // Two tree shapes, so rows of street trees don't read as copies.
  const kinds = [treeGeometries(11, cardCount), treeGeometries(23, cardCount)];
  kinds.forEach((geo, kind) => {
    const mine = spots.filter((_, i) => i % 2 === kind);
    const leaves = new THREE.InstancedMesh(geo.leaves, leafMat, mine.length);
    const wood = new THREE.InstancedMesh(geo.wood, barkMat, mine.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), y = new THREE.Vector3(0, 1, 0);
    mine.forEach(([x, z, size], k) => {
      const sc = size / 3.6;
      m.compose(p.set(x, 0.3, z), q.setFromAxisAngle(y, r() * Math.PI * 2), s.set(sc, sc * (0.9 + r() * 0.25), sc));
      leaves.setMatrixAt(k, m);
      wood.setMatrixAt(k, m);
      leaves.setColorAt(k, greens[Math.floor(r() * greens.length)].clone().offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08));
    });
    leaves.castShadow = wood.castShadow = true;
    leaves.receiveShadow = true;
    group.add(leaves, wood);
  });

  return { group, update: (t: number) => { time.value = t; } };
}
