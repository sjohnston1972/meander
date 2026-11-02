// Wood in the river: log jams (a tangle of logs lodged across the channel),
// beaver dams (a line of sticks across it) and beaver lodges (a mound in an
// oxbow lake). Instanced logs and mounds, rebuilt from each snapshot.
import * as THREE from 'three';
import { VALLEY } from '../config.js';

const MAX_LOGS = 600;
const MAX_LODGES = 40;

// A small deterministic hash so each jam keeps its own tangle between frames.
function rand(seed, k) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  h = Math.imul(h ^ (k + 0x9e3779b9), 1597334677);
  h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}

export function createWood() {
  const group = new THREE.Group();
  const logGeom = new THREE.CylinderGeometry(1, 1, 1, 6);
  logGeom.rotateZ(Math.PI / 2); // lying along x
  const logs = new THREE.InstancedMesh(logGeom, new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.95 }), MAX_LOGS);
  logs.castShadow = true;
  logs.frustumCulled = false;
  logs.count = 0;
  const moundGeom = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const mounds = new THREE.InstancedMesh(moundGeom, new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 1 }), MAX_LODGES);
  mounds.castShadow = true;
  mounds.frustumCulled = false;
  mounds.count = 0;
  group.add(logs, mounds);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  function update(snapshot, exaggeration) {
    let nl = 0, nm = 0;
    for (const w of snapshot.wood || []) {
      const ax = -w.diry, ay = w.dirx; // across the river
      const baseAngle = Math.atan2(w.diry, w.dirx);
      const y0 = w.level * exaggeration;
      if (w.kind === 'lodge') {
        if (nm >= MAX_LODGES) continue;
        const r = Math.max(8, w.width * 0.18);
        p.set(w.x - VALLEY.length / 2, y0 - 0.5, w.y - VALLEY.width / 2);
        s.set(r, r * 0.55 * Math.min(2, exaggeration), r);
        m.compose(p, q.identity(), s);
        mounds.setMatrixAt(nm++, m);
        continue;
      }
      const jam = w.kind === 'jam';
      const count = jam ? 18 : 22;
      for (let k = 0; k < count && nl < MAX_LOGS; k++) {
        const r1 = rand(w.id, k * 3), r2 = rand(w.id, k * 3 + 1), r3 = rand(w.id, k * 3 + 2);
        // A jam is a tangle piled against one side; a beaver dam a neat line across.
        const u = jam ? (r1 - 0.5) * 0.9 : (k / (count - 1) - 0.5) * 1.05;
        const along = jam ? (r2 - 0.5) * w.width * 0.5 : (r2 - 0.5) * 3;
        const len = jam ? 10 + r3 * 14 : 5 + r3 * 4;
        const rad = jam ? 0.6 + r3 * 0.5 : 0.35;
        const ang = baseAngle + Math.PI / 2 + (jam ? (r2 - 0.5) * 1.6 : (r1 - 0.5) * 0.5);
        p.set(w.x + ax * u * w.width + w.dirx * along - VALLEY.length / 2, y0 + (jam ? r3 * 1.2 : 0.4), w.y + ay * u * w.width + w.diry * along - VALLEY.width / 2);
        q.setFromAxisAngle(up, -ang);
        s.set(len, rad * Math.min(2, exaggeration), rad);
        m.compose(p, q, s);
        logs.setMatrixAt(nl++, m);
      }
    }
    logs.count = nl;
    mounds.count = nm;
    logs.instanceMatrix.needsUpdate = true;
    mounds.instanceMatrix.needsUpdate = true;
    group.visible = nl + nm > 0;
  }

  return { group, update };
}
