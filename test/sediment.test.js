// The sediment budget: bed material carried down the river. Where more
// arrives than the river can carry, the bed builds up; where less, it is
// scoured; lakes trap it; the rest leaves the valley.
import { describe, it, expect } from 'vitest';
import { solveBed } from '../src/engine/sediment.js';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, SEDIMENT } from '../src/config.js';
import { fingerprint } from './helpers.js';
import { cellIndex } from '../src/engine/floodplain.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years / DT; i++) e.tick(); };

// A straight river of n points, ds apart, on a uniform slope.
function reach(n = 200, { slope = 0.0005, k = 4e7, inflowRatio = 1 } = {}) {
  return {
    z: new Float64Array(n), k, S: new Float64Array(n - 1).fill(slope), L: new Float64Array(n),
    pool: new Uint8Array(n), zMin: new Float64Array(n).fill(-10), zMax: new Float64Array(n).fill(10),
    inflow: inflowRatio * k * slope, dt: DT, width: 50, ds: 25, porosity: SEDIMENT.porosity,
  };
}
const stored = (r) => r.z.reduce((a, v) => a + v, 0) * (1 - r.porosity) * r.width * r.ds;

describe('the bed solver', () => {
  it('leaves a river in balance exactly as it was', () => {
    const r = reach();
    for (let t = 0; t < 100; t++) solveBed(r);
    expect(r.z.every((v) => v === 0)).toBe(true);
  });

  it('spreads a pulse of sediment without losing any', () => {
    const r = reach();
    r.L[60] = 2e4 / DT; // 20 000 m3 arrives in one step
    let out = 0;
    const res = solveBed(r);
    out += (res.out - r.inflow) * DT;
    r.L[60] = 0;
    const peak1 = Math.max(...r.z);
    for (let t = 0; t < 40; t++) { const q = solveBed(r); out += (q.out - r.inflow) * DT; }
    expect(Math.max(...r.z)).toBeLessThan(peak1); // it spreads out
    expect(stored(r) + out).toBeCloseTo(2e4, -1); // what is not stored has left the valley
  });

  it('passes on downstream what a bed built up to its cap cannot hold, losing none', () => {
    const r = reach();
    r.zMax.fill(0.05);
    r.L[60] = 2e4 / DT;
    let out = 0;
    out += (solveBed(r).out - r.inflow) * DT;
    r.L[60] = 0;
    for (let t = 0; t < 40; t++) out += (solveBed(r).out - r.inflow) * DT;
    expect(Math.max(...r.z)).toBeLessThanOrEqual(0.05 + 1e-12);
    expect(stored(r) + out).toBeCloseTo(2e4, -1);
  });

  it('builds the bed up when more comes in than the river can carry, highest upstream', () => {
    const r = reach(200, { inflowRatio: 1.5 });
    for (let t = 0; t < 4000; t++) solveBed(r);
    expect(r.z[2]).toBeGreaterThan(0.5);
    expect(r.z[2]).toBeGreaterThan(r.z[100]);
    expect(r.z[199]).toBe(0); // the outlet holds the base level
  });

  it('scours the bed when starved, but not below bedrock', () => {
    const r = reach(200, { inflowRatio: 0.3 });
    r.zMin.fill(-0.4);
    for (let t = 0; t < 4000; t++) solveBed(r);
    expect(r.z[2]).toBeLessThan(-0.3);
    expect(Math.min(...r.z)).toBeGreaterThanOrEqual(-0.4);
  });

  it('drops sediment at the head of a lake, where the current dies', () => {
    const r = reach();
    for (let i = 80; i < 120; i++) r.pool[i] = 1;
    let out = 0;
    for (let t = 0; t < 20; t++) out += solveBed(r).out;
    expect(r.z[80]).toBeGreaterThan(0.1);
    expect(r.z[80]).toBeGreaterThan(r.z[110]); // a delta building out into the lake
    expect(out / 20).toBeLessThan(r.inflow * 0.5); // most of it is trapped
  });
});

describe('sediment in the engine', () => {
  it('leaves the default river exactly as before', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', seed: 1 });
    for (let i = 0; i < 2800; i++) e.tick();
    expect(fingerprint(e)).toBe('e986ee6d:423:2');
    expect(e.aggr.every((v) => v === 0)).toBe(true);
  });

  it('a river given more sediment than it can carry builds its bed up', { timeout: LONG }, () => {
    const a = new Engine({ ...defaults, quality: 'low', sedimentSupply: 3 });
    run(a, 300);
    expect(a.aggr[10]).toBeGreaterThan(0.3);
    expect(a.sediment.out).toBeGreaterThan(0);
  });

  it('a starved river scours its bed', { timeout: LONG }, () => {
    const a = new Engine({ ...defaults, quality: 'low', sedimentSupply: 0.1 });
    run(a, 300);
    expect(a.aggr[10]).toBeLessThan(-0.1);
  });

  it('carries a load dumped in the river downstream and out of the valley', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    run(e, 100);
    const i = Math.floor(e.x.length * 0.4);
    e.addSediment(e.x[i], e.y[i], 5e4);
    e.tick();
    expect(Math.max(...e.aggr)).toBeGreaterThan(0.2);
    const before = e.sediment.exported;
    run(e, 300);
    expect(e.sediment.exported - before).toBeGreaterThan(1e4);
    expect(e.aggr.length).toBe(e.x.length);
  });

  it('takes in what the river eats out of its valley walls, but not on an open floodplain', { timeout: LONG }, () => {
    const flat = new Engine({ ...defaults, quality: 'low' });
    run(flat, 500);
    expect(flat.sediment.fromWalls).toBe(0);
    const deep = new Engine({ ...defaults, quality: 'low', incisionRate: 15 });
    run(deep, 1500);
    expect(deep.sediment.fromWalls).toBeGreaterThan(1e4);
  });

  it('takes in landslide debris that lands in the river', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 15 });
    run(e, 1500);
    for (let k = 0; k < 40 && !(e.sediment.fromSlides > 0); k++) { e.triggerLandslide(); e.tick(); }
    expect(e.sediment.fromSlides).toBeGreaterThan(0);
  });

  it('clouds the water below where fine material comes in', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    run(e, 100);
    const i = Math.floor(e.x.length * 0.4);
    e.addSediment(e.x[i], e.y[i], 0, 3e4);
    e.tick();
    const j = e.nearestPoint(e.x[i], e.y[i]);
    expect(e.washFactor(j + 20)).toBeGreaterThan(1.2);
    expect(e.washFactor(Math.max(0, j - 20))).toBe(1);
  });
});

describe('what the load does to the river', () => {
  it('an aggrading river builds its floodplain up too', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', sedimentSupply: 3 });
    const g = e.grid;
    const before = Float32Array.from(g.base);
    run(e, 600);
    let rise = 0, m = 0;
    for (let i = 8; i < 40; i++) {
      for (const dy of [-80, 80]) {
        const c = cellIndex(g, e.x[i], e.y[i] + dy);
        if (g.channel[c]) continue;
        rise += g.base[c] - before[c]; m++;
      }
    }
    expect(rise / m).toBeGreaterThan(0.2);
  });

  it('muddy water builds levees faster in a flood', { timeout: LONG }, () => {
    const a = new Engine({ ...defaults, quality: 'low', floodFrequency: 0 });
    run(a, 200);
    const b = Engine.fromState(a.serialize());
    a.triggerFlood(); b.triggerFlood();
    const h0 = a.grid.height.reduce((t, v) => t + v, 0);
    for (let t = 0; t < 8; t++) {
      b.addSediment(b.x[8], b.y[8], 0, 2e5); // a muddy flood from upstream
      a.tick(); b.tick();
    }
    const ha = a.grid.height.reduce((t, v) => t + v, 0) - h0;
    const hb = b.grid.height.reduce((t, v) => t + v, 0) - h0;
    expect(hb).toBeGreaterThan(ha * 1.5);
  });

  it('a river loaded beyond what it can carry braids on Auto', { timeout: LONG }, () => {
    // Just below the braiding threshold on its own.
    const s = { ...defaults, quality: 'low', pattern: 'auto', valleySlope: 0.0025, meanDischarge: 100, sedimentSupply: 1 };
    expect(Engine.braidingIndex(s)).toBeLessThan(0.03);
    expect(Engine.braidingIndex(s)).toBeGreaterThan(0.02);
    const e = new Engine(s);
    run(e, 50);
    expect(e.braid).toBe(0);
    for (let t = 0; t < 200; t++) { e.addSediment(e.x[8], e.y[8], 6e4, 0); e.tick(); } // about twice what comes from upstream
    expect(e.braid).toBeGreaterThan(0);
  });
});
