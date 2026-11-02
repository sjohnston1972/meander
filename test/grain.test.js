// Grain sorting: gravel drops first where the bed builds up, sand goes first
// where it is scoured.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, GRAIN, SURFACE } from '../src/config.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';
import { fingerprint } from './helpers.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };
const mean = (a, from, to) => { let s = 0; for (let i = from; i < to; i++) s += a[i]; return s / (to - from); };

describe('grain sorting', () => {
  it('leaves a river in balance alone', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 100);
    expect(e.grain).toBe(null);
  });

  it('fines downstream on an overloaded river, with gravel bars above and sand below', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low', sedimentSupply: 3 }), 600);
    const n = e.x.length, g = e.grain;
    expect(mean(g, 6, Math.floor(n / 5))).toBeGreaterThan(mean(g, Math.floor(n * 0.8), n - 6) + 0.08);
    let gravel = 0;
    for (let i = 0; i < e.grid.surface.length; i++) if (e.grid.surface[i] === SURFACE.GRAVEL) gravel++;
    expect(gravel).toBeGreaterThan(20);
  });

  it('armours a river starved of sediment', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low', sedimentSupply: 0.2 }), 600);
    expect(mean(e.grain, 6, Math.floor(e.x.length / 2))).toBeGreaterThan(GRAIN.start + 0.07);
  });

  it('armours the bed below a weir, where the river runs clear', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 300);
    const j = Math.floor(e.x.length * 0.4);
    e.build('weir', e.x[j], e.y[j]);
    run(e, 60);
    const k = e.nearestPoint(e.dams[0].x, e.dams[0].y);
    expect(mean(e.grain, k + 3, k + 20)).toBeGreaterThan(GRAIN.start + 0.07);
  });

  it('carries on exactly after save and restore, and refuses a damaged bed', { timeout: LONG }, () => {
    const a = run(new Engine({ ...defaults, quality: 'low', sedimentSupply: 2.5 }), 200);
    const b = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    run(a, 50); run(b, 50);
    expect(fingerprint(b)).toBe(fingerprint(a));
    const bad = a.serialize();
    bad.grain[3] = 7;
    expect(() => decodeSave(encodeSave(bad))).toThrow();
  });
});
