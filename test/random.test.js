import { describe, it, expect } from 'vitest';
import { createRandom } from '../src/engine/random.js';

describe('createRandom', () => {
  it('gives identical sequences for the same seed', () => {
    const a = createRandom(42), b = createRandom(42);
    const sa = Array.from({ length: 100 }, () => a.next());
    const sb = Array.from({ length: 100 }, () => b.next());
    expect(sa).toEqual(sb);
  });

  it('gives different sequences for different seeds', () => {
    const a = createRandom(1), b = createRandom(2);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('next() stays in [0, 1)', () => {
    const r = createRandom(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range, int and gaussian behave sensibly', () => {
    const r = createRandom(3);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
      const n = r.int(4);
      expect([0, 1, 2, 3]).toContain(n);
    }
    let sum = 0;
    for (let i = 0; i < 5000; i++) sum += r.gaussian();
    expect(Math.abs(sum / 5000)).toBeLessThan(0.1);
  });
});
