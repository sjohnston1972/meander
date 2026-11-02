// Deterministic maths for the simulation. Math.exp, Math.log, Math.pow,
// Math.sin and Math.hypot are only approximately specified, and browsers
// (even Chrome and Node) differ in their last bits, so a river grown with
// them is not the same everywhere and share links would not reproduce. These
// versions use only + - * / and Math.sqrt, which IEEE 754 makes exact and
// identical in every JavaScript engine (JavaScript never fuses multiply-adds).
// They agree with Math to about 1e-15 relative.

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+00;
const PIO2_HI = 1.57079632673412561417e+00;
const PIO2_LO = 6.07710050650619224932e-11;
const INV_PIO2 = 6.36619772367581382433e-01;

const view = new DataView(new ArrayBuffer(8));

// 2^k for an integer k in the normal range, built from its bit pattern.
function pow2(k) {
  view.setUint32(0, ((k + 1023) << 20) >>> 0);
  view.setUint32(4, 0);
  return view.getFloat64(0);
}

function scale2(v, k) {
  if (k > 1023) return v * pow2(1023) * pow2(k - 1023);
  if (k < -1022) return v * pow2(-1022) * pow2(Math.max(-1022, k + 1022));
  return v * pow2(k);
}

export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.13) return 0;
  const k = Math.round(x * INV_LN2);
  const r = (x - k * LN2_HI) - k * LN2_LO; // |r| <= ln2 / 2
  // Taylor series, Horner form; the last term is below 1e-17 for |r| <= 0.35.
  const p = 1 + r * (1 + r * (1 / 2 + r * (1 / 6 + r * (1 / 24 + r * (1 / 120 + r * (1 / 720 + r * (1 / 5040
    + r * (1 / 40320 + r * (1 / 362880 + r * (1 / 3628800 + r * (1 / 39916800 + r * (1 / 479001600 + r / 6227020800))))))))))));
  return scale2(p, k);
}

export function log(x) {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 2.2250738585072014e-308) { x *= pow2(54); e = -54; } // subnormal
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  view.setUint32(0, ((hi & 0x000fffff) | 0x3ff00000) >>> 0);
  let m = view.getFloat64(0); // [1, 2)
  if (m > Math.SQRT2) { m *= 0.5; e += 1; }
  const f = m - 1;
  const s = f / (2 + f); // log(m) = 2 atanh(s), |s| <= 0.172
  const z = s * s;
  const series = 1 + z * (1 / 3 + z * (1 / 5 + z * (1 / 7 + z * (1 / 9 + z * (1 / 11 + z * (1 / 13
    + z * (1 / 15 + z * (1 / 17 + z * (1 / 19 + z / 21)))))))));
  return 2 * s * series + e * LN2_LO + e * LN2_HI;
}

// a^b for a >= 0.
export function pow(a, b) {
  if (a === 0) return b > 0 ? 0 : b === 0 ? 1 : Infinity;
  if (b === 1) return a;
  return exp(b * log(a));
}

function sinPoly(r) {
  const z = r * r;
  return r * (1 - z / 6 * (1 - z / 20 * (1 - z / 42 * (1 - z / 72 * (1 - z / 110 * (1 - z / 156 * (1 - z / 210)))))));
}

function cosPoly(r) {
  const z = r * r;
  return 1 - z / 2 * (1 - z / 12 * (1 - z / 30 * (1 - z / 56 * (1 - z / 90 * (1 - z / 132 * (1 - z / 182 * (1 - z / 240)))))));
}

export function sin(x) {
  if (!Number.isFinite(x)) return NaN;
  const k = Math.round(x * INV_PIO2);
  const r = (x - k * PIO2_HI) - k * PIO2_LO; // |r| <= pi/4
  switch (((k % 4) + 4) % 4) {
    case 0: return sinPoly(r);
    case 1: return cosPoly(r);
    case 2: return -sinPoly(r);
    default: return -cosPoly(r);
  }
}

export function cos(x) {
  return sin(x + Math.PI / 2);
}

export function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}
