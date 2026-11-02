// Wood in the river: log jams and beavers.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, SURFACE, BEAVER } from '../src/config.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';
import { fingerprint } from './helpers.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };
const wooded = (extra = {}) => new Engine({ ...defaults, quality: 'low', channelWidth: 22, logJams: true, beavers: true, ...extra });

describe('log jams', () => {
  it('form on a wooded river and back the water up behind them', { timeout: LONG }, () => {
    const e = wooded({ beavers: false });
    let made = 0;
    for (let y = 0; y < 800 && !e.jams.length; y += 10) run(e, 10);
    made = e.jamCount;
    expect(made).toBeGreaterThan(0);
    const jm = e.jams[0];
    const j = e.nearestPoint(jm.x, jm.y);
    const above = Math.max(0, j - 2);
    expect(e.level[above] - (e.refLevel[above] + e.aggr[above])).toBeGreaterThan(jm.height * 0.5);
    expect(e.findFeatures().some((f) => f.type === 'logjam')).toBe(true);
    expect(e.snapshot().wood.some((w) => w.kind === 'jam')).toBe(true);
  });

  it('do not form unless switched on, and go when switched off', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low', channelWidth: 22 }), 300);
    expect(e.jamCount).toBe(0);
    const w = wooded({ beavers: false });
    for (let y = 0; y < 800 && !w.jams.length; y += 10) run(w, 10);
    w.applySettings({ logJams: false });
    run(w, 2);
    expect(w.jams.length).toBe(0);
  });
});

describe('beavers', () => {
  it('dam a narrow river, and their old ponds turn to meadow', { timeout: LONG }, () => {
    const e = wooded({ logJams: false });
    let seen = false, marsh = 0;
    for (let y = 0; y < 600; y += 10) {
      run(e, 10);
      if (e.dams.some((d) => d.kind === 'beaver' && d.cells.length)) seen = true;
    }
    for (const v of e.grid.surface) if (v === SURFACE.MARSH) marsh++;
    expect(seen).toBe(true);
    expect(marsh).toBeGreaterThan(0);
  });

  it('leave a wide river alone but dam a narrow tributary', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', beavers: true, tributary: 0.2 });
    let pond = false;
    for (let y = 0; y < 600 && !pond; y += 10) { run(e, 10); pond = (e.trib.dams || []).some((d) => d.cells.length > 0); }
    expect(e.dams.some((d) => d.kind === 'beaver')).toBe(false);
    expect(pond).toBe(true);
    expect(e.snapshot().ponds.some((p) => String(p.id).startsWith('t'))).toBe(true);
  });

  it('keep oxbow lakes open with lodges', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', beavers: true });
    for (let y = 0; y < 2000 && !e.oxbows.some((o) => o.lodge); y += 20) run(e, 20);
    const o = e.oxbows.find((v) => v.lodge);
    expect(o).toBeTruthy();
    const d0 = o.depth;
    run(e, 10);
    const lost = d0 - o.depth;
    const plain = (e.depth / 150) * e.settings.infillRate * 10;
    expect(lost).toBeLessThan(plain * (BEAVER.lodgeInfill + 0.05));
  });

  it('carry on exactly after save and restore', { timeout: LONG }, () => {
    const a = run(wooded({ tributary: 0.2 }), 300);
    const b = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    run(a, 60); run(b, 60);
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(b.jamCount).toBe(a.jamCount);
  });

  it('refuse saves with a damaged jam or beaver dam', () => {
    const st = run(wooded({ tributary: 0.2 }), 3).serialize();
    st.jams = [{ id: 1, x: 100, y: 100, height: 'tall', age: 0, life: 10, side: 1 }];
    expect(() => decodeSave(encodeSave(st))).toThrow();
    const st2 = run(wooded({ tributary: 0.2 }), 3).serialize();
    st2.dams = [{ id: 1, kind: 'castle', x: 100, y: 100, crest: 5, natural: 4, age: 0, radius: 50, cells: new Int32Array(0) }];
    expect(() => decodeSave(encodeSave(st2))).toThrow();
  });
});
