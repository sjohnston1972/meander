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
