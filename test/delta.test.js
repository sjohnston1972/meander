// The lake at the valley's end and the delta the river builds into it.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, VALLEY, LAKE, SEDIMENT } from '../src/config.js';
import { OPEN_LAKE, DISTRIBUTARY } from '../src/engine/delta.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';
import { fingerprint } from './helpers.js';

const LONG = 300000;
const lake = (extra = {}) => new Engine({ ...defaults, quality: 'low', valleyEnd: 'lake', ...extra });
const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };
const openCells = (e) => e.lake.cells.reduce((k, i) => k + (e.grid.channel[i] === OPEN_LAKE ? 1 : 0), 0);

describe('valley-end lake', () => {
  it('floods the downstream end of the valley, and the river stops at its shore', () => {
    const e = lake();
    const g = e.grid;
    const far = g.channel[Math.floor(VALLEY.width / 2 / g.cell) * g.cols + g.cols - 2];
    expect(far).toBe(OPEN_LAKE);
    expect(e.mouth).toBeLessThan(e.x.length - 1);
    expect(e.x[e.mouth]).toBeGreaterThan(VALLEY.length - LAKE.length - LAKE.shoreWobble - 100);
    expect(e.x[e.mouth]).toBeLessThan(VALLEY.length - LAKE.length + LAKE.shoreWobble + 100);
    // The lake floor is under water, the water at the river's base level.
    for (const i of e.lake.cells) expect(g.height[i]).toBeLessThan(e.lakeLevel);
    const snap = e.snapshot();
    expect(snap.centreline.x.length).toBe(e.mouth + 1);
    expect(snap.lake.cells.length).toBe(e.lake.cells.length);
    expect(e.snapshot().lake.cells).toBe(null); // sent once
  });

  it('an open valley has no lake', () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    expect(e.lake).toBe(null);
    expect(e.mouth).toBe(e.x.length - 1);
    expect(e.snapshot().lake).toBe(null);
  });

  it('fills with a delta: the shore advances and the river lengthens over it', { timeout: LONG }, () => {
    const e = lake({ sedimentSupply: 3 });
    const g = e.grid;
    const before = Float64Array.from(e.lake.cells, (i) => g.height[i]);
    const open0 = openCells(e);
    const mouth0 = e.x[e.mouth];
    run(e, 400);
    expect(openCells(e)).toBeLessThan(open0 * 0.95);
    expect(e.x[e.mouth]).toBeGreaterThan(mouth0 + 150);
    // What went into the lake is what the river carried past its mouth.
    let added = 0;
    e.lake.cells.forEach((i, k) => { if (g.channel[i] === OPEN_LAKE) added += (g.height[i] - before[k]) * g.cell * g.cell; });
    expect(e.sediment.delta).toBeGreaterThan(0);
    expect(e.lake.deposited).toBeGreaterThan(e.sediment.delta / (1 - SEDIMENT.porosity) * 0.95);
    expect(added).toBeLessThanOrEqual(e.lake.deposited * 1.0001);
  });

  it('grows distributaries once the delta reaches out, and they reach open water', { timeout: LONG }, () => {
    const e = lake({ sedimentSupply: 2 });
    let live = [];
    for (let y = 0; y < 800 && !live.length; y += 25) { run(e, 25); live = e.lake.dists.filter((d) => d.path); }
    expect(e.lake.dists.length).toBe(LAKE.distCount);
    expect(live.length).toBeGreaterThan(0);
    let carved = 0;
    for (const i of e.lake.distCells) if (e.grid.channel[i] === DISTRIBUTARY) carved++;
    expect(carved).toBeGreaterThan(5);
    expect(e.snapshot().channels.length).toBe(live.length);
  });

  it('sends the lake to the renderer again after a reset on the same engine', () => {
    const e = lake();
    expect(e.snapshot().lake.cells).not.toBe(null);
    e.reset({ ...defaults, quality: 'low' });
    expect(e.snapshot().lake).toBe(null);
    e.reset({ ...defaults, quality: 'low', valleyEnd: 'lake', seed: 2 });
    expect(e.snapshot().lake.cells).not.toBe(null);
  });

  it('keeps its mouth where the river last meets open water, without flickering upstream', { timeout: LONG }, () => {
    const e = lake();
    let jumps = 0, last = e.mouth;
    for (let i = 0; i < 2400; i++) {
      e.tick();
      if (e.mouth < last - 20) jumps++;
      last = e.mouth;
    }
    expect(jumps).toBeLessThan(3);
  });

  it('once the delta reaches the far end, the river runs on out of the valley', { timeout: LONG }, () => {
    const e = lake({ sedimentSupply: 2 });
    for (let y = 0; y < 1500 && !e.lake.across; y += 25) run(e, 25);
    expect(e.lake.across).toBe(true);
    const out = e.sediment.exported;
    run(e, 50);
    expect(e.sediment.exported).toBeGreaterThan(out);
  });

  it('falls with base level, leaving its shallows dry', { timeout: LONG }, () => {
    const e = run(lake(), 2);
    const open0 = openCells(e);
    const level0 = e.lakeLevel;
    e.dropBaseLevel(2);
    run(e, 2);
    expect(e.lakeLevel).toBeLessThan(level0 - 1.9);
    expect(openCells(e)).toBeLessThan(open0);
  });

  it('carries on exactly after save and restore', { timeout: LONG }, () => {
    const a = run(lake({ sedimentSupply: 3 }), 650);
    const b = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    run(a, 60); run(b, 60);
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(b.lake.deposited).toBe(a.lake.deposited);
  });

  it('is deterministic', { timeout: LONG }, () => {
    const a = run(lake({ sedimentSupply: 2 }), 300), b = run(lake({ sedimentSupply: 2 }), 300);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});
