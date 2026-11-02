// Bed material (sand and gravel) carried down the river: the Exner equation
// along the centreline. The river can carry k·S cubic metres a year, where S
// is the water-surface slope and k = transport coefficient × discharge. Where
// more arrives than it can carry the bed builds up; where less, it is
// scoured. With the bed change z (metres above the reference profile) in the
// slope, S = S_ref − dz/ds, this is a diffusion of the bed, solved implicitly
// (one tridiagonal system per step, stable for any step length).
//
//   (1 − p)·W·ds·dz_i/dt = F_{i−½} − F_{i+½} + L_i,   F = k·(S_ref − dz/ds)
//
// The first point takes `inflow` from upstream; the last holds the base level
// (z = 0). Nothing flows on out of a lake point (`pool`), so sediment the
// river brings into a lake stays at its head. Afterwards z is kept within
// [zMin, zMax]: what a full bed cannot hold passes on downstream; what
// bedrock stops being scoured is returned as `clipped` (m^3).
//
// `r` holds z, k, S (per face, n − 1), L (m^3/yr per point), pool, zMin,
// zMax, inflow (m^3/yr), dt, width (metres: a number, or one per point, e.g.
// a lake wider than the channel), ds, porosity. z is updated in place.
// Returns { out: m^3/yr leaving past the last point, clipped: m^3 }.
const scratch = { n: 0 };

export function solveBed(r) {
  const { z, k, S, L, pool, zMin, zMax, inflow, dt, width, ds, porosity } = r;
  const n = z.length;
  if (scratch.n < n) {
    scratch.n = n;
    scratch.lower = new Float64Array(n); scratch.diag = new Float64Array(n); scratch.upper = new Float64Array(n);
    scratch.rhs = new Float64Array(n); scratch.c = new Float64Array(n); scratch.d = new Float64Array(n);
  }
  const { lower, diag, upper, rhs, c, d } = scratch;
  const wide = typeof width !== 'number';
  const w = (i) => (wide ? width[i] : width);
  const cond = k / ds;
  // Face f (between points f and f + 1) carries k·S_f plus the bed-slope
  // term; out of a lake point it carries nothing, and into one it carries
  // the river's load without feeling the lake bed (a delta takes all it is given).
  const flows = (f) => f >= 0 && f < n - 1 && !pool[f];
  const condOf = (f) => (flows(f) && !pool[f + 1] ? cond : 0);
  for (let i = 0; i < n - 1; i++) {
    const a = dt / ((1 - porosity) * w(i) * ds);
    const cl = i > 0 ? condOf(i - 1) : 0;
    const cr = condOf(i);
    const fin = i === 0 ? inflow : (flows(i - 1) ? k * S[i - 1] : 0);
    const fout = flows(i) ? k * S[i] : 0;
    lower[i] = -a * cl;
    upper[i] = -a * cr;
    diag[i] = 1 + a * (cl + cr);
    rhs[i] = z[i] + a * (fin - fout + (L ? L[i] : 0));
  }
  lower[n - 1] = 0; upper[n - 1] = 0; diag[n - 1] = 1; rhs[n - 1] = 0; // the outlet holds the base level
  // Thomas algorithm.
  c[0] = upper[0] / diag[0];
  d[0] = rhs[0] / diag[0];
  for (let i = 1; i < n; i++) {
    const m = diag[i] - lower[i] * c[i - 1];
    c[i] = upper[i] / m;
    d[i] = (rhs[i] - lower[i] * d[i - 1]) / m;
  }
  z[n - 1] = d[n - 1];
  for (let i = n - 2; i >= 0; i--) z[i] = d[i] - c[i] * z[i + 1];
  // A bed already built up to its cap cannot take more: the rest passes on
  // downstream, and out of the valley if it gets that far. Scour stops at
  // bedrock (the river simply carries less).
  const f = n - 2;
  const flux = flows(f) ? k * S[f] - condOf(f) * (z[f + 1] - z[f]) : 0;
  let clipped = 0, passed = 0;
  const vol = (i) => (1 - porosity) * w(i) * ds; // m^3 per metre of bed change at point i
  for (let i = 0; i < n - 1; i++) {
    if (z[i] > zMax[i]) {
      const extra = (z[i] - zMax[i]) * vol(i);
      z[i] = zMax[i];
      if (i < n - 2) z[i + 1] += extra / vol(i + 1); else passed += extra;
    } else if (z[i] < zMin[i]) {
      clipped += (zMin[i] - z[i]) * vol(i);
      z[i] = zMin[i];
    }
  }
  return { out: flux + passed / dt, clipped };
}
