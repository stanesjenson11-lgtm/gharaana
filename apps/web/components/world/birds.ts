import * as THREE from "three";
import { rng } from "@/lib/geo";

/* A small flock wheeling over the clouds in the opening shot. Real time, not scroll time. */

type Bird = { root: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; off: THREE.Vector3; phase: number; rate: number };

export function buildBirds(center: THREE.Vector3, count = 14) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2d32, roughness: 0.9, side: THREE.DoubleSide });
  const wing = new THREE.BufferGeometry();
  // one wing, root at the body, tip out along +z; forward is +x
  wing.setAttribute("position", new THREE.Float32BufferAttribute([0.12, 0, 0, -0.14, 0, 0, -0.1, 0, 0.42, 0.06, 0, 0.36, -0.16, 0, 0.78], 3));
  wing.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]);
  wing.computeVertexNormals();
  const body = new THREE.SphereGeometry(1, 10, 6);
  const r = rng(404);
  const birds: Bird[] = [];
  for (let k = 0; k < count; k++) {
    const root = new THREE.Group();
    const b = new THREE.Mesh(body, mat);
    b.scale.set(0.3, 0.07, 0.07);
    const l = new THREE.Mesh(wing, mat);
    const rw = new THREE.Mesh(wing, mat);
    rw.scale.z = -1;
    root.add(b, l, rw);
    root.scale.setScalar(1.25 + r() * 0.45);
    group.add(root);
    birds.push({ root, l, r: rw, off: new THREE.Vector3((r() - 0.5) * 26, (r() - 0.5) * 9, (r() - 0.5) * 26), phase: r() * 10, rate: 7 + r() * 3 });
  }

  const p = new THREE.Vector3(), ahead = new THREE.Vector3(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  const path = (t: number, out: THREE.Vector3) =>
    out.set(center.x + Math.cos(t) * 46, center.y + Math.sin(t * 2) * 5, center.z + Math.sin(t) * 30);

  function update(time: number) {
    if (!group.visible) return;
    for (const b of birds) {
      const t = time * 0.16 + b.phase * 0.02;
      path(t, p).add(b.off);
      p.y += Math.sin(time * 0.7 + b.phase) * 1.2;
      path(t + 0.02, ahead).add(b.off);
      b.root.position.copy(p);
      m.lookAt(ahead, p, up);
      b.root.quaternion.setFromRotationMatrix(m);
      b.root.rotateY(-Math.PI / 2); // geometry points along +x
      b.root.rotateX(Math.sin(t * 2) * 0.25); // bank into the turn
      const glide = Math.sin(time * 0.5 + b.phase) > 0.55; // some birds glide for a beat
      const flap = glide ? 0.08 : Math.sin(time * b.rate + b.phase) * 0.7;
      b.l.rotation.x = -flap;
      b.r.rotation.x = flap;
    }
  }

  return { group, update };
}
