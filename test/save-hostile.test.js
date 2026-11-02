// Saves edited by hand (or by an attacker) must be rejected on load, never
// accepted and then break the engine.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';
import { sanitizeSettings, startQuality } from '../src/settings.js';

const base = () => { const e = new Engine({ ...defaults, quality: 'low' }); for (let i = 0; i < 40; i++) e.tick(); return e.serialize(); };
const rejects = (edit) => { const st = base(); edit(st); expect(() => decodeSave(encodeSave(st))).toThrow(); };

describe('hostile saves', () => {
  it('rejects a river point outside the valley', () => rejects((s) => { s.x[0] = 1e300; }));
  it('rejects a river point far outside the valley', () => rejects((s) => { s.x[0] = -1e7; }));
  it('rejects a water level array of the wrong length', () => rejects((s) => { s.level = s.level.slice(1); }));
  it('rejects a missing landDt', () => rejects((s) => { delete s.landDt; }));
  it('rejects text in the random state', () => rejects((s) => { s.rng.spare = 'x'; }));
  it('rejects a grid cell size that does not match', () => rejects((s) => { s.grid.cell = 'big'; }));
  it('rejects an absurd discharge', () => rejects((s) => { s.discharge = 1e308; }));
  it('rejects an absurd incision', () => rejects((s) => { s.incision = 1e308; }));
  it('rejects an absurd knickpoint', () => rejects((s) => { s.knickpoints = [{ pos: 0, drop: 1e308 }]; }));
  it('rejects bad flood state', () => rejects((s) => { s.floodPending = 'yes'; }));
  it('rejects a landslide push that is not a number', () => rejects((s) => { s.slides = [{ x: 1, y: 1, dirx: 1, diry: 0, width: 'wide', age: 0 }]; }));
  it('rejects a flood of landslide pushes', () => rejects((s) => { s.slides = Array.from({ length: 5000 }, () => ({ x: 1, y: 1, dirx: 1, diry: 0, width: 10, age: 0 })); }));
  it('rejects a dam whose lake lies off the grid', () => rejects((s) => {
    s.dams = [{ id: 1, x: 100, y: 100, crest: 5, natural: 4, age: 0, radius: 100, cells: Int32Array.of(-5) }];
  }));
  it('rejects a dam crest that is not a number', () => rejects((s) => {
    s.dams = [{ id: 1, x: 100, y: 100, crest: 'high', natural: 4, age: 0, radius: 100, cells: new Int32Array(0) }];
  }));
  it('rejects a gully running out of the valley', () => rejects((s) => {
    s.gullies = [{ x: 100, y: 100, dirx: 1, diry: 0, px: [100, 1e9], py: [100, 100], length: 10, maxLength: 300, footZ: 2, age: 1 }];
  }));
  it('rejects a gully with a huge course', () => rejects((s) => {
    s.gullies = [{ x: 100, y: 100, dirx: 1, diry: 0, px: new Array(100000).fill(100), py: new Array(100000).fill(100), length: 10, maxLength: 300, footZ: 2, age: 1 }];
  }));
  it('rejects more gullies than the engine ever makes', () => rejects((s) => {
    s.gullies = Array.from({ length: 200 }, () => ({ x: 100, y: 100, dirx: 1, diry: 0, px: [100, 140], py: [100, 100], length: 10, maxLength: 300, footZ: 2, age: 1 }));
  }));
  it('rejects a gully longer than any the engine makes', () => rejects((s) => {
    s.gullies = [{ x: 100, y: 100, dirx: 1, diry: 0, px: [100, 140], py: [100, 100], length: 10, maxLength: 1e7, footZ: 2, age: 1 }];
  }));
  it('rejects a gully whose course jumps across the valley', () => rejects((s) => {
    s.gullies = [{ x: 100, y: 100, dirx: 1, diry: 0, px: [100, 5900], py: [100, 2900], length: 10, maxLength: 300, footZ: 2, age: 1 }];
  }));
  it('rejects a draining oxbow with no drain rate', () => rejects((s) => {
    const e = new Engine({ ...defaults, quality: 'low' });
    for (let i = 0; i < 400; i++) e.tick();
    const n = e.x.length;
    e.cutoff(Math.floor(n / 2) - 30, Math.floor(n / 2) + 30, 'neck');
    e.tick();
    Object.assign(s, e.serialize());
    s.oxbows[0].draining = true;
    delete s.oxbows[0].drainRate;
  }));
  it('rejects a bed-change array of the wrong length', () => rejects((s) => { s.aggr = new Float64Array(3); }));
  it('rejects an absurd bed change', () => rejects((s) => { s.aggr = s.aggr.slice(); s.aggr[5] = 1e9; }));
  it('rejects a muddy-water array of the wrong length', () => rejects((s) => { s.wash = new Float64Array(3); }));
  it('rejects negative fines in the water', () => rejects((s) => { s.wash = new Float64Array(s.x.length).fill(-1); }));
  it('rejects sediment tallies that are not numbers', () => rejects((s) => { s.sediment = { ...s.sediment, exported: 'lots' }; }));
  it('rejects a flood of pending sediment', () => rejects((s) => { s.sedPending = Array.from({ length: 5000 }, () => ({ x: 1, y: 1, bed: 1, fines: 1, from: null })); }));
  it('rejects pending sediment counted in a tally that does not exist', () => rejects((s) => { s.sedPending = [{ x: 1, y: 1, bed: 1, fines: 1, from: '__proto__' }]; }));
  it('rejects an absurd load excess', () => rejects((s) => { s.loadExcess = 1e9; }));
  it('rejects a hanging loop that is not a list', () => rejects((s) => { s.hangingLoops = 'many'; }));
  it('rejects an oxbow with a strange drain flag', () => rejects((s) => {
    const e = new Engine({ ...defaults, quality: 'low' });
    for (let i = 0; i < 400; i++) e.tick();
    const n = e.x.length;
    e.cutoff(Math.floor(n / 2) - 30, Math.floor(n / 2) + 30, 'neck');
    e.tick();
    const st = e.serialize();
    Object.assign(s, st);
    s.oxbows[0].draining = 'yes';
  }));
  it('rejects a header that repeats one array many times', () => {
    const st = base();
    const bytes = encodeSave(st);
    // Rewrite the header so every history entry points at the grid height array.
    const len = new DataView(bytes.buffer).getUint32(8, true);
    const head = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + len)));
    const ref = head.grid.height;
    head.history = Array.from({ length: 2000 }, () => ({ year: 0, x: ref, y: ref }));
    const h2 = new TextEncoder().encode(JSON.stringify(head));
    const start = Math.ceil((12 + len) / 8) * 8;
    const start2 = Math.ceil((12 + h2.length) / 8) * 8;
    const out = new Uint8Array(start2 + (bytes.length - start));
    out.set(bytes.subarray(0, 8), 0);
    new DataView(out.buffer).setUint32(8, h2.length, true);
    out.set(h2, 12);
    out.set(bytes.subarray(start), start2);
    expect(() => decodeSave(out)).toThrow();
  });
  it('still accepts a normal save', () => {
    const st = base();
    expect(decodeSave(encodeSave(st)).year).toBe(st.year);
  });
});

describe('quality on touch screens', () => {
  it('starts Low on a touch screen only when no link names the river', () => {
    expect(startQuality({ quality: 'medium' }, { touch: true, fromLink: false })).toBe('low');
    expect(startQuality({ quality: 'medium' }, { touch: true, fromLink: true })).toBe('medium');
    expect(startQuality({ quality: 'high' }, { touch: false, fromLink: false })).toBe('high');
  });
  it('sanitizeSettings is unaffected', () => expect(sanitizeSettings({}, defaults).quality).toBe(defaults.quality));
});
