// Engineering works that stand above the ground: weirs (a concrete sill
// across the river) and bridges (a deck on piers). Lined banks and
// embankments are in the terrain itself.
import * as THREE from 'three';
import { VALLEY } from '../config.js';

export function createWorks() {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.85 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pier = new THREE.CylinderGeometry(1, 1, 1, 10);
  const meshes = [];

  function update(snapshot, exaggeration) {
    for (const m of meshes) group.remove(m);
    meshes.length = 0;
    for (const w of snapshot.works || []) {
      const angle = Math.atan2(w.diry, w.dirx);
      const cx = w.x - VALLEY.length / 2, cz = w.y - VALLEY.width / 2;
      if (w.kind === 'weir') {
        // A sill from bed to crest, a little wider than the river.
        const h = Math.max(0.5, (w.level - w.bed) * exaggeration);
        const m = new THREE.Mesh(box, concrete);
        m.scale.set(6, h + 0.4, w.width * 1.5);
        m.position.set(cx, w.bed * exaggeration + h / 2, cz);
        m.rotation.y = -angle;
        m.castShadow = m.receiveShadow = true;
        meshes.push(m);
      } else if (w.kind === 'bridge') {
        // A deck spanning the river and its banks, on two piers.
        const top = w.bank * exaggeration + 6;
        const deck = new THREE.Mesh(box, deckMat);
        deck.scale.set(9, 1.6, w.width * 2.4);
        deck.position.set(cx, top, cz);
        deck.rotation.y = -angle;
        deck.castShadow = deck.receiveShadow = true;
        meshes.push(deck);
        const ax = -w.diry, az = w.dirx;
        for (const side of [-0.32, 0.32]) {
          const p = new THREE.Mesh(pier, concrete);
          const h = top - w.bed * exaggeration;
          p.scale.set(1.6, h, 1.6);
          p.position.set(cx + ax * side * w.width, w.bed * exaggeration + h / 2, cz + az * side * w.width);
          p.castShadow = true;
          meshes.push(p);
        }
      }
    }
    for (const m of meshes) group.add(m);
  }

  return { group, update };
}
