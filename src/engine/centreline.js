// Centreline geometry: the river is an ordered chain of points from upstream
// (x = 0) to downstream (x = VALLEY.length). Everything here is plain maths
// on typed arrays; no three.js.
import { VALLEY, CENTRELINE } from '../config.js';

// Signed curvature (1/m) at each point from finite differences. Positive turns
// anticlockwise (left when walking downstream). Zero at the two end points.
export function curvature(x, y) {
  const n = x.length;
  const c = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const dx1 = x[i] - x[i - 1], dy1 = y[i] - y[i - 1];
    const dx2 = x[i + 1] - x[i], dy2 = y[i + 1] - y[i];
    const l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    // Curvature of the circumscribed circle through the three points.
    const cross = dx1 * dy2 - dy1 * dx2;
    const dx3 = x[i + 1] - x[i - 1], dy3 = y[i + 1] - y[i - 1];
    const l3 = Math.hypot(dx3, dy3);
    if (l3 < 1e-9) continue;
    c[i] = (2 * cross) / (l1 * l2 * l3);
  }
  return c;
}

// Cumulative distance along the polyline.
export function arcLength(x, y) {
  const n = x.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  return s;
}

// Re-space points evenly by linear interpolation; first and last points are kept.
export function resample(x, y, ds) {
  const s = arcLength(x, y);
  const total = s[s.length - 1];
  const count = Math.max(2, Math.round(total / ds)) + 1;
  const step = total / (count - 1);
  const rx = new Float64Array(count), ry = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = i === count - 1 ? total : i * step;
    while (j < s.length - 2 && s[j + 1] < target) j++;
    const seg = s[j + 1] - s[j];
    const t = seg > 0 ? (target - s[j]) / seg : 0;
    rx[i] = x[j] + (x[j + 1] - x[j]) * t;
    ry[i] = y[j] + (y[j + 1] - y[j]) * t;
  }
  rx[0] = x[0]; ry[0] = y[0];
  rx[count - 1] = x[x.length - 1]; ry[count - 1] = y[y.length - 1];
  return { x: rx, y: ry };
}

// In-place 3-point moving average; end values never change.
export function smooth(arr, passes = 1) {
  const n = arr.length;
  if (n < 3) return arr;
  const tmp = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    tmp.set(arr);
    for (let i = 1; i < n - 1; i++) arr[i] = (tmp[i - 1] + 2 * tmp[i] + tmp[i + 1]) * 0.25;
  }
  return arr;
}

// Initial channel: a line down the middle of the valley with seeded wiggles.
export function initialCentreline(settings, rng) {
  const W = settings.channelWidth;
  const ds = W * CENTRELINE.spacingFactor;
  const n = Math.round(VALLEY.length / ds) + 1;
  const x = new Float64Array(n), y = new Float64Array(n);
  const mid = VALLEY.width / 2;
  const shape = settings.startShape;
  // Sum of a few random sine waves for 'wiggle'.
  const waves = [];
  for (let k = 0; k < 4; k++) {
    waves.push({
      amp: rng.range(0.4, 1) * CENTRELINE.wiggleAmplitude * W / (k + 1),
      len: rng.range(0.6, 1.4) * CENTRELINE.wiggleWavelength * W * (k + 1) * 0.6,
      phase: rng.range(0, Math.PI * 2),
    });
  }
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    x[i] = t * VALLEY.length;
    let off = 0;
    if (shape === 'wiggle') {
      for (const w of waves) off += w.amp * Math.sin((x[i] / w.len) * Math.PI * 2 + w.phase);
    } else if (shape === 'sine') {
      off = CENTRELINE.sineAmplitude * W * Math.sin((x[i] / (CENTRELINE.sineWavelength * W)) * Math.PI * 2);
    }
    // Taper the offset to zero at both fixed ends.
    const taper = Math.sin(Math.PI * t) ** 0.5;
    y[i] = mid + off * taper;
  }
  x[n - 1] = VALLEY.length;
  return { x, y };
}

// Howard & Knutson (1984) migration rate, as used by meanderpy.
//   R0(s) = C(s) · W
//   R1(s) = k(s) · [ Ω R0(s) + Γ · Σ_upstream R0(s−ξ) e^{−αξ} / Σ e^{−αξ} ]
// The upstream sum is an exponential filter run once from upstream to
// downstream, so this is O(n). `k` is the local erodibility in m/yr per unit
// of (curvature × width); `W` is channel width. Positive rate moves the point
// towards the outer bank (to the right of flow for a left-turning bend).
export function migrationRate(x, y, c, k, params, ds, W) {
  const n = x.length;
  const rate = new Float64Array(n);
  const { omega, gamma, alpha } = params;
  // The upstream average deliberately excludes the local point: including it
  // makes the scheme anti-diffusive at short wavelengths when alpha·ds is not
  // small, and the river explodes into tiny loops.
  let sum = 0, norm = 0;
  for (let i = 0; i < n; i++) {
    const r0 = c[i] * W;
    const seg = i === 0 ? ds : Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    const w = Math.exp(-alpha * seg);
    const upstream = norm > 0 ? sum / norm : 0;
    // Local erodibility scales the whole rate: a rock bank does not move just
    // because the bend upstream is sharp.
    let r1 = k[i] * (omega * r0 + gamma * upstream);
    sum = r0 + w * sum;
    norm = 1 + w * norm;
    if (r1 > CENTRELINE.maxRate) r1 = CENTRELINE.maxRate;
    else if (r1 < -CENTRELINE.maxRate) r1 = -CENTRELINE.maxRate;
    rate[i] = r1;
  }
  return rate;
}

// Move every interior point sideways along its right-hand normal by rate × dt.
export function migrate(x, y, rate, dt) {
  const n = x.length;
  const nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const tx = x[i + 1] - x[i - 1], ty = y[i + 1] - y[i - 1];
    const l = Math.hypot(tx, ty) || 1;
    nx[i] = ty / l; ny[i] = -tx / l; // right-hand normal (looking downstream)
  }
  for (let i = 1; i < n - 1; i++) {
    const d = rate[i] * dt;
    x[i] += d * nx[i];
    y[i] += d * ny[i];
  }
}

// Neck cutoff search: two points far apart along the river but closer than
// `cutoffDistance` in space. Uses a spatial hash so it is O(n) per step.
// Returns the closest such pair, or null.
export function findNeckCutoff(x, y, minSeparationPoints, cutoffDistance, endProtection) {
  const n = x.length;
  const cell = cutoffDistance;
  const grid = new Map();
  const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;
  for (let i = endProtection; i < n - endProtection; i++) {
    const k = key(Math.floor(x[i] / cell), Math.floor(y[i] / cell));
    let b = grid.get(k);
    if (!b) { b = []; grid.set(k, b); }
    b.push(i);
  }
  let best = null, bestD = cutoffDistance;
  for (let i = endProtection; i < n - endProtection; i++) {
    const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const b = grid.get(key(cx + ox, cy + oy));
      if (!b) continue;
      for (const j of b) {
        if (j - i < minSeparationPoints) continue;
        const d = Math.hypot(x[j] - x[i], y[j] - y[i]);
        if (d < bestD) { bestD = d; best = { i, j }; }
      }
    }
  }
  return best;
}

// Remove points i+1 .. j-1 and return the new chain plus the abandoned loop.
export function spliceCutoff(x, y, i, j) {
  const n = x.length;
  const m = n - (j - i - 1);
  const nx = new Float64Array(m), ny = new Float64Array(m);
  nx.set(x.subarray(0, i + 1)); ny.set(y.subarray(0, i + 1));
  nx.set(x.subarray(j), i + 1); ny.set(y.subarray(j), i + 1);
  const loop = { x: Float64Array.from(x.subarray(i, j + 1)), y: Float64Array.from(y.subarray(i, j + 1)) };
  return { x: nx, y: ny, loop };
}

// Chute cutoff: during a flood a tight bend may be short-cut across its point
// bar. For each tight bend apex, roll the dice; if it fires, return the pair
// (i, j) bracketing the apex with the longest river distance whose straight
// line distance is still short.
export function findChuteCutoff(x, y, c, rng, chance, ds, W, endProtection) {
  if (chance <= 0) return null;
  const n = x.length;
  const minSep = Math.round((CENTRELINE.chuteMinWidths * W) / ds);
  const maxSep = Math.round((CENTRELINE.chuteMaxWidths * W) / ds);
  const chord = CENTRELINE.chuteChordFraction;
  const minCurv = CENTRELINE.chuteMinCurvature / W;
  for (let a = endProtection + 1; a < n - endProtection - 1; a++) {
    const ca = Math.abs(c[a]);
    if (ca < minCurv) continue;
    if (!(ca >= Math.abs(c[a - 1]) && ca > Math.abs(c[a + 1]))) continue; // local apex
    if (!rng.chance(chance)) continue;
    let best = null;
    for (let i = Math.max(endProtection, a - maxSep); i < a; i++) {
      for (let j = a + 1; j <= Math.min(n - 1 - endProtection, i + maxSep); j++) {
        const sep = j - i;
        if (sep < minSep) continue;
        const d = Math.hypot(x[j] - x[i], y[j] - y[i]);
        // A real shortcut: the straight line is much shorter than the river path it replaces.
        if (d <= chord * sep * ds && (!best || sep > best.j - best.i)) best = { i, j };
      }
    }
    if (best) return best;
  }
  return null;
}
