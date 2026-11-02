// Main-thread client for the engine worker. The renderer only ever sees
// snapshots; it never touches the engine.

// `slot`: start from a stored river ('autosave') instead of a new one.
export function createSim(settings, { slot = null } = {}) {
  const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
  const listeners = [];
  const restoredListeners = [];
  const waiting = new Map();
  let requestId = 0;
  let playing = false;
  let ready = false;
  let generation = 0;

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'snapshot') {
      if ((m.generation ?? 0) < generation) return; // from before the last reset
      for (const cb of listeners) cb(m.data);
    }
    else if (m.type === 'ready') ready = true;
    else if (m.type === 'state') { waiting.get(m.id)?.(m.state); waiting.delete(m.id); }
    else if (m.type === 'restored' || m.type === 'restoreFailed') for (const cb of restoredListeners) cb(m);
  };
  worker.onerror = (err) => console.error('[meander] worker error', err.message || err);

  worker.postMessage({ type: 'init', settings, slot });

  return {
    get playing() { return playing; },
    get ready() { return ready; },
    onSnapshot(cb) { listeners.push(cb); },
    play() { playing = true; worker.postMessage({ type: 'play' }); },
    pause() { playing = false; worker.postMessage({ type: 'pause' }); },
    toggle() { if (playing) this.pause(); else this.play(); },
    step(years = 1) { worker.postMessage({ type: 'step', years }); },
    setSpeed(yearsPerSecond) { worker.postMessage({ type: 'speed', yearsPerSecond }); },
    applySettings(partial) { worker.postMessage({ type: 'settings', partial }); },
    reset(settings) { generation++; worker.postMessage({ type: 'reset', settings, generation }); },
    triggerFlood() { worker.postMessage({ type: 'flood' }); },
    dropBaseLevel(metres) { worker.postMessage({ type: 'dropBase', metres }); },
    paint(x, y, radius, on) { worker.postMessage({ type: 'paint', x, y, radius, on }); },
    // Saving: the whole engine state (a copy), a river from a file, a stored slot.
    serialize() {
      const id = ++requestId;
      return new Promise((resolve) => { waiting.set(id, resolve); worker.postMessage({ type: 'serialize', id }); });
    },
    restore(state) { generation++; worker.postMessage({ type: 'restore', state, generation }); },
    restoreSlot(slot) { generation++; worker.postMessage({ type: 'restoreSlot', slot, generation }); },
    saveNow() { worker.postMessage({ type: 'saveNow' }); },
    onRestored(cb) { restoredListeners.push(cb); },
  };
}
