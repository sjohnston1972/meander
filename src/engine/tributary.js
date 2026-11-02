// A side river (settings.tributary > 0, its flow as a share of the main
// river's). It comes in from one valley wall, winds by the same Howard &
// Knutson rule as the main river, cuts off its own loops, and joins the main
// river wherever that happens to be. Plain maths on typed arrays and the
// grid; the engine owns the state and calls these each step.
import { VALLEY, TRIB, CENTRELINE, FLOODPLAIN, SURFACE, THALWEG } from '../config.js';
import { curvature, resample, smooth, migrationRate, migrate, arcLength } from './centreline.js';
import { createNoise2D } from './random.js';
import { sampleErodibility, cellIndex } from './floodplain.js';
import { hypot, pow } from './dmath.js';

// Where the tributary comes in, from the seed: { x, side } where side 1 is
// the far wall (y = VALLEY.width) and -1 the near one.
export function tributaryEntry(seed) {
  const noise = createNoise2D(seed * 27644437 + 23);
  const t = Math.min(1, Math.max(0, (noise(0.37, 0.61) - 0.2) / 0.6));
  return {
    x: VALLEY.length * (TRIB.place[0] + (TRIB.place[1] - TRIB.place[0]) * t),
    side: noise(1.37, 0.11) > 0.5 ? 1 : -1,
  };
}

export function tribWidth(s) { return Math.max(TRIB.minWidth, s.channelWidth * pow(s.tributary, TRIB.widthExponent)); }
export function tribDepth(depth) { return depth * TRIB.depthFraction; }

// A new tributary from its entry on the valley wall to the main river: a
// gentle curve that meets the main river heading down the valley, with a
// little seeded waviness for bends to grow from.
export function newTributary(s, mainX, mainY) {
  const { x: ex, side } = tributaryEntry(s.seed);
  const ey = side > 0 ? VALLEY.width - 2 : 2;
  const n = mainX.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) if (mainX[i] >= ex + 400) { j = i; break; }
  const jx = mainX[j], jy = mainY[j];
  const w = tribWidth(s);
  const pts = 64;
  const x = new Float64Array(pts), y = new Float64Array(pts);
  const cx = ex + 0.15 * (jx - ex), cy = jy + 0.35 * (ey - jy); // the control point: off the wall, then down the valley
  for (let k = 0; k < pts; k++) {
    const t = k / (pts - 1);
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    x[k] = a * ex + b * cx + c * jx;
    y[k] = a * ey + b * cy + c * jy;
  }
  const wiggle = createNoise2D(s.seed * 1299709 + 31);
  for (let k = 3; k < pts - 3; k++) y[k] += (wiggle(k / 7, 0.5) - 0.5) * 4 * w;
  const r = resample(x, y, w * CENTRELINE.spacingFactor);
  return { x: r.x, y: r.y, entryX: ex, entryX0: ex, entryY: ey, side, j, age: 0 };
}

// Migrate one step: Howard & Knutson on the tributary's own course, slower
// near the wall it comes in from and pinned at both ends.
export function migrateTributary(t, s, grid, qFactor, dt, noise) {
  const w = tribWidth(s);
  const ds = w * CENTRELINE.spacingFactor;
  const n = t.x.length;
  if (n < 8) return;
  const c = curvature(t.x, t.y);
  smooth(c, CENTRELINE.curvatureSmoothing);
  const base = s.erodibility * CENTRELINE.migrationScale * TRIB.migration * qFactor;
  const k = new Float64Array(n);
  const margin = TRIB.wallWidths * w; // it is in its own valley up there: only the last few widths are held
  const pool = t.pool && t.pool.length === n ? t.pool : null;
  for (let i = 3; i < n - 3; i++) {
    if (pool && pool[i]) continue; // a beaver pond does not migrate
    const edge = Math.min(t.y[i], VALLEY.width - t.y[i]);
    const wall = edge < margin ? (edge / margin) * (edge / margin) : 1;
    k[i] = base * wall * sampleErodibility(grid, t.x[i], t.y[i], s);
  }
  // Its own (shallower) channel feels upstream bends over a shorter reach.
  const rate = migrationRate(t.x, t.y, c, k, { omega: s.omega, gamma: s.gamma, alpha: s.alpha * (s.channelWidth / w) }, ds, w);
  const wob = CENTRELINE.bankNoise * base;
  for (let i = 3; i < n - 3; i++) rate[i] += wob * 2 * (2 * noise(i * 0.37 + t.age * 0.11, t.age * 0.05) - 1) * (k[i] / base || 0);
  migrate(t.x, t.y, rate, dt);
  // Bends in its own valley, just upstream, swing where it comes out of the hills.
  t.entryX = Math.min(VALLEY.length - w, Math.max(w, t.entryX0 + TRIB.entryWander * w * (2 * noise(t.age / TRIB.entryYears, 3.3) - 1)));
  for (let i = 1; i < n - 1; i++) {
    if (t.y[i] < w) t.y[i] = w; else if (t.y[i] > VALLEY.width - w) t.y[i] = VALLEY.width - w;
    if (t.x[i] < 0) t.x[i] = 0; else if (t.x[i] > VALLEY.length) t.x[i] = VALLEY.length;
  }
  t.x[0] = t.entryX; t.y[0] = t.entryY;
  t.curv = c;
  t.rate = rate;
}

// Join the main river: the course ends at the first point that reaches the
// main channel (the main river may have swung across it), or, if it no
// longer reaches it, runs on to the main river's nearest point. Re-spaces it.
export function joinMain(t, s, grid, mainX, mainY) {
  const w = tribWidth(s);
  let n = t.x.length;
  let end = -1;
  for (let i = 4; i < n; i++) {
    const c = cellIndex(grid, t.x[i], t.y[i]);
    if (grid.channel[c] === 1 && grid.chanSeg[c] < mainX.length) { end = i; break; }
  }
  let x = t.x, y = t.y;
  if (end > 0) { x = x.slice(0, end + 1); y = y.slice(0, end + 1); n = end + 1; }
  // The junction: the main river point nearest the tributary's end.
  const ex = x[n - 1], ey = y[n - 1];
  let j = 0, best = Infinity;
  for (let i = 0; i < mainX.length; i++) {
    const d = (mainX[i] - ex) * (mainX[i] - ex) + (mainY[i] - ey) * (mainY[i] - ey);
    if (d < best) { best = d; j = i; }
  }
  const xs = Float64Array.from(x), ys = Float64Array.from(y);
  xs[n - 1] = mainX[j]; ys[n - 1] = mainY[j];
  const r = resample(xs, ys, w * CENTRELINE.spacingFactor);
  t.x = r.x; t.y = r.y; t.j = j;
}

// Water level along the tributary: falling from its entry to the main
// river's level at the junction, never so steeply that it would stand above
// its own banks at the wall.
export function tributaryLevels(t, s, mainLevel, depth) {
  const n = t.x.length;
  const arc = arcLength(t.x, t.y);
  const total = arc[n - 1] || 1;
  const fall = Math.min(TRIB.fall * s.valleySlope * total, Math.max(0, s.bankHeight - tribDepth(depth) - 0.5));
  const lj = mainLevel[Math.min(mainLevel.length - 1, t.j)];
  const level = new Float64Array(n);
  for (let i = 0; i < n; i++) level[i] = lj + fall * (1 - arc[i] / total);
  // Beaver dams hold the water up behind them (downstream ones first).
  const pool = t.dams && t.dams.length ? new Uint8Array(n) : null;
  for (const d of t.dams || []) {
    let k = 0;
    while (k < n - 1 && arc[k] < d.a) k++;
    d.k = k;
    d.crest = level[k] + d.h;
    for (let i = k; i >= 0 && level[i] < d.crest; i--) { level[i] = d.crest; pool[i] = 1; }
  }
  t.level = level;
  t.pool = pool;
  return level;
}

// Carve the tributary's channel into the grid after the main river's stamp:
// cells within half its width become river (recorded so the next stamp
// turns those it has left into bar), with a gentle inner ramp. Never
// overwrites the main channel; skips the valley-end lake.
export function carveTributary(grid, t, s, depth, cutting) {
  const w = tribWidth(s), hw = w / 2, D = tribDepth(depth);
  const { cols, rows, cell, height, base, surface, veg, channel, chanLevel, lakeLost, bedrock, chanSeg } = grid;
  const n = t.x.length;
  const list = grid.chanList;
  const c = t.curv && t.curv.length === n ? t.curv : curvature(t.x, t.y);
  const seen = new Set();
  for (let s0 = 0; s0 < n - 1; s0++) {
    const ax = t.x[s0], ay = t.y[s0], bx = t.x[s0 + 1], by = t.y[s0 + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    const len = Math.sqrt(len2);
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw) / cell)), x1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + hw) / cell));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - hw) / cell)), y1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + hw) / cell));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * cols + cx;
        if (seen.has(i)) continue;
        const px = (cx + 0.5) * cell, py = (cy + 0.5) * cell;
        let u = ((px - ax) * dx + (py - ay) * dy) / len2;
        u = Math.max(0, Math.min(1, u));
        const d = hypot(px - (ax + dx * u), py - (ay + dy * u));
        if (d > Math.max(hw, cell * 0.55)) continue;
        seen.add(i);
        if (channel[i] === 1 || channel[i] === 4) continue; // the main river's own, or the lake
        const lvl = t.level[s0] + (t.level[s0 + 1] - t.level[s0]) * u;
        const bend = Math.min(1, Math.abs(c[s0]) * w * THALWEG.curvatureScale);
        const q = d / Math.max(hw, cell * 0.55);
        const h = lvl - (FLOODPLAIN.edgeDepth + (D * (1 + THALWEG.poolFactor * bend) - FLOODPLAIN.edgeDepth) * Math.max(0, 1 - q * q));
        if (channel[i] === 2) lakeLost[i] = 1;
        height[i] = h;
        if (cutting && bedrock[i] > height[i]) { bedrock[i] = height[i]; grid.bedrockDirty = true; }
        channel[i] = 1;
        chanSeg[i] = t.j; // whatever falls in here ends up in the main river at the junction
        chanLevel[i] = lvl;
        list.push(i);
        const localBase = lvl - D + s.bankHeight;
        if (localBase < base[i]) base[i] = localBase;
        surface[i] = SURFACE.WATER;
        veg[i] = 0;
      }
    }
  }
}

// The tributary's fan: where it comes out of the hills onto the valley floor
// it drops much of its gravel, building a low cone out from the wall.
export function growFan(grid, t, s, dt) {
  const R = TRIB.fanWidths * s.channelWidth;
  const ax = t.entryX, ay = t.entryY;
  const { cols, rows, cell, height, base, surface, veg, channel } = grid;
  const x0 = Math.max(0, Math.floor((ax - R) / cell)), x1 = Math.min(cols - 1, Math.floor((ax + R) / cell));
  const y0 = Math.max(0, Math.floor((ay - R) / cell)), y1 = Math.min(rows - 1, Math.floor((ay + R) / cell));
  const gain = TRIB.fanRate * s.tributary * dt;
  let built = 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const i = cy * cols + cx;
      if (channel[i]) continue;
      const d = hypot((cx + 0.5) * cell - ax, (cy + 0.5) * cell - ay);
      if (d > R) continue;
      const top = base[i] + TRIB.fanHeight * (1 - d / R);
      if (height[i] >= top) continue;
      height[i] = Math.min(top, height[i] + gain * (1 - d / R));
      built++;
      if (veg[i] < 0.5 && surface[i] !== SURFACE.ROCK) surface[i] = SURFACE.GRAVEL;
    }
  }
  return built;
}
