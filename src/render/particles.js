// Helical flow particles. Visual only: driven from curvature and the thalweg
// position, not from fluid dynamics (and Explain mode says so).
import * as THREE from 'three';
import { VALLEY, RENDER } from '../config.js';

function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function createParticles(maxCount) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(maxCount * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: RENDER.particleSize, map: makeSprite(), transparent: true, opacity: 0.85,
    depthWrite: false, sizeAttenuation: true, color: 0xeaf6ff,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;

  // Particle state: arc position, helix phase, radius fraction, speed factor.
  const s = new Float32Array(maxCount), phase = new Float32Array(maxCount);
  const rf = new Float32Array(maxCount), sf = new Float32Array(maxCount);
  let count = 0;
  let arc = null, total = 0, snap = null;

  function seed(n) {
    count = Math.min(n, maxCount);
    for (let i = 0; i < count; i++) {
      s[i] = Math.random() * total;
      phase[i] = Math.random() * Math.PI * 2;
      rf[i] = 0.15 + Math.random() * 0.7;
      sf[i] = 0.7 + Math.random() * 0.6;
    }
  }

  function setSnapshot(snapshot, n) {
    snap = snapshot;
    const c = snapshot.centreline;
    const len = c.x.length;
    arc = new Float32Array(len);
    for (let i = 1; i < len; i++) arc[i] = arc[i - 1] + Math.hypot(c.x[i] - c.x[i - 1], c.y[i] - c.y[i - 1]);
    const newTotal = arc[len - 1];
    if (count === 0 || n !== count) { total = newTotal; seed(n); }
    else {
      // Keep particles at the same fraction of the river after a cutoff shortens it.
      for (let i = 0; i < count; i++) s[i] = (s[i] / total) * newTotal;
      total = newTotal;
    }
  }

  function update(dt, exaggeration, enabled) {
    points.visible = enabled && !!snap;
    if (!points.visible) return;
    const c = snap.centreline;
    const W = c.width, hw = W / 2;
    const len = c.x.length;
    const pos = geometry.attributes.position.array;
    let seg = 0;
    // Particles are not sorted, so search from a guess each time (cheap: short hops).
    for (let i = 0; i < count; i++) {
      s[i] += RENDER.particleSpeed * sf[i] * dt;
      if (s[i] >= total) { s[i] -= total; phase[i] = Math.random() * Math.PI * 2; }
      const target = s[i];
      // Binary search the segment.
      let lo = 0, hi = len - 2;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arc[mid] <= target) lo = mid; else hi = mid - 1; }
      seg = lo;
      const segLen = arc[seg + 1] - arc[seg] || 1;
      const t = (target - arc[seg]) / segLen;
      const x = c.x[seg] + (c.x[seg + 1] - c.x[seg]) * t;
      const y = c.y[seg] + (c.y[seg + 1] - c.y[seg]) * t;
      const dx = c.x[seg + 1] - c.x[seg], dy = c.y[seg + 1] - c.y[seg];
      const l = Math.hypot(dx, dy) || 1;
      const nx = dy / l, ny = -dx / l; // right-hand normal
      const curv = c.curvature[seg] + (c.curvature[seg + 1] - c.curvature[seg]) * t;
      const depth = c.depth[seg] + (c.depth[seg + 1] - c.depth[seg]) * t;
      const level = c.level[seg] + (c.level[seg + 1] - c.level[seg]) * t;
      const thal = c.thalweg[seg] + (c.thalweg[seg + 1] - c.thalweg[seg]) * t;
      const bend = Math.min(1, Math.abs(curv) * W * 4);
      const side = curv > 0 ? 1 : -1; // outer bank on the right for a left turn
      // Corkscrew: surface water heads for the outer bank, bed water returns inside.
      phase[i] += (RENDER.helixRate * bend + 0.25) * side * dt;
      const across = thal + Math.cos(phase[i]) * rf[i] * hw * 0.8;
      const up = (0.5 + 0.5 * Math.sin(phase[i])) * depth; // 0 at bed, depth at surface
      pos[i * 3] = x + nx * across - VALLEY.length / 2;
      pos[i * 3 + 1] = (level - depth + up) * exaggeration + 0.15;
      pos[i * 3 + 2] = y + ny * across - VALLEY.width / 2;
    }
    geometry.setDrawRange(0, count);
    geometry.attributes.position.needsUpdate = true;
  }

  return { points, setSnapshot, update };
}
