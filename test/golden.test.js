// Pins the default river for a few seeds. Share links promise "same seed and
// settings, same river"; any change that moves these numbers breaks old links.
// If a change is meant to alter default behaviour, update the values on purpose.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { fingerprint } from './helpers.js';

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
