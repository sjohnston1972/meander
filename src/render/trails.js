// History trails (where the channel was 50, 100, 200 years ago) and the thalweg line.
import * as THREE from 'three';
import { VALLEY, CENTRELINE } from '../config.js';

const MAX = 6000;

function makeLine(colour, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
  const m = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(g, m);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function writeLine(line, x, y, heightFn, lift) {
  const n = Math.min(x.length, MAX);
  const pos = line.geometry.attributes.position.array;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x[i] - VALLEY.length / 2;
    pos[i * 3 + 1] = heightFn(x[i], y[i], i) + lift;
    pos[i * 3 + 2] = y[i] - VALLEY.width / 2;
  }
  line.geometry.setDrawRange(0, n);
  line.geometry.attributes.position.needsUpdate = true;
  line.visible = n > 1;
}

export function createTrails(terrain) {
  const group = new THREE.Group();
  const trails = CENTRELINE.trailAges.map((age, i) => makeLine(0xfff1c8, 0.55 - i * 0.15));
  const thalweg = makeLine(0x0b2a36, 0.9);
  group.add(...trails, thalweg);

  function update(snapshot, exaggeration, showTrails, showThalweg) {
    const ground = (x, y) => terrain.heightAt(snapshot, x, y, exaggeration);
    if (showTrails) {
      for (const t of trails) t.visible = false;
      snapshot.trails.forEach((t, i) => {
        const line = trails[CENTRELINE.trailAges.indexOf(t.age)];
        if (line) writeLine(line, t.x, t.y, ground, 1.2 + exaggeration * 0.4);
      });
    } else {
      for (const t of trails) t.visible = false;
    }
    if (showThalweg) {
      const c = snapshot.centreline;
      const n = c.x.length;
      const tx = new Float32Array(n), ty = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        const dx = c.x[i1] - c.x[i0], dy = c.y[i1] - c.y[i0];
        const l = Math.hypot(dx, dy) || 1;
        tx[i] = c.x[i] + (dy / l) * c.thalweg[i];
        ty[i] = c.y[i] - (dx / l) * c.thalweg[i];
      }
      writeLine(thalweg, tx, ty, (x, y, i) => c.level[i] * exaggeration, 0.25);
    } else {
      thalweg.visible = false;
    }
  }

  return { group, update };
}
