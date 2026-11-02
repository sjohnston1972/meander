// Web Worker: runs the Engine on its own thread, posts snapshots, and keeps
// the autosave current.
import { Engine } from './engine.js';
import { validateState } from './savefile.js';
import { getSlot } from '../storage.js';
import { writeAutosave, newRiverId, AUTOSAVE_SECONDS } from './autosave.js';
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
let riverId = newRiverId(); // which river this is, for the autosave slots
let lastSavedYear = -1;
let saving = false;
let busy = false; // loading a saved river; other messages wait
const held = [];

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

async function autosave() {
  if (!engine || saving || busy || engine.year === lastSavedYear) return;
  saving = true;
  const year = engine.year;
  try { if (await writeAutosave(engine, riverId)) lastSavedYear = year; } finally { saving = false; }
}

// Load a stored slot into the engine. Returns true on success; on failure
// says why (unless `quiet`, used at start-up when there may be no autosave).
async function loadSlot(slot, quiet = false) {
  const rec = await getSlot(slot);
  if (!rec?.state) {
    if (!quiet) postMessage({ type: 'restoreFailed', message: 'nothing is saved there' });
    return false;
  }
  try {
    validateState(rec.state);
    engine = Engine.fromState(rec.state);
  } catch (err) {
    postMessage({ type: 'restoreFailed', message: String(err.message || err) });
    return false;
  }
  // The autosave stays the same river; a restored previous river is a new
  // autosave river (so the one it replaces is kept as previous in turn).
  riverId = slot === 'autosave' ? rec.riverId : newRiverId();
  lastSavedYear = slot === 'autosave' ? engine.year : -1;
  postMessage({ type: 'restored', settings: engine.settings, year: engine.year, from: slot });
  return true;
}

function start() {
  if (timer) return;
  last = performance.now();
  timer = setInterval(loop, 1000 / 60);
  setInterval(autosave, AUTOSAVE_SECONDS * 1000);
}

// Run an async load with every other message held until it finishes.
async function exclusive(fn) {
  busy = true;
  try { await fn(); } finally {
    busy = false;
    acc = 0;
    sendSnapshot();
    for (const m of held.splice(0)) handle(m);
  }
}

self.onmessage = (e) => {
  if (busy) { held.push(e.data); return; }
  handle(e.data);
};

function handle(m) {
  switch (m.type) {
    case 'init':
      yearsPerSecond = m.settings.yearsPerSecond;
      exclusive(async () => {
        if (!(m.slot && (await loadSlot(m.slot, true)))) engine = new Engine(m.settings);
        start();
        postMessage({ type: 'ready' });
      });
      break;
    case 'reset':
      generation = m.generation ?? generation + 1;
      engine.reset(m.settings);
      riverId = newRiverId();
      acc = 0;
      sendSnapshot();
      break;
    case 'restore':
      // A river from a file, already checked on the main thread.
      generation = m.generation ?? generation + 1;
      engine = Engine.fromState(m.state);
      riverId = newRiverId();
      lastSavedYear = -1;
      acc = 0;
      sendSnapshot();
      break;
    case 'restoreSlot':
      generation = m.generation ?? generation + 1;
      exclusive(() => loadSlot(m.slot));
      break;
    case 'serialize': postMessage({ type: 'state', id: m.id, state: engine.serialize() }); break;
    case 'saveNow': autosave(); break;
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
    case 'dropBase': engine.dropBaseLevel(m.metres); dirty = true; break;
    case 'paint': engine.paint(m.x, m.y, m.radius, m.on); dirty = true; break;
    default: break;
  }
}
