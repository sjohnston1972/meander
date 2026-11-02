// Landslide dams: debris that blocks a gorge holds the river back in a lake
// until the dam wears away or bursts.
import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, HILLS } from '../src/config.js';
import { createGrid } from '../src/engine/floodplain.js';
import { createRandom } from '../src/engine/random.js';
import { fillPond } from '../src/engine/dams.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years / DT; i++) e.tick(); };

// A straight trough along the grid (rows 56-72) with walls 30 m high and a
// river along row 64: water at 5 m above the dam (cx < 128), 1 m below it.
// A debris lobe 8 m high crosses the trough at cx 128-131 over rows lobeFrom..72.
function trough(lobeFrom) {
  const g = createGrid({ ...defaults, quality: 'low' }, createRandom(1));
  for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
    const i = cy * g.cols + cx;
    g.channel[i] = 0;
    g.height[i] = cy >= 56 && cy <= 72 ? 2 : 30;
    if (cy === 64) { g.channel[i] = 1; g.chanLevel[i] = cx < 128 ? 5 : 1; g.height[i] = g.chanLevel[i] - 2; }
    if (cx >= 128 && cx <= 131 && cy >= lobeFrom && cy <= 72 && cy !== 64) g.height[i] = 8;
  }
  return g;
}

describe('landslide lakes', () => {
  it('fill the gorge floor behind a dam that spans it', () => {
    const g = trough(56);
    const cells = fillPond(g, 64 * g.cols + 100, 5, 129.5 * g.cell, 64.5 * g.cell, 6 * g.cell);
    expect(cells).not.toBeNull();
    const cols = Array.from(cells, (i) => i % g.cols);
    expect(Math.max(...cols)).toBeLessThan(128);
    expect(cells.length).toBeGreaterThan(100 * 10);
    for (const i of cells) expect(g.channel[i]).toBe(0);
  });

  it('do not form when the water can get round the debris', () => {
    const g = trough(62);
    expect(fillPond(g, 64 * g.cols + 100, 5, 129.5 * g.cell, 64.5 * g.cell, 6 * g.cell)).toBeNull();
  });
});

describe('landslide dams', () => {
  const saved = { ...HILLS };
  afterEach(() => Object.assign(HILLS, saved));

  it('hold the water up behind them and stop the river migrating there', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 10 });
    run(e, 300);
    const d = Math.floor(e.x.length * 0.6);
    const natural = e.level[d - 10];
    expect(e.makeDam(d, 1.2)).toBe(true);
    e.tick();
    expect(e.dams.length).toBe(1);
    const j = e.nearestPoint(e.dams[0].x, e.dams[0].y);
    expect(e.level[j - 10]).toBeGreaterThan(natural + 1);
    expect(e.level[j + 10]).toBeLessThan(e.level[j - 10] - 1);
    expect(e.rate[j - 10]).toBe(0);
  });

  it('move with the ground when the valley slope changes', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 10 });
    run(e, 300);
    e.makeDam(Math.floor(e.x.length * 0.6), 1.2);
    const d = e.dams[0];
    const above = d.crest - d.natural;
    const g = e.grid;
    const at = Math.min(g.cols - 1, Math.floor(d.x / g.cell)) + Math.min(g.rows - 1, Math.floor(d.y / g.cell)) * g.cols;
    const ground = g.height[at];
    const crest = d.crest;
    e.applySettings({ valleySlope: 0.002 });
    expect(e.dams.length).toBe(1);
    expect(d.crest - crest).toBeCloseTo(g.height[at] - ground, 1); // the cell centre is a few metres from the dam
    expect(d.crest - d.natural).toBeCloseTo(above, 1);
  });

  it('wear away and are gone within a few hundred years', { timeout: LONG }, () => {
    HILLS.damFailChance = 0;
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 10 });
    run(e, 300);
    e.makeDam(Math.floor(e.x.length * 0.6), 1.2);
    run(e, 20);
    expect(e.dams.length).toBe(1);
    run(e, 400);
    expect(e.dams.length).toBe(0);
  });

  it('can burst, sending a flood down the river', { timeout: LONG }, () => {
    HILLS.damFailChance = 100; // certain
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 10, floodFrequency: 0 });
    run(e, 300);
    e.events.length = 0;
    e.makeDam(Math.floor(e.x.length * 0.6), 1.2);
    run(e, 3);
    expect(e.dams.length).toBe(0);
    expect(e.events.some((v) => v.type === 'outburst')).toBe(true);
    expect(e.flood).toBeGreaterThan(0);
  });
});
