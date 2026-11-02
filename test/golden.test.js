// Pins the default river for a few seeds. Share links promise "same seed and
// settings, same river"; any change that moves these numbers breaks old links.
// If a change is meant to alter default behaviour, update the values on purpose.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { fingerprint } from './helpers.js';

// 2026-11-02: seeds 2 and 3 re-pinned on purpose when the tall-bank rule was
// limited to incising rivers (it had been slowing ordinary rivers whose water
// profile sat low against the floodplain).
const GOLDEN = {
  1: '851f79ba:414:0',
  2: '8b4f528:348:1',
  3: '93909112:251:0',
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
