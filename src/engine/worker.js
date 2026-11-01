// Web Worker: runs the Engine on its own thread and posts snapshots.
import { Engine } from './engine.js';
import { DT, MAX_STEPS_PER_FRAME, SNAPSHOT_HZ } from '../config.js';

let engine = null;
let playing = false;
let yearsPerSecond = 10;
let acc = 0;
let last = 0;
let lastSnapshot = 0;
let timer = null;
let dirty = true; // something changed since the last snapshot
let generation = 0; // bumps on every reset so stale snapshots can be dropped

function sendSnapshot() {
  if (!engine) return;
  const snap = engine.snapshot();
  const c = snap.centreline, g = snap.grid;
  const transfer = [
    c.x.buffer, c.y.buffer, c.curvature.buffer, c.rate.buffer, c.level.buffer, c.depth.buffer, c.thalweg.buffer,
    g.height.buffer, g.surface.buffer, g.veg.buffer,
  ];
  postMessage({ type: 'snapshot', data: snap, generation }, transfer);
  lastSnapshot = performance.now();
  dirty = false;
}

function loop() {
  const now = performance.now();
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (playing && engine) {
    acc += (yearsPerSecond * elapsed) / DT;
    let steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(acc));
    acc -= steps;
    if (steps > 0) dirty = true;
    const budgetEnd = now + 40; // never hog the thread for more than ~40 ms
    while (steps-- > 0) {
      engine.tick();
      if (performance.now() > budgetEnd) { acc = 0; break; }
    }
  }
  if (dirty && now - lastSnapshot >= 1000 / SNAPSHOT_HZ) sendSnapshot();
}

function start() {
  if (timer) return;
  last = performance.now();
  timer = setInterval(loop, 1000 / 60);
}

self.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      engine = new Engine(m.settings);
      yearsPerSecond = m.settings.yearsPerSecond;
      start();
      postMessage({ type: 'ready' });
      sendSnapshot();
      break;
    case 'reset':
      generation = m.generation ?? generation + 1;
      engine.reset(m.settings);
      acc = 0;
      sendSnapshot();
      break;
    case 'settings':
      engine.applySettings(m.partial);
      if (m.partial.yearsPerSecond !== undefined) yearsPerSecond = m.partial.yearsPerSecond;
      dirty = true;
      break;
    case 'play': playing = true; last = performance.now(); break;
    case 'pause': playing = false; break;
    case 'step': {
      const steps = Math.max(1, Math.round((m.years || 1) / DT));
      for (let i = 0; i < steps; i++) engine.tick();
      sendSnapshot();
      break;
    }
    case 'speed': yearsPerSecond = m.yearsPerSecond; break;
    case 'flood': engine.triggerFlood(); break;
    case 'paint': engine.paint(m.x, m.y, m.radius, m.on); dirty = true; break;
    default: break;
  }
};
