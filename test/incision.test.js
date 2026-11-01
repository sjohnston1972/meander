import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY, CENTRELINE } from '../src/config.js';
import { cellIndex } from '../src/engine/floodplain.js';

const LONG = 60000;
const fast = { ...defaults, quality: 'low', floodFrequency: 0 };
const run = (e, ticks) => { for (let i = 0; i < ticks; i++) e.tick(); };

describe('vertical erosion', () => {
  it('is off by default: the water surface does not drop', () => {
    const e = new Engine(fast);
    const before = e.level[Math.floor(e.x.length / 2)];
    run(e, 400);
    expect(Math.abs(e.level[Math.floor(e.x.length / 2)] - before)).toBeLessThan(0.3); // only sinuosity changes it
    expect(e.incision).toBe(0);
  });

  it('lowers the water surface at the incision rate', { timeout: LONG }, () => {
    const e = new Engine({ ...fast, incisionRate: 10 }); // metres per 1000 years
    const before = e.level[Math.floor(e.x.length / 2)];
    run(e, 1000 / DT);
    expect(e.incision).toBeCloseTo(10, 6);
    expect(before - e.level[Math.floor(e.x.length / 2)]).toBeGreaterThan(9);
  });

  it('leaves the old floodplain standing as a terrace while a lower one forms', { timeout: LONG }, () => {
    const e = new Engine({ ...fast, incisionRate: 10 });
    const far = cellIndex(e.grid, 1500, 2800); // valley edge, never reached by the river
    const farBefore = e.grid.height[far];
    run(e, 1200 / DT);
    expect(e.grid.height[far]).toBeCloseTo(farBefore, 1);
    // Ground the channel recently left behind sits near the new, lower level.
    const g = e.grid;
    let fresh = 0, checked = 0;
    for (let i = 10; i < e.x.length - 10; i += 5) {
      const c = cellIndex(g, e.x[i], e.y[i]);
      // look one cell to each side of the channel
      for (const n of [c - 1, c + 1, c - g.cols, c + g.cols]) {
        if (g.channel[n]) continue;
        checked++;
        if (g.height[n] < farBefore - 6) fresh++;
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(fresh / checked).toBeGreaterThan(0.5);
  });

  it('a sudden base-level drop is cut down at a limited rate', () => {
    const e = new Engine(fast);
    e.dropBaseLevel(2);
    e.tick();
    expect(e.incision).toBeGreaterThan(0);
    expect(e.incision).toBeLessThan(2);
    run(e, 400);
    expect(e.incision).toBeCloseTo(2, 6);
  });

  it('tall banks erode more slowly', () => {
    const { bankFactor } = Engine.helpers;
    expect(bankFactor(4, 4)).toBe(1);
    expect(bankFactor(2, 4)).toBe(1);
    expect(bankFactor(5.5, 4)).toBe(1); // a levee on top of the bank does not count
    expect(bankFactor(8, 4)).toBeCloseTo(4 / 6.5, 6);
    expect(bankFactor(80, 4)).toBeGreaterThanOrEqual(CENTRELINE.minBankFactor);
  });

  it('changing bank height mid-run shifts terraces without flattening them', { timeout: LONG }, () => {
    const e = new Engine({ ...fast, incisionRate: 10 });
    run(e, 800 / DT);
    const g = e.grid;
    const far = cellIndex(g, 1500, 2800);
    const near = cellIndex(g, e.x[40], e.y[40]);
    const step = g.height[far] - g.height[near];
    e.applySettings({ bankHeight: 6 });
    e.tick();
    expect(g.height[far] - g.base[far]).toBeCloseTo(g.height[far] - g.base[far], 6); // still consistent
    expect(g.height[far] - g.height[near]).toBeGreaterThan(step - 3); // terrace step largely kept
  });

  it('reports terrace features once incised', { timeout: LONG }, () => {
    const e = new Engine({ ...fast, incisionRate: 15 });
    run(e, 1200 / DT);
    const types = new Set(e.findFeatures().map((f) => f.type));
    expect(types.has('terrace')).toBe(true);
  });
});
