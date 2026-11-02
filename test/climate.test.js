// Climate swings: wet and dry periods move flow, floods and sediment together.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';
import { fingerprint } from './helpers.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };

describe('climate swings', () => {
  it('leave a steady climate alone', () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 10);
    expect(e.es).toBe(e.settings);
    expect(e.wet).toBe(0);
    expect(e.snapshot().climate).toBe(null);
  });

  it('bring wet periods with more water and floods, and dry ones with less', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', climateSwing: 1 });
    const wet = { q: 0, n: 0, floods: 0 }, dry = { q: 0, n: 0, floods: 0 };
    const phases = new Set();
    let wasFlood = false;
    for (let i = 0; i < 4000 * 4; i++) {
      e.tick();
      const b = e.wet > 0.5 ? wet : e.wet < -0.5 ? dry : null;
      const starts = e.flood > 0 && !wasFlood;
      wasFlood = e.flood > 0;
      for (const ev of e.events) if (ev.type === 'wetPeriod' || ev.type === 'dryPeriod') phases.add(ev.type);
      e.events.length = 0;
      if (!b) continue;
      b.q += e.discharge; b.n++;
      if (starts) b.floods++;
    }
    expect(wet.n).toBeGreaterThan(400);
    expect(dry.n).toBeGreaterThan(400);
    expect(wet.q / wet.n).toBeGreaterThan(1.3 * (dry.q / dry.n));
    expect(wet.floods / wet.n).toBeGreaterThan(dry.floods / dry.n);
    expect([...phases].sort()).toEqual(['dryPeriod', 'wetPeriod']);
    expect(e.settings.meanDischarge).toBe(defaults.meanDischarge); // the panel's settings stay put
  });

  it('can make an Auto river braid in wet periods and meander in dry ones', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', climateSwing: 1, pattern: 'auto', valleySlope: 0.0028 });
    let most = 0, least = 1;
    for (let y = 0; y < 4000; y += 10) {
      run(e, 10);
      if (y > 200) { most = Math.max(most, e.braid); least = Math.min(least, e.braid); }
    }
    expect(most).toBeGreaterThan(0.9);
    expect(least).toBeLessThan(0.1);
  });

  it('carries on exactly after save and restore', { timeout: LONG }, () => {
    const a = run(new Engine({ ...defaults, quality: 'low', climateSwing: 0.8 }), 300);
    const b = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    run(a, 100); run(b, 100);
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(b.wet).toBe(a.wet);
  });
});
