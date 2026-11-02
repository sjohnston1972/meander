import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { encodeSave, decodeSave, SAVE_VERSION } from '../src/engine/savefile.js';
import { sanitizeSettings } from '../src/settings.js';
import { fingerprint } from './helpers.js';

const LONG = 120000;
const run = (e, n) => { for (let i = 0; i < n; i++) e.tick(); };

describe('save and resume', () => {
  it('a restored engine carries on exactly as if it never stopped', { timeout: LONG }, () => {
    const s = { ...defaults, seed: 2, quality: 'low', incisionRate: 3 };
    const b = new Engine(s);
    run(b, 1000);
    b.triggerFlood();
    const state = structuredClone(b.serialize());
    const c = Engine.fromState(state);
    // replay the same flood on the uninterrupted engine at the same moment
    const a2 = new Engine(s);
    run(a2, 1000); a2.triggerFlood(); run(a2, 1000);
    run(c, 1000);
    expect(fingerprint(c)).toBe(fingerprint(a2));
    expect(c.year).toBe(a2.year);
    expect(c.incision).toBeCloseTo(a2.incision, 9);
  });

  it('serialize copies: running on does not change a saved state', () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    run(e, 40);
    const st = e.serialize();
    const x0 = st.x[20], h0 = st.grid.height[1000];
    run(e, 40);
    expect(st.x[20]).toBe(x0);
    expect(st.grid.height[1000]).toBe(h0);
  });

  it('the file format round-trips', () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    run(e, 200);
    const st = e.serialize();
    const back = decodeSave(encodeSave(st));
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.year).toBe(st.year);
    expect(Array.from(back.x)).toEqual(Array.from(st.x));
    expect(back.grid.height).toBeInstanceOf(Float32Array);
    expect(Array.from(back.grid.height.subarray(0, 500))).toEqual(Array.from(st.grid.height.subarray(0, 500)));
    expect(back.lastHistoryYear).toBe(st.lastHistoryYear);
    const c = Engine.fromState(back);
    run(c, 10);
    expect(Number.isFinite(c.x[10])).toBe(true);
  });

  it('rejects files that are not Meander saves', () => {
    expect(() => decodeSave(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => decodeSave(new TextEncoder().encode('MEANDER9garbage'))).toThrow();
  });

  it('rejects a save whose grid does not match its quality', () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    const st = e.serialize();
    st.grid.height = new Float32Array(10);
    expect(() => decodeSave(encodeSave(st))).toThrow(/grid/i);
  });

  it('clamps settings from a save to the slider ranges', () => {
    const out = sanitizeSettings({ channelWidth: 1e9, quality: 'ultra', seed: 'x', hardRock: 'yes', bogus: 1 }, defaults);
    expect(out.channelWidth).toBe(150);
    expect(out.quality).toBe(defaults.quality);
    expect(out.seed).toBe(defaults.seed);
    expect(out.hardRock).toBe(defaults.hardRock);
    expect('bogus' in out).toBe(false);
  });

  it('a gorge with landslides, dams, gullies and hanging loops carries on exactly after a save', { timeout: 300000 }, () => {
    const s = { ...defaults, quality: 'low', incisionRate: 15 };
    const a = new Engine(s);
    run(a, 2500 / 0.25);
    a.triggerLandslide();
    const n = a.x.length;
    a.makeDam(Math.floor(n * 0.6), 1.2);
    a.cutoff(Math.floor(n / 2) - 30, Math.floor(n / 2) + 30, 'neck');
    run(a, 1); // levels follow the new course on the next step
    expect(a.gullies.length).toBeGreaterThan(0);
    const c = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    expect(c.gullies.length).toBe(a.gullies.length);
    expect(c.dams.length).toBe(a.dams.length);
    run(a, 800); run(c, 800);
    expect(fingerprint(c)).toBe(fingerprint(a));
    expect(c.hangingLoops).toEqual(a.hangingLoops);
    expect(c.slideMarks).toEqual(a.slideMarks);
  });

  it('opens a save from before gorges had landslides and gullies', () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 10 });
    run(e, 200);
    const st = e.serialize();
    for (const k of ['slides', 'slideMarks', 'dams', 'damCount', 'gullies', 'hangingLoops']) delete st[k];
    const c = Engine.fromState(decodeSave(encodeSave(st)));
    run(c, 40);
    expect(c.gullies).toEqual([]);
    expect(Number.isFinite(c.x[10])).toBe(true);
  });
});
