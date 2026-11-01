import { describe, it, expect } from 'vitest';

const LONG = 20000; // ms, for multi-thousand-tick runs
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY } from '../src/config.js';

const fast = { ...defaults, quality: 'low' };

function run(engine, ticks) { for (let i = 0; i < ticks; i++) engine.tick(); }

describe('Engine', () => {
  it('is deterministic for the same seed and settings', () => {
    const a = new Engine(fast), b = new Engine(fast);
    run(a, 500); run(b, 500);
    const sa = a.snapshot(), sb = b.snapshot();
    expect(sa.year).toBeCloseTo(500 * DT, 9);
    expect(Array.from(sa.centreline.x)).toEqual(Array.from(sb.centreline.x));
    expect(Array.from(sa.centreline.y)).toEqual(Array.from(sb.centreline.y));
  });

  it('gives the same result whether ticks run in one batch or several', () => {
    const a = new Engine(fast), b = new Engine(fast);
    run(a, 500);
    for (let batch = 0; batch < 5; batch++) { run(b, 100); b.snapshot(); }
    expect(Array.from(a.snapshot().centreline.y)).toEqual(Array.from(b.snapshot().centreline.y));
  });

  it('differs for a different seed', () => {
    const a = new Engine(fast), b = new Engine({ ...fast, seed: 2 });
    run(a, 200); run(b, 200);
    expect(Array.from(a.snapshot().centreline.y)).not.toEqual(Array.from(b.snapshot().centreline.y));
  });

  it('grows meanders and makes its first oxbow within 2000 years at defaults', { timeout: LONG }, () => {
    const e = new Engine(fast);
    const y0 = e.snapshot().centreline.y;
    const spread0 = Math.max(...y0) - Math.min(...y0);
    let firstOxbow = null;
    for (let t = 0; t < 2000 / DT; t++) {
      e.tick();
      if (firstOxbow === null && e.oxbows.length > 0) firstOxbow = e.year;
    }
    const y1 = e.snapshot().centreline.y;
    const spread1 = Math.max(...y1) - Math.min(...y1);
    expect(spread1).toBeGreaterThan(spread0 * 3);
    expect(firstOxbow).not.toBeNull();
    expect(firstOxbow).toBeLessThan(2000);
  });

  it('keeps the river attached to both valley ends and inside the valley', { timeout: LONG }, () => {
    const e = new Engine(fast);
    run(e, 3000);
    const { x, y } = e.snapshot().centreline;
    expect(x[0]).toBe(0);
    expect(x[x.length - 1]).toBeCloseTo(VALLEY.length, 3);
    for (const v of y) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(VALLEY.width); }
  });

  it('applies new settings mid-run without a reset and without NaN', () => {
    const e = new Engine(fast);
    run(e, 200);
    e.applySettings({ channelWidth: 90, erodibility: 1.5, gamma: 3 });
    run(e, 50);
    const s = e.snapshot();
    expect(s.centreline.width).toBe(90);
    for (const v of s.centreline.y) expect(Number.isNaN(v)).toBe(false);
    for (const v of s.centreline.x) expect(Number.isNaN(v)).toBe(false);
  });

  it('reset returns to year 0 and the initial shape', () => {
    const e = new Engine(fast);
    const y0 = Array.from(e.snapshot().centreline.y);
    run(e, 300);
    e.reset(fast);
    expect(e.year).toBe(0);
    expect(Array.from(e.snapshot().centreline.y)).toEqual(y0);
  });

  it('reports cutoff events once', { timeout: LONG }, () => {
    const e = new Engine(fast);
    let seen = 0;
    for (let t = 0; t < 2000 / DT; t++) {
      e.tick();
      const s = e.snapshot();
      seen += s.events.filter((ev) => ev.type === 'neck').length;
      if (seen > 0) break;
    }
    expect(seen).toBe(1);
    expect(e.snapshot().events.length).toBe(0);
  });
});
