// Guard: the simulation must not use the engines' own transcendental maths or
// the ** operator (both differ between browsers). Use src/engine/dmath.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../src/engine/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'dmath.js' && f !== 'worker.js' && f !== 'autosave.js');

describe('engine maths is deterministic', () => {
  for (const f of files) {
    it(`${f} uses dmath, not Math.exp/log/pow/sin/cos/hypot or **`, () => {
      const code = readFileSync(new URL(f, DIR), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code).not.toMatch(/Math\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/);
      expect(code).not.toMatch(/\*\*/);
    });
  }
});
