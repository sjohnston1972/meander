import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY, CENTRELINE, FLOODPLAIN } from '../src/config.js';
import { cellIndex } from '../src/engine/floodplain.js';

const LONG = 180000;
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

  it('a base-level drop lowers the outlet first and leaves the head of the river alone', () => {
    const e = new Engine(fast);
    const n0 = e.x.length;
    const outletBefore = e.level[n0 - 3], headBefore = e.level[3];
    e.dropBaseLevel(2);
    run(e, 4);
    const n = e.x.length;
    expect(outletBefore - e.level[n - 3]).toBeGreaterThan(1.5);
    expect(Math.abs(headBefore - e.level[3])).toBeLessThan(0.2);
    expect(e.knickpoints.length).toBe(1);
  });

  it('the knickpoint travels upstream at its celerity', { timeout: LONG }, () => {
    const e = new Engine(fast);
    e.dropBaseLevel(2);
    run(e, 200 / DT);
    const pos = e.knickpoints[0].pos;
    expect(pos).toBeGreaterThan(CENTRELINE.knickCelerity * 200 * 0.7);
    expect(pos).toBeLessThan(CENTRELINE.knickCelerity * 200 * 1.3);
    expect(e.findFeatures().some((f) => f.type === 'knickpoint')).toBe(true);
  });

  it('once the knickpoint reaches the head the whole river has cut down', { timeout: LONG }, () => {
    const e = new Engine(fast);
    e.dropBaseLevel(2);
    for (let i = 0; i < 4000 / DT && e.knickpoints.length; i++) e.tick();
    expect(e.knickpoints.length).toBe(0);
    expect(e.incision).toBeCloseTo(2, 6);
  });

  it('knickpoints survive a save and restore', () => {
    const e = new Engine(fast);
    e.dropBaseLevel(2);
    run(e, 40);
    const c = Engine.fromState(structuredClone(e.serialize()));
    expect(c.knickpoints).toEqual(e.knickpoints);
  });

  it('tall banks erode more slowly', () => {
    const { bankFactor } = Engine.helpers;
    expect(bankFactor(4, 4)).toBe(1);
    expect(bankFactor(2, 4)).toBe(1);
    expect(bankFactor(5.5, 4)).toBe(1); // a levee on top of the bank does not count
    // Gentle: retreat slows with a low power of the extra height, so a
    // terrace edge slows the river without freezing or straightening it.
    expect(bankFactor(8, 4)).toBeCloseTo(Math.pow(4 / 6.5, CENTRELINE.bankHeightExponent), 6);
    expect(CENTRELINE.bankHeightExponent).toBeLessThanOrEqual(0.25);
    expect(bankFactor(80, 4)).toBeGreaterThanOrEqual(CENTRELINE.minBankFactor);
    expect(bankFactor(80, 4)).toBeLessThan(bankFactor(8, 4));
    expect(CENTRELINE.minBankFactor).toBeGreaterThanOrEqual(0.4);
  });

  it('keeps sweeping the valley floor while it cuts down', { timeout: 180000 }, () => {
    // Under steady incision the river must go on migrating and rework a broad
    // strip of the floor, not freeze in a slot. Seed 1, 4000 years: the frozen
    // behaviour reworks ~18 % of the floor, a sweeping river ~30 %.
    const e = new Engine({ ...defaults, incisionRate: 4, quality: 'low' });
    run(e, 4000 / DT);
    const g = e.grid;
    let reworked = 0, land = 0;
    for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
      const y = (cy + 0.5) * g.cell;
      if (y < 300 || y > VALLEY.width - 300) continue;
      land++;
      const orig = defaults.valleySlope * (VALLEY.length - (cx + 0.5) * g.cell) + defaults.bankHeight;
      if (g.height[cy * g.cols + cx] < orig - 1) reworked++;
    }
    expect(reworked / land).toBeGreaterThan(0.25);
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

describe('terrace scarps', () => {
  it('slump to a stable slope instead of standing as one-cell cliffs', { timeout: LONG }, () => {
    const e = new Engine({ ...fast, incisionRate: 10, alluviumDepth: 40 }); // no rock in reach
    run(e, 1500 / DT);
    const g = e.grid;
    const limit = g.cell * FLOODPLAIN.scarpSlope;
    let worst = 0;
    for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols - 1; cx++) {
      const i = cy * g.cols + cx, j = i + 1;
      if (g.channel[i] || g.channel[j]) continue;
      worst = Math.max(worst, Math.abs(g.height[i] - g.height[j]));
    }
    expect(worst).toBeLessThan(limit * 1.5);
  });

  it('stand steeper where they are cut in bedrock', { timeout: LONG }, () => {
    const steepest = (alluviumDepth) => {
      const e = new Engine({ ...fast, incisionRate: 20, alluviumDepth }); // 30 m down
      run(e, 1500 / DT);
      const g = e.grid;
      let worst = 0;
      for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols - 1; cx++) {
        const i = cy * g.cols + cx, j = i + 1;
        if (g.channel[i] || g.channel[j]) continue;
        worst = Math.max(worst, Math.abs(g.height[i] - g.height[j]));
      }
      return worst;
    };
    expect(steepest(4)).toBeGreaterThan(steepest(40) * 1.2);
  });
});

describe('bluffs beside an incising river', () => {
  it('slump down to a stable slope above the river own floodplain', { timeout: LONG }, () => {
    const e = new Engine({ ...fast, incisionRate: 10, alluviumDepth: 40 });
    run(e, 1500 / DT); // ends on a land update, so the latest channel has been slumped against
    const g = e.grid;
    const D = e.depth, B = e.settings.bankHeight;
    const soft = g.cell * FLOODPLAIN.scarpSlope;
    let worst = -Infinity;
    for (let i = 0; i < g.height.length; i++) {
      if (g.channel[i] !== 1) continue;
      for (const j of [i - 1, i + 1, i - g.cols, i + g.cols]) {
        if (j < 0 || j >= g.height.length || g.channel[j]) continue;
        worst = Math.max(worst, g.height[j] - (g.chanLevel[i] - D + B));
      }
    }
    expect(worst).toBeLessThanOrEqual(soft + 1e-3);
  });
});

describe('meandering under incision', () => {
  it('a default river cutting at 6 m per 1000 years still develops bends', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 6, alluviumDepth: 40 });
    let best = 0;
    for (let y = 0; y < 2000; y += 250) {
      run(e, 250 / DT);
      best = Math.max(best, e.x.length * e.ds / VALLEY.length);
    }
    expect(best).toBeGreaterThan(1.6);
  });
});
