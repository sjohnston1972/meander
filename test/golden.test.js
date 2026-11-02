// Pins the default river for a few seeds. Share links promise "same seed and
// settings, same river"; any change that moves these numbers breaks old links.
// If a change is meant to alter default behaviour, update the values on purpose.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';

function fnv(h, bytes) {
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export function fingerprint(e) {
  let h = 2166136261;
  h = fnv(h, new Uint8Array(Float64Array.from(e.x).buffer));
  h = fnv(h, new Uint8Array(Float64Array.from(e.y).buffer));
  h = fnv(h, new Uint8Array(e.grid.height.buffer.slice(0)));
  h = fnv(h, e.grid.surface);
  return `${h.toString(16)}:${e.x.length}:${e.oxbows.length}`;
}

const GOLDEN = {
  1: '851f79ba:414:0',
  2: 'e72e05b8:351:1',
  3: '68d26572:251:0',
};

describe('default rivers are unchanged', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}, 700 years`, { timeout: 60000 }, () => {
      const e = new Engine({ ...defaults, seed, quality: 'low' });
      for (let i = 0; i < 2800; i++) e.tick();
      expect(fingerprint(e)).toBe(GOLDEN[seed]);
    });
  }
});
