// Engineering works placed by the visitor: a straightened and lined reach,
// a weir, a bridge, flood embankments. Plain helpers on the grid and the
// centreline; the engine owns the list of works and applies them each step.
import { WORKS, SURFACE } from '../config.js';
import { cellsNear } from './floodplain.js';
import { hypot } from './dmath.js';

// Distance from (px, py) to the segment (ax, ay)-(bx, by).
export function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Points of the river a work holds in place (lined banks, bridge abutments).
export function pinnedPoints(works, x, y, W) {
  const n = x.length;
  let mask = null;
  for (const w of works) {
    if (w.kind !== 'straighten' && w.kind !== 'bridge') continue;
    const r = w.kind === 'bridge' ? WORKS.bridgeHold * W : WORKS.liningHold * W;
    for (let i = 0; i < n; i++) {
      const d = w.kind === 'bridge' ? hypot(x[i] - w.x, y[i] - w.y) : segmentDistance(x[i], y[i], w.x0, w.y0, w.x1, w.y1);
      if (d < r) { if (!mask) mask = new Uint8Array(n); mask[i] = 1; }
    }
  }
  return mask;
}

// Keep a lined reach exactly on its line: re-spacing the river would
// otherwise round its ends a little more every step.
export function holdLines(works, x, y, W) {
  for (const w of works) {
    if (w.kind !== 'straighten') continue;
    const dx = w.x1 - w.x0, dy = w.y1 - w.y0;
    const l2 = dx * dx + dy * dy;
    if (l2 <= 0) continue;
    const r = WORKS.liningHold * W;
    for (let i = 1; i < x.length - 1; i++) {
      if (segmentDistance(x[i], y[i], w.x0, w.y0, w.x1, w.y1) >= r) continue;
      const t = Math.max(0, Math.min(1, ((x[i] - w.x0) * dx + (y[i] - w.y0) * dy) / l2));
      x[i] = w.x0 + dx * t;
      y[i] = w.y0 + dy * t;
    }
  }
}

// Line the banks of a straightened reach with stone: the cells along both
// banks become rock, which the river can hardly erode. Returns them.
export function lineBanks(grid, x0, y0, x1, y1, W) {
  const cells = cellsNear(grid, Float64Array.of(x0, x1), Float64Array.of(y0, y1), W / 2 + grid.cell * 1.2);
  const out = [];
  for (const i of cells) {
    if (grid.channel[i] === 1 || grid.channel[i] === 2 || grid.rock[i]) continue; // rock already there stays when the lining goes
    grid.rock[i] = 1;
    grid.surface[i] = SURFACE.ROCK;
    grid.veg[i] = 0;
    out.push(i);
  }
  return Int32Array.from(out);
}

// Build flood embankments along both sides of a reach: ridges `offset`
// metres either side of the river's line, standing `height` above the
// floodplain, resisting erosion. Returns the cells raised.
export function buildEmbankments(grid, x, y, from, to, offset, height) {
  const n = to - from + 1;
  const sides = [[], []];
  for (let i = from; i <= to; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(x.length - 1, i + 1);
    const tx = x[i1] - x[i0], ty = y[i1] - y[i0];
    const l = hypot(tx, ty) || 1;
    sides[0].push([x[i] + (ty / l) * offset, y[i] - (tx / l) * offset]);
    sides[1].push([x[i] - (ty / l) * offset, y[i] + (tx / l) * offset]);
  }
  const out = [];
  const lines = [];
  for (const side of sides) {
    if (n < 2) continue;
    const xs = Float64Array.from(side, (p) => p[0]), ys = Float64Array.from(side, (p) => p[1]);
    lines.push({ x: xs, y: ys });
    for (const i of cellsNear(grid, xs, ys, WORKS.embankHalfWidth)) {
      if (grid.channel[i] || grid.rock[i]) continue;
      const top = grid.base[i] + height;
      if (grid.height[i] < top) grid.height[i] = top;
      grid.rock[i] = 1;
      grid.surface[i] = SURFACE.GRASS;
      out.push(i);
    }
  }
  return { cells: Int32Array.from(out), lines };
}

// Take works' marks off the ground: lining and embankment cells go back to
// ordinary ground (embankments are levelled).
export function clearCells(grid, cells, level) {
  for (const i of cells) {
    grid.rock[i] = 0;
    if (grid.surface[i] === SURFACE.ROCK) grid.surface[i] = SURFACE.EARTH;
    if (level && grid.height[i] > grid.base[i]) grid.height[i] = grid.base[i];
  }
}
