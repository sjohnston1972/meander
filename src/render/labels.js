// Explain mode: floating labels on features in view, each opening a short card.
import * as THREE from 'three';
import { VALLEY, RENDER, EXPLANATIONS } from '../config.js';

const v = new THREE.Vector3();

export function createLabels(container, card) {
  const pool = [];
  let onPick = null;
  const titleEl = card.querySelector('#card-title');
  const textEl = card.querySelector('#card-text');
  card.querySelector('#card-close').onclick = () => card.classList.remove('show');

  function showCard(type) {
    const ex = EXPLANATIONS[type];
    if (!ex) return;
    titleEl.textContent = ex.title;
    textEl.textContent = ex.text;
    card.classList.add('show');
  }

  function element(i) {
    if (!pool[i]) {
      const el = document.createElement('div');
      el.className = 'label';
      el.onclick = () => { showCard(el.dataset.type); onPick?.(el.dataset.type); };
      container.appendChild(el);
      pool[i] = el;
    }
    return pool[i];
  }

  function update(snapshot, camera, exaggeration, enabled, heightFn, showParticles) {
    if (!enabled || !snapshot?.features) {
      for (const el of pool) el.style.display = 'none';
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    const items = [];
    for (const f of snapshot.features) {
      if (f.type === 'helical' && !showParticles) continue;
      const y = (f.level !== undefined ? f.level * exaggeration : heightFn(f.x, f.y)) + 2;
      v.set(f.x - VALLEY.length / 2, y, f.y - VALLEY.width / 2);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      if (v.z > 1 || v.x < -0.98 || v.x > 0.98 || v.y < -0.95 || v.y > 0.95) continue;
      items.push({ f, sx: (v.x + 1) / 2 * w, sy: (1 - v.y) / 2 * h, dist });
    }
    items.sort((a, b) => a.dist - b.dist);
    // Keep labels apart on screen.
    const placed = [];
    let n = 0;
    for (const it of items) {
      if (n >= RENDER.maxLabels) break;
      if (placed.some((p) => Math.abs(p.sx - it.sx) < 110 && Math.abs(p.sy - it.sy) < 34)) continue;
      placed.push(it);
      const el = element(n++);
      el.style.display = '';
      el.style.left = `${it.sx}px`;
      el.style.top = `${it.sy}px`;
      el.textContent = EXPLANATIONS[it.f.type]?.title || it.f.type;
      el.dataset.type = it.f.type;
    }
    for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
  }

  return { update, showCard, onPick(cb) { onPick = cb; } };
}
