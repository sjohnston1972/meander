import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY, SURFACE, PRESETS, BRAID } from '../src/config.js';
import { fingerprint } from './helpers.js';

const LONG = 120000;
const run = (e, years) => { for (let i = 0; i < years / DT; i++) e.tick(); };
const braided = { ...defaults, ...PRESETS['Braided gravel river'], quality: 'low' };

// Runs of water cells crossed by a line across the valley at x.
function channelsAcross(g, x) {
  const cx = Math.floor(x / g.cell);
  let runs = 0, inWater = false, gravel = 0;
  for (let cy = 0; cy < g.rows; cy++) {
    const s = g.surface[cy * g.cols + cx];
    const w = s === SURFACE.WATER && g.channel[cy * g.cols + cx] === 1;
    if (w && !inWater) runs++;
    inWater = w;
    if (s === SURFACE.GRAVEL) gravel++;
  }
  return { runs, gravelMetres: gravel * g.cell };
}

describe('braided rivers', () => {
  it('meandering is the default and has no threads', () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    for (let i = 0; i < 40; i++) e.tick();
    expect(defaults.pattern).toBe('meandering');
    expect(e.braid).toBe(0);
    expect(e.snapshot().braid).toBe(null);
  });

  it('a braided river splits into several threads across a wide gravel belt', { timeout: LONG }, () => {
    const e = new Engine(braided);
    run(e, 200);
    expect(e.braid).toBeCloseTo(1, 6);
    const snap = e.snapshot();
    expect(snap.braid.threads.length).toBeGreaterThanOrEqual(BRAID.threadsMin);
    let best = { runs: 0, gravelMetres: 0 };
    for (const x of [2000, 2500, 3000, 3500, 4000]) {
      const r = channelsAcross(e.grid, x);
      if (r.runs > best.runs) best = r;
    }
    expect(best.runs).toBeGreaterThanOrEqual(2);
    expect(best.gravelMetres).toBeGreaterThan(4 * braided.channelWidth);
  });

  it('threads shift about over time', { timeout: LONG }, () => {
    const e = new Engine(braided);
    run(e, 200);
    const a = e.snapshot().braid.threads[1];
    run(e, 100);
    const b = e.snapshot().braid.threads[1];
    let diff = 0;
    const n = Math.min(a.x.length, b.x.length);
    for (let i = 0; i < n; i++) diff += Math.hypot(a.x[i] - b.x[i], a.y[i] - b.y[i]);
    expect(diff / n).toBeGreaterThan(braided.channelWidth / 2);
  });

  it('makes no neck cutoffs or oxbows while braided', { timeout: LONG }, () => {
    const e = new Engine(braided);
    let necks = 0;
    for (let i = 0; i < 800 / DT; i++) {
      e.tick();
      for (const ev of e.snapshot().events) if (ev.type === 'neck' || ev.type === 'chute') necks++;
    }
    expect(necks).toBe(0);
    expect(e.oxbows.length).toBe(0);
  });

  it('auto braids a steep, sediment-rich river and leaves the default meandering', { timeout: LONG }, () => {
    expect(Engine.braidingIndex(defaults)).toBeLessThan(BRAID.autoThreshold);
    expect(Engine.braidingIndex(braided)).toBeGreaterThan(BRAID.autoThreshold);
    const calm = new Engine({ ...defaults, quality: 'low', pattern: 'auto' });
    run(calm, 100);
    expect(calm.braid).toBe(0);
    const wild = new Engine({ ...braided, pattern: 'auto' });
    run(wild, 100);
    expect(wild.braid).toBeCloseTo(1, 6);
  });

  it('goes back to one channel when switched to meandering', { timeout: LONG }, () => {
    const e = new Engine(braided);
    run(e, 150);
    e.applySettings({ pattern: 'meandering' });
    run(e, BRAID.rampYears * 2);
    expect(e.braid).toBe(0);
    expect(e.snapshot().braid).toBe(null);
    for (let i = 0; i < 40; i++) e.tick(); // and carries on without trouble
    expect(Number.isFinite(e.x[10])).toBe(true);
  });

  it('a braided river survives save and restore exactly', { timeout: LONG }, () => {
    const a = new Engine(braided);
    run(a, 150);
    const b = Engine.fromState(structuredClone(a.serialize()));
    run(a, 50);
    run(b, 50);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });

  it('keeps the threads inside the valley', { timeout: LONG }, () => {
    const e = new Engine(braided);
    run(e, 300);
    for (const t of e.snapshot().braid.threads) {
      for (let i = 0; i < t.x.length; i++) {
        expect(t.y[i]).toBeGreaterThanOrEqual(0);
        expect(t.y[i]).toBeLessThanOrEqual(VALLEY.width);
      }
    }
  });
});
