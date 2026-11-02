// The history behind the graphs.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, STATS } from '../src/config.js';
import { newStats, maybeRecord, STAT_KEYS } from '../src/engine/stats.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';

const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };

describe('history for the graphs', () => {
  it('records a row every few years', { timeout: 120000 }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 300);
    const s = e.stats;
    expect(s.year.length).toBeGreaterThan(300 / STATS.everyYears - 2);
    expect(s.year.length).toBeLessThan(300 / STATS.everyYears + 2);
    for (const k of STAT_KEYS) expect(s[k].length).toBe(s.year.length);
    expect(s.sinuosity[s.year.length - 1]).toBeGreaterThan(1);
    expect(s.flow.every((v) => v > 0)).toBe(true);
    expect(s.sediment.every((v) => v >= 0)).toBe(true);
    const snap = e.snapshot();
    expect(snap.stats.year.length).toBe(s.year.length);
    expect(e.snapshot().stats).toBe(null); // only sent again when a row is added
  });

  it('thins itself when full, so a long run still fits', () => {
    const fake = { year: 0, active: 3, x: Float64Array.of(0, 1, 2), y: Float64Array.of(0, 0, 0), aggr: new Float64Array(3), incision: 0,
      sediment: { exported: 0, delta: 0, out: 0 }, oxbows: [], q: 1, wet: 0, braid: 0 };
    const s = newStats();
    for (let k = 0; k < STATS.maxRows * 3; k++) { fake.year = k * STATS.everyYears; maybeRecord(s, fake); }
    expect(s.year.length).toBeLessThanOrEqual(STATS.maxRows);
    expect(s.every).toBeGreaterThan(STATS.everyYears);
    expect(s.year[s.year.length - 1]).toBeGreaterThan(STATS.maxRows * 2 * STATS.everyYears);
  });

  it('is saved with the river, and a damaged one is refused', { timeout: 120000 }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 60);
    const st = decodeSave(encodeSave(e.serialize()));
    const b = Engine.fromState(st);
    expect(b.stats.year).toEqual(e.stats.year);
    const bad = e.serialize();
    bad.stats.flow = new Float64Array(3);
    expect(() => decodeSave(encodeSave(bad))).toThrow();
  });
});
