// Main-thread client for the engine worker. The renderer only ever sees
// snapshots; it never touches the engine.

export function createSim(settings) {
  const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
  const listeners = [];
  let playing = false;
  let ready = false;

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'snapshot') for (const cb of listeners) cb(m.data);
    else if (m.type === 'ready') ready = true;
  };
  worker.onerror = (err) => console.error('[meander] worker error', err.message || err);

  worker.postMessage({ type: 'init', settings });

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
    reset(settings) { worker.postMessage({ type: 'reset', settings }); },
    triggerFlood() { worker.postMessage({ type: 'flood' }); },
    paint(x, y, radius, on) { worker.postMessage({ type: 'paint', x, y, radius, on }); },
  };
}
