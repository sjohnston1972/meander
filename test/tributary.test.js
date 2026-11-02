// The tributary: a side river that winds, joins the main river and builds a fan.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, VALLEY } from '../src/config.js';
import { cellIndex } from '../src/engine/floodplain.js';
import { arcLength } from '../src/engine/centreline.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';
import { fingerprint } from './helpers.js';

const LONG = 300000;
const make = (extra = {}) => new Engine({ ...defaults, quality: 'low', tributary: 0.4, ...extra });
const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };

describe('tributary', () => {
  it('comes in from a valley wall and ends on the main river', { timeout: LONG }, () => {
    const e = run(make(), 50);
    const t = e.trib;
    expect(Math.min(t.y[0], VALLEY.width - t.y[0])).toBeLessThan(5);
    const m = t.x.length - 1;
    expect(t.x[m]).toBe(e.x[t.j]);
    expect(t.y[m]).toBe(e.y[t.j]);
    // Its channel is carved in the ground along its course.
    let wet = 0;
    for (let k = 2; k < m - 2; k++) if (e.grid.channel[cellIndex(e.grid, t.x[k], t.y[k])] === 1) wet++;
    expect(wet).toBeGreaterThan((m - 4) * 0.8);
    const snap = e.snapshot();
    expect(snap.channels.find((c) => c.kind === 'tributary').x.length).toBe(t.x.length);
  });

  it('winds and cuts off loops of its own', { timeout: LONG }, () => {
    const e = make();
    let most = 0;
    for (let y = 0; y < 800; y += 50) {
      run(e, 50);
      const t = e.trib, a = arcLength(t.x, t.y);
      most = Math.max(most, a[a.length - 1] / Math.hypot(t.x[t.x.length - 1] - t.x[0], t.y[t.y.length - 1] - t.y[0]));
    }
    expect(most).toBeGreaterThan(1.3);
    expect(e.oxbows.some((o) => o.width < e.settings.channelWidth)).toBe(true);
  });

  it('builds a fan and loads the main river below the junction', { timeout: LONG }, () => {
    const e = run(make(), 300);
    const t = e.trib, g = e.grid;
    // A cone of gravel against the wall where it comes in.
    let fan = 0;
    for (const o of [-120, -60, 60, 120]) {
      const i = cellIndex(g, t.entryX + o, t.entryY - t.side * 60);
      if (!g.channel[i] && g.height[i] > g.base[i] + 1) fan++;
    }
    expect(fan).toBeGreaterThan(1);
    expect(e.sediment.fromTributary).toBeGreaterThan(0);
    let below = 0;
    for (let i = t.j; i < Math.min(e.x.length, t.j + 40); i++) below = Math.max(below, e.aggr[i]);
    expect(below).toBeGreaterThan(0.1);
  });

  it('can be switched on and off while the river runs', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 20);
    expect(e.trib).toBe(null);
    e.applySettings({ tributary: 0.3 });
    run(e, 5);
    expect(e.trib).not.toBe(null);
    e.applySettings({ tributary: 0 });
    run(e, 5);
    expect(e.trib).toBe(null);
    expect(e.snapshot().channels.length).toBe(0);
  });

  it('carries on exactly after save and restore', { timeout: LONG }, () => {
    const a = run(make(), 200);
    const b = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    run(a, 50); run(b, 50);
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(Array.from(b.trib.x)).toEqual(Array.from(a.trib.x));
  });

  it('rejects a save whose tributary joins a point the river does not have', () => {
    const st = run(make(), 5).serialize();
    st.trib.j = 1e6;
    expect(() => decodeSave(encodeSave(st))).toThrow();
  });
});
