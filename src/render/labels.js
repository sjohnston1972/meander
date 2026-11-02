// Explain mode: floating labels on features in view, each opening a short card.
import * as THREE from 'three';
import { VALLEY, RENDER, EXPLANATIONS, SURFACE } from '../config.js';

// Card accent colour per feature, from the terrain palette where there is one.
const ACCENT = {
  cutbank: RENDER.surfaceColours[SURFACE.EARTH], pointbar: RENDER.surfaceColours[SURFACE.SAND], scrollbar: RENDER.surfaceColours[SURFACE.SAND],
  oxbow: RENDER.lakeColour, marsh: RENDER.marshColour, levee: RENDER.surfaceColours[SURFACE.GRASS], neck: RENDER.surfaceColours[SURFACE.GRASS],
  terrace: RENDER.surfaceColours[SURFACE.EARTH], knickpoint: RENDER.foamColour, helical: RENDER.riffleColour, thalweg: RENDER.poolColour, pool: RENDER.poolColour, riffle: RENDER.riffleColour, flood: RENDER.floodColour,
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

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
    card.style.borderLeft = `4px solid ${hex(ACCENT[type] ?? 0x6fc3d6)}`;
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
    // Keep labels off the control panel on the right.
    const panel = document.querySelector('.lil-gui.root');
    const limitX = panel && panel.offsetParent !== null ? panel.getBoundingClientRect().left - 70 : w;
    const items = [];
    for (const f of snapshot.features) {
      if (f.type === 'helical' && !showParticles) continue;
      const y = (f.level !== undefined ? f.level * exaggeration : heightFn(f.x, f.y)) + 2;
      v.set(f.x - VALLEY.length / 2, y, f.y - VALLEY.width / 2);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      if (v.z > 1 || v.x < -0.98 || v.x > 0.98 || v.y < -0.95 || v.y > 0.95) continue;
      const sx = (v.x + 1) / 2 * w;
      if (sx > limitX) continue;
      items.push({ f, sx, sy: (1 - v.y) / 2 * h, dist });
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
      if (el.style.display === 'none' || el.dataset.type !== it.f.type) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
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
