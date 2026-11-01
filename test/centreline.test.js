import { describe, it, expect } from 'vitest';
import { curvature, arcLength, resample, smooth, initialCentreline } from '../src/engine/centreline.js';
import { createRandom } from '../src/engine/random.js';
import { VALLEY, defaults } from '../src/config.js';

function circle(radius, n) {
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 1.5;
    x[i] = radius * Math.cos(a);
    y[i] = radius * Math.sin(a);
  }
  return { x, y };
}

describe('curvature', () => {
  it('is 1/radius on a circle (anticlockwise = positive)', () => {
    const { x, y } = circle(100, 200);
    const c = curvature(x, y);
    for (let i = 5; i < 195; i++) {
      expect(c[i]).toBeGreaterThan(0.0098);
      expect(c[i]).toBeLessThan(0.0102);
    }
  });

  it('is zero on a straight line and at the ends', () => {
    const x = Float64Array.from({ length: 20 }, (_, i) => i * 3);
    const y = new Float64Array(20);
    const c = curvature(x, y);
    expect(c[0]).toBe(0);
    expect(c[19]).toBe(0);
    for (const v of c) expect(Math.abs(v)).toBeLessThan(1e-12);
  });
});

describe('arcLength', () => {
  it('accumulates distance along the polyline', () => {
    const x = Float64Array.from([0, 3, 3]);
    const y = Float64Array.from([0, 4, 10]);
    expect(Array.from(arcLength(x, y))).toEqual([0, 5, 11]);
  });
});

describe('resample', () => {
  it('spaces points evenly and keeps the end points', () => {
    const x = Float64Array.from([0, 50, 100]);
    const y = Float64Array.from([0, 0, 0]);
    const r = resample(x, y, 10);
    expect(r.x.length).toBe(11);
    expect(r.x[0]).toBe(0);
    expect(r.x[10]).toBeCloseTo(100, 9);
    for (let i = 1; i < 11; i++) expect(r.x[i] - r.x[i - 1]).toBeCloseTo(10, 9);
  });

  it('follows a bent polyline', () => {
    const x = Float64Array.from([0, 30, 30]);
    const y = Float64Array.from([0, 0, 40]);
    const r = resample(x, y, 10);
    expect(r.x.length).toBe(8);
    expect(r.y[7]).toBeCloseTo(40, 9);
    expect(r.x[3]).toBeCloseTo(30, 9);
  });
});

describe('smooth', () => {
  it('reduces a spike but keeps the ends fixed', () => {
    const a = Float64Array.from([0, 0, 10, 0, 0]);
    smooth(a, 1);
    expect(a[0]).toBe(0);
    expect(a[4]).toBe(0);
    expect(a[2]).toBeLessThan(10);
    expect(a[1]).toBeGreaterThan(0);
  });
});

describe('initialCentreline', () => {
  it('runs from the upstream edge to the downstream edge of the valley', () => {
    const rng = createRandom(1);
    const { x, y } = initialCentreline(defaults, rng);
    expect(x[0]).toBe(0);
    expect(x[x.length - 1]).toBeCloseTo(VALLEY.length, 6);
    for (const v of y) {
      expect(v).toBeGreaterThan(VALLEY.width * 0.3);
      expect(v).toBeLessThan(VALLEY.width * 0.7);
    }
  });

  it('is deterministic for a seed and has wiggles', () => {
    const a = initialCentreline(defaults, createRandom(5));
    const b = initialCentreline(defaults, createRandom(5));
    expect(Array.from(a.y)).toEqual(Array.from(b.y));
    const spread = Math.max(...a.y) - Math.min(...a.y);
    expect(spread).toBeGreaterThan(1);
  });

  it('straight start shape has no wiggles', () => {
    const { y } = initialCentreline({ ...defaults, startShape: 'straight' }, createRandom(5));
    expect(Math.max(...y) - Math.min(...y)).toBeLessThan(1e-9);
  });
});
