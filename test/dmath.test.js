// The simulation's own transcendental functions. Browsers' Math.exp, pow,
// log, sin and hypot differ in their last bits, so a river grown with them
// is not the same in every browser. These are built only from + - * / and
// sqrt (exact in IEEE arithmetic everywhere), so they agree bit for bit.
import { describe, it, expect } from 'vitest';
import * as D from '../src/engine/dmath.js';

const close = (a, b, tol = 2e-15) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

describe('deterministic maths', () => {
  it('exp matches Math.exp closely', () => {
    for (let x = -40; x <= 40; x += 0.0137) expect(close(D.exp(x), Math.exp(x))).toBe(true);
    expect(D.exp(0)).toBe(1);
    expect(D.exp(-800)).toBe(0);
    expect(D.exp(800)).toBe(Infinity);
  });

  it('log matches Math.log closely', () => {
    for (let x = 1e-6; x < 1e6; x *= 1.0371) expect(close(D.log(x), Math.log(x))).toBe(true);
    expect(D.log(1)).toBe(0);
    expect(D.log(0)).toBe(-Infinity);
  });

  it('pow matches Math.pow for positive bases', () => {
    for (let a = 0.01; a < 50; a *= 1.13) for (const b of [0.25, 0.5, 1.7, 3]) expect(close(D.pow(a, b), Math.pow(a, b), 1e-13)).toBe(true);
    expect(D.pow(0, 0.5)).toBe(0);
  });

  it('sin matches Math.sin closely', () => {
    for (let x = -3000; x <= 3000; x += 0.731) expect(Math.abs(D.sin(x) - Math.sin(x))).toBeLessThan(1e-13);
  });

  it('hypot is the plain square root of the sum of squares', () => {
    expect(D.hypot(3, 4)).toBe(5);
    expect(D.hypot(-6, 8)).toBe(10);
  });

  it('gives fixed answers (the same in every JavaScript engine)', () => {
    // Values recorded once; any engine running this code must reproduce them exactly.
    expect(D.exp(1.2345)).toBe(PIN.exp);
    expect(D.log(7.89)).toBe(PIN.log);
    expect(D.pow(2.5, 0.25)).toBe(PIN.pow);
    expect(D.sin(123.456)).toBe(PIN.sin);
  });
});

const PIN = { exp: 3.436659761170463, log: 2.065596134857783, pow: 1.2574334296829355, sin: -0.8039373685728239 };
