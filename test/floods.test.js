import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY, FLOODPLAIN } from '../src/config.js';
import { cellIndex } from '../src/engine/floodplain.js';

const LONG = 60000;
const fast = { ...defaults, quality: 'low' };
const run = (e, ticks) => { for (let i = 0; i < ticks; i++) e.tick(); };

describe('floods', () => {
  it('a triggered flood raises the flood level and ends by itself', () => {
    const e = new Engine({ ...fast, floodFrequency: 0 });
    run(e, 10);
    expect(e.snapshot().flood).toBe(0);
    e.triggerFlood();
    e.tick();
    expect(e.snapshot().flood).toBeGreaterThan(0);
    run(e, 40);
    expect(e.snapshot().flood).toBe(0);
  });

  it('never makes a chute cutoff without a flood', { timeout: LONG }, () => {
    const e = new Engine({ ...fast, floodFrequency: 0, chuteChance: 1 });
    let chutes = 0;
    for (let t = 0; t < 2000 / DT; t++) {
      e.tick();
      chutes += e.snapshot().events.filter((ev) => ev.type === 'chute').length;
    }
    expect(chutes).toBe(0);
  });

  // Judged over three rivers: one river makes too few cutoffs in 2000 years
  // for its ratio to mean much.
  it('neck cutoffs are a large share at default settings', { timeout: LONG * 5 }, () => {
    let necks = 0, chutes = 0;
    for (const seed of [1, 2, 3]) {
      const e = new Engine({ ...fast, seed });
      for (let t = 0; t < 2000 / DT; t++) {
        e.tick();
        for (const ev of e.snapshot().events) { if (ev.type === 'neck') necks++; else if (ev.type === 'chute') chutes++; }
      }
    }
    expect(necks).toBeGreaterThanOrEqual(6);
    expect(chutes).toBeLessThanOrEqual(necks * 2);
  });
});

describe('hard rock', () => {
  it('a painted rock wall deflects the river', { timeout: LONG }, () => {
    const extent = (e) => { let m = 0; for (let i = 0; i < e.x.length; i++) m = Math.max(m, e.y[i] - VALLEY.width / 2); return m; };
    const free = new Engine({ ...fast, floodFrequency: 0 });
    const walled = new Engine({ ...fast, floodFrequency: 0 });
    // A wall of rock 150 m to one side of the initial channel, along the whole valley.
    for (let x = 0; x <= VALLEY.length; x += 60) walled.paint(x, VALLEY.width / 2 + 150, 80, true);
    run(free, 1200 / DT); run(walled, 1200 / DT);
    expect(extent(free)).toBeGreaterThan(250);
    expect(extent(walled)).toBeLessThan(extent(free) * 0.6);
  });
});

describe('ground and water', () => {
  it('keeps river cells below the water surface and oxbow beds below lake level', { timeout: LONG }, () => {
    const e = new Engine(fast);
    const g = e.grid;
    let bad = 0, checked = 0, lakeBad = 0, lakeCells = 0;
    for (let t = 0; t < 1500 / DT; t++) {
      e.tick();
      if (t % 100 !== 0) continue;
      for (let i = 0; i < e.x.length; i++) {
        const c = cellIndex(g, e.x[i], e.y[i]);
        checked++;
        if (g.height[c] > e.level[i] - 0.05) bad++;
      }
      for (const o of e.oxbows) for (const c of o.cells) {
        if (g.channel[c] !== 2 || o.depth < FLOODPLAIN.oxbowMarshDepth) continue; // open water only; marsh beds sit near the old level
        lakeCells++;
        if (g.height[c] > o.level - 0.05) lakeBad++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(bad / checked).toBeLessThan(0.005);
    expect(lakeCells).toBeGreaterThan(100);
    expect(lakeBad / lakeCells).toBeLessThan(0.05);
  });

  it('applies bank height and valley slope mid-run to the floodplain', () => {
    const e = new Engine(fast);
    run(e, 20);
    const far = cellIndex(e.grid, 1000, 2600);
    const before = e.grid.height[far];
    e.applySettings({ bankHeight: 6 });
    e.tick();
    expect(e.grid.height[far] - before).toBeCloseTo(2, 3);
    e.applySettings({ valleySlope: 0.001 });
    e.tick();
    const up = e.grid.height[cellIndex(e.grid, 500, 2600)], down = e.grid.height[cellIndex(e.grid, 5500, 2600)];
    expect(up - down).toBeGreaterThan(4.5);
  });

  it('applies patchiness mid-run and keeps rock when it is cleared', () => {
    const e = new Engine({ ...fast, patchiness: 0 });
    const s = e.settings;
    const { sampleErodibility } = e.constructor.helpers;
    const bare = { ...s, rootStrength: 0 };
    expect(sampleErodibility(e.grid, 1000, 2600, bare)).toBeCloseTo(1, 5);
    e.applySettings({ patchiness: 1 });
    let varied = 0;
    for (let x = 500; x < 5500; x += 250) if (Math.abs(sampleErodibility(e.grid, x, 2600, { ...bare, patchiness: 1 }) - 1) > 0.05) varied++;
    expect(varied).toBeGreaterThan(5);
  });
});
