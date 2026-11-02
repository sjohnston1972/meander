// Pins the default river for a few seeds. Share links promise "same seed and
// settings, same river"; any change that moves these numbers breaks old links.
// If a change is meant to alter default behaviour, update the values on purpose.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { fingerprint } from './helpers.js';

// 2026-11-02: re-pinned on purpose twice: when the tall-bank rule was limited
// to incising rivers, and when the engine moved to its own deterministic
// maths (src/engine/dmath.js) so the same link gives the same river in every
// browser. scripts/determinism.mjs checks Chromium, Firefox and WebKit.
const GOLDEN = {
  1: '10be64bd:414:0',
  2: 'b2068e3a:348:1',
  3: '5c5b5bb4:251:0',
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
