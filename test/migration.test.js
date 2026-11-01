import { describe, it, expect } from 'vitest';
import {
  curvature, resample, migrationRate, migrate, findNeckCutoff, spliceCutoff, findChuteCutoff,
} from '../src/engine/centreline.js';
import { createRandom } from '../src/engine/random.js';

const params = { omega: -1, gamma: 2.5, alpha: 0.012 };

function sineRiver(amp, wavelength, length, ds) {
  const n = Math.round(length / ds) + 1;
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = (i / (n - 1)) * length;
    y[i] = amp * Math.sin((x[i] / wavelength) * Math.PI * 2);
  }
  return { x, y };
}

// Two parallel limbs joined by a tight U-turn, like a meander about to cut off.
function hairpin(gap, limbPoints, ds, endPad = 20) {
  const xs = [], ys = [];
  for (let i = 0; i < endPad; i++) { xs.push(i * ds); ys.push(0); }
  const x0 = endPad * ds;
  for (let i = 0; i < limbPoints; i++) { xs.push(x0 + i * ds); ys.push(0); }
  const arcN = 8;
  for (let i = 1; i < arcN; i++) {
    const a = Math.PI * (i / arcN);
    xs.push(x0 + limbPoints * ds + Math.sin(a) * gap / 2);
    ys.push(gap / 2 - Math.cos(a) * gap / 2);
  }
  for (let i = limbPoints - 1; i >= 0; i--) { xs.push(x0 + i * ds); ys.push(gap); }
  for (let i = 0; i < endPad; i++) { xs.push(x0 - (i + 1) * ds); ys.push(gap); }
  return { x: Float64Array.from(xs), y: Float64Array.from(ys) };
}

describe('migrationRate', () => {
  it('grows a sine bend and skews it downstream', () => {
    const W = 60, ds = 30;
    let { x, y } = sineRiver(20, 600, 3000, ds);
    const n0 = x.length;
    const firstPeak0 = (() => { let b = 0; for (let i = 0; i < n0 / 4; i++) if (y[i] > y[b]) b = i; return x[b]; })();
    for (let step = 0; step < 200; step++) {
      const c = curvature(x, y);
      const k = new Float64Array(x.length).fill(1);
      const rate = migrationRate(x, y, c, k, params, ds, W);
      migrate(x, y, rate, 1);
      ({ x, y } = resample(x, y, ds));
    }
    let maxAbs = 0; for (const v of y) maxAbs = Math.max(maxAbs, Math.abs(v));
    expect(maxAbs).toBeGreaterThan(20);
    expect(Number.isFinite(maxAbs)).toBe(true);
    let b = 0; for (let i = 0; i < x.length / 4; i++) if (y[i] > y[b]) b = i;
    expect(x[b]).toBeGreaterThan(firstPeak0);
  });

  it('leaves the fixed ends in place', () => {
    const ds = 30;
    const { x, y } = sineRiver(20, 600, 3000, ds);
    const c = curvature(x, y);
    const k = new Float64Array(x.length).fill(1);
    const rate = migrationRate(x, y, c, k, params, ds, 60);
    migrate(x, y, rate, 1);
    expect(x[0]).toBe(0); expect(y[0]).toBe(0);
    expect(x[x.length - 1]).toBe(3000);
  });
});

describe('neck cutoffs', () => {
  it('finds a hairpin whose limbs are closer than the cutoff distance', () => {
    const { x, y } = hairpin(50, 40, 30);
    const hit = findNeckCutoff(x, y, 20, 60, 6);
    expect(hit).not.toBeNull();
    expect(hit.j - hit.i).toBeGreaterThanOrEqual(40);
  });

  it('ignores limbs further apart than the cutoff distance', () => {
    const { x, y } = hairpin(150, 40, 30);
    expect(findNeckCutoff(x, y, 20, 60, 6)).toBeNull();
  });

  it('never cuts within the protected end points', () => {
    const { x, y } = hairpin(50, 10, 30, 3); // 33 points, all inside a 30-point protected zone
    expect(findNeckCutoff(x, y, 10, 60, 30)).toBeNull();
  });

  it('splices out the loop and returns it', () => {
    const { x, y } = hairpin(50, 40, 30);
    const { i, j } = findNeckCutoff(x, y, 20, 60, 6);
    const out = spliceCutoff(x, y, i, j);
    expect(out.x.length).toBe(x.length - (j - i - 1));
    expect(out.loop.x.length).toBe(j - i + 1);
    expect(out.x[i]).toBe(x[i]);
    expect(out.x[i + 1]).toBe(x[j]);
  });
});

describe('chute cutoffs', () => {
  it('finds a shortcut across a tight bend when the dice say so', () => {
    const W = 60, ds = 30;
    const { x, y } = hairpin(150, 10, ds); // tight bend 150 m across, ~2.5 W
    const c = curvature(x, y);
    const rng = createRandom(1);
    const hit = findChuteCutoff(x, y, c, rng, 1, ds, W, 6);
    expect(hit).not.toBeNull();
    expect(hit.j - hit.i).toBeGreaterThan(2);
  });

  it('never fires with zero chance', () => {
    const W = 60, ds = 30;
    const { x, y } = hairpin(150, 10, ds);
    const c = curvature(x, y);
    expect(findChuteCutoff(x, y, c, createRandom(1), 0, ds, W, 6)).toBeNull();
  });
});
