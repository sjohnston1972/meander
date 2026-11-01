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
