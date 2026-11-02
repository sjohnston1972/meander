// Valley walls of an incising river: slumping to a stable slope, soil creep
// that rounds the rims, bedrock in alternating hard and soft layers (hard
// layers stand as cliffs, soft ones as slopes, so walls step), and rockfall
// that sheds rock from steep faces onto scree at their foot.
import { VALLEY, SURFACE, FLOODPLAIN, HILLS } from '../config.js';
import { effectiveDepth, baseLevel } from './floodplain.js';
import { sin, cos } from './dmath.js';

// 1 in a hard rock layer, 0 in a soft one. Layers are flat beds that dip
// with the valley, measured from the original floodplain, so they move with
// the ground when the valley slope or bank height changes.
export function rockHardness(z, x, settings) {
  const t = (z - baseLevel(x, settings)) / HILLS.layerThickness + 0.3;
  return t - Math.floor(t) < HILLS.hardFraction ? 1 : 0;
}

// Where two neighbouring dry cells differ by more than a stable slope allows,
// material slides from the high one to the low one. A bluff beside the river
// slumps too, down to a stable slope above the river's own floodplain level,
// and the river carries the debris away. Creep and rockfall act over `dt`
// years. The engine runs this only while the river is cutting down, so
// ordinary banks (and every non-incising river) stay as the channel stamp
// made them. What slumps into the river is added to `sink` (m^3, indexed by
// the centreline segment that carved the river cell), when given.
export function relaxSlopes(grid, settings, dt = 1, sink = null) {
  const { cols, rows, cell, height, channel, chanLevel, bedrock, surface, veg } = grid;
  const passes = FLOODPLAIN.scarpPasses;
  const soil = cell * FLOODPLAIN.scarpSlope;
  const softRock = cell * HILLS.softRockSlope;
  const hardRock = cell * HILLS.hardRockSlope;
  const creepMin = cell * HILLS.creepMinSlope;
  const creep = Math.min(0.2, (HILLS.creep * dt) / (passes * cell * cell));
  const fall = (HILLS.rockfall * dt) / passes;
  const D = effectiveDepth(settings);
  const bank = settings.bankHeight;
  const rockLimit = (z, x) => (rockHardness(z, x, settings) ? hardRock : softRock);
  // Dry cell `d` beside river cell `r`: no higher than one stable step above
  // the floodplain that river builds.
  const area = cell * cell;
  const { chanSeg } = grid;
  const bluff = (d, r, x) => {
    const plain = chanLevel[r] - D + bank;
    const cap = plain + (chanLevel[r] - D < bedrock[d] ? rockLimit(plain, x) : soil);
    if (height[d] > cap) {
      if (sink && chanSeg[r] < sink.length) sink[chanSeg[r]] += (height[d] - cap) * area;
      height[d] = cap;
    }
  };
  const relax = (i, j, x) => {
    const ci = channel[i], cj = channel[j];
    if (ci || cj) {
      if (ci === 1 && !cj) bluff(j, i, x);
      else if (cj === 1 && !ci) bluff(i, j, x);
      return;
    }
    let hi = i, lo = j;
    if (height[j] > height[i]) { hi = j; lo = i; }
    let d = height[hi] - height[lo];
    if (d <= creepMin) return;
    // Creep: a little soil moves down every slope steeper than creepMin.
    let move = creep * (d - creepMin);
    const rock = height[lo] < bedrock[hi];
    const limit = rock ? rockLimit((height[hi] + height[lo]) / 2, x) : soil;
    if (d - 2 * move > limit) move = (d - limit) / 2; // slump to the stable slope
    if (rock && d > softRock) {
      // Rockfall from a steep rock face: the debris lands as scree.
      move += Math.min(fall, (d - 2 * move) / 2);
      if (surface[lo] !== SURFACE.WATER) { surface[lo] = SURFACE.SCREE; veg[lo] *= 0.7; }
    }
    height[hi] -= move;
    height[lo] += move;
  };
  for (let pass = 0; pass < passes; pass++) {
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        const x = (cx + 0.5) * cell;
        if (cx < cols - 1) relax(i, i + 1, x);
        if (cy < rows - 1) relax(i, i + cols, x);
      }
    }
  }
}

// From a cell on a valley wall: climb to the rim, then walk down the steepest
// way to the foot. Returns the wall there, or null if it is not tall enough
// to fail.
export function findSlideSite(grid, start) {
  const { cols, rows, cell, height, channel } = grid;
  if (channel[start]) return null;
  const flat = cell * HILLS.creepMinSlope;
  const step = (i, up) => {
    const cx = i % cols, cy = (i - cx) / cols;
    let best = -1, bestD = flat;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (channel[j] === 2) continue;
      const d = ((up ? height[j] - height[i] : height[i] - height[j]) * (dx && dy ? 0.7071 : 1));
      if (d > bestD) { bestD = d; best = j; }
    }
    return best;
  };
  let crest = start;
  for (let k = 0; k < 40; k++) { const j = step(crest, true); if (j < 0 || channel[j]) break; crest = j; }
  let foot = crest, river = false;
  for (let k = 0; k < 60; k++) {
    const j = step(foot, false);
    if (j < 0) break;
    if (channel[j]) { river = true; break; }
    foot = j;
  }
  const h = height[crest] - height[foot];
  if (h < HILLS.slideMinHeight) return null;
  const cx0 = crest % cols, cy0 = (crest - cx0) / cols, cx1 = foot % cols, cy1 = (foot - cx1) / cols;
  const x = (cx0 + 0.5) * cell, y = (cy0 + 0.5) * cell, fx = (cx1 + 0.5) * cell, fy = (cy1 + 0.5) * cell;
  const run = Math.sqrt((fx - x) * (fx - x) + (fy - y) * (fy - y)) || cell;
  return { crest, foot, x, y, footX: fx, footY: fy, dirx: (fx - x) / run, diry: (fy - y) / run, run, height: h, river };
}

// Fail the wall at `site`: cut a spoon-shaped scar from the foot back past
// the rim, and spread the mass as a lobe of debris running out from the
// foot. Debris that lands on river cells is the river's to carry away (the
// next channel stamp re-cuts them); `intoRiver` says how much (m^3).
export function landslide(grid, settings, site, rng) {
  const { cols, rows, cell, height, channel, surface, veg } = grid;
  const { dirx, diry, run, height: H } = site;
  const w = Math.min(6 * cell, Math.max(1.5 * cell, H * HILLS.slideWidth)) * rng.range(0.7, 1.3);
  const back = H * HILLS.slideBack * rng.range(0.7, 1.3);
  const len = run + back;
  const footZ = height[site.foot];
  const headZ = height[site.crest];
  const runout = Math.max(2 * cell, H * HILLS.slideRunout) * rng.range(0.8, 1.2);
  // Cells in a box around the scar and the lobe, in (s, u): s along the
  // failure from the foot (s > 0 uphill), u across it.
  const reach = len + runout + 2 * cell;
  const x0 = Math.max(0, Math.floor((site.footX - reach) / cell)), x1 = Math.min(cols - 1, Math.floor((site.footX + reach) / cell));
  const y0 = Math.max(0, Math.floor((site.footY - reach) / cell)), y1 = Math.min(rows - 1, Math.floor((site.footY + reach) / cell));
  const wl = w * 1.4;
  let removed = 0;
  const lobe = [];
  let weights = 0, riverWeight = 0, riverPeak = 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const i = cy * cols + cx;
      const px = (cx + 0.5) * cell - site.footX, py = (cy + 0.5) * cell - site.footY;
      const s = -(px * dirx + py * diry);
      const u = px * -diry + py * dirx;
      // The scar: an ellipse from the foot to `back` behind the rim.
      const a = (s - len / 2) / (len / 2), b = u / w;
      if (a * a + b * b <= 1 && !channel[i]) {
        const t = Math.max(0, s / len);
        const plane = footZ + (headZ - footZ) * t * Math.sqrt(t) + (headZ - footZ) * 0.35 * b * b;
        if (height[i] > plane) {
          removed += height[i] - plane;
          height[i] = plane;
          if (surface[i] !== SURFACE.WATER) surface[i] = SURFACE.EARTH;
          veg[i] = 0;
        }
      }
      // The lobe: from the foot out across the floor, widening a little.
      const r = -s;
      if (r >= 0 && r < runout && Math.abs(u) < wl) {
        const k = (1 - (r / runout) * (r / runout)) * (1 - (u / wl) * (u / wl));
        if (channel[i] === 1) { riverWeight += k; if (k > riverPeak) riverPeak = k; }
        else if (!channel[i]) lobe.push(i, k);
        weights += k;
      }
    }
  }
  const keep = removed * HILLS.slideKeep;
  let deepest = 0;
  if (weights > 0) {
    for (let p = 0; p < lobe.length; p += 2) {
      const i = lobe[p], add = (keep * lobe[p + 1]) / weights;
      height[i] += add;
      if (add > 0.05) { surface[i] = SURFACE.SCREE; veg[i] = 0; }
    }
    deepest = (keep * riverPeak) / weights; // the most debris dropped on any river cell
  }
  const area = cell * cell;
  return {
    x: site.x, y: site.y, footX: site.footX, footY: site.footY, dirx, diry,
    width: 2 * w, height: H, runout,
    volume: removed * area,
    intoRiver: weights > 0 ? (keep * riverWeight * area) / weights : 0,
    riverDepth: deepest,
  };
}

// A new gully at the foot of the wall `site`, heading into it. Its course
// (a gently wandering line, up to its full length) is fixed now; it grows
// headward along it.
export function newGully(site, rng) {
  const max = rng.range(HILLS.gullyMinLength, HILLS.gullyMaxLength);
  const px = [site.footX], py = [site.footY];
  let ux = -site.dirx, uy = -site.diry;
  const step = 40;
  for (let s = step; s <= max + step; s += step) {
    if (s > step) {
      const a = rng.range(-0.15, 0.15), c = cos(a), sn = sin(a);
      [ux, uy] = [ux * c - uy * sn, ux * sn + uy * c];
    }
    // Stay inside the valley.
    const x = Math.min(VALLEY.length - 30, Math.max(30, px[px.length - 1] + ux * step));
    const y = Math.min(VALLEY.width - 30, Math.max(30, py[py.length - 1] + uy * step));
    px.push(x); py.push(y);
  }
  return { x: site.footX, y: site.footY, dirx: -site.dirx, diry: -site.diry, px, py, length: 0, maxLength: max, footZ: Infinity, age: 0 };
}

// One land update of a gully: it lengthens headward (faster in floods), its
// floor is cut down to a gentle grade from the mouth, and what it washes
// out spreads as a fan beyond the mouth. Slumping (relaxSlopes) widens the
// cut into a V.
export function growGully(grid, settings, gully, dt, flood) {
  const { cols, rows, cell, height, channel, surface, veg } = grid;
  gully.age += dt;
  gully.length = Math.min(gully.maxLength, gully.length + HILLS.gullyRate * dt * (1 + 2 * flood));
  const mouth = cellAt(grid, gully.x, gully.y);
  if (!channel[mouth]) gully.footZ = Math.min(gully.footZ, height[mouth]);
  if (!Number.isFinite(gully.footZ)) return;
  const id = ++grid.stampId;
  const stamp = grid.stamp;
  let removed = 0;
  let s = 0;
  const { px, py } = gully;
  const half = cell * 0.5;
  for (let k = 0; k < px.length - 1 && s < gully.length; k++) {
    const dx = px[k + 1] - px[k], dy = py[k + 1] - py[k];
    const segLen = Math.sqrt(dx * dx + dy * dy) || 1;
    for (let t = 0; t < segLen && s + t < gully.length; t += half) {
      const i = cellAt(grid, px[k] + (dx * t) / segLen, py[k] + (dy * t) / segLen);
      if (stamp[i] === id || channel[i]) continue;
      stamp[i] = id;
      const floor = gully.footZ + HILLS.gullyGradient * (s + t);
      if (height[i] > floor) {
        removed += height[i] - floor;
        if (height[i] - floor > 0.5) { surface[i] = SURFACE.EARTH; veg[i] *= 0.5; }
        height[i] = floor;
      }
    }
    s += segLen;
  }
  if (removed <= 0) return null;
  // The fan: a low cone spreading out from the mouth, away from the wall.
  const R = Math.max(2 * cell, HILLS.fanRadius * gully.length);
  const keep = removed * HILLS.fanFraction;
  const x0 = Math.max(0, Math.floor((gully.x - R) / cell)), x1 = Math.min(cols - 1, Math.floor((gully.x + R) / cell));
  const y0 = Math.max(0, Math.floor((gully.y - R) / cell)), y1 = Math.min(rows - 1, Math.floor((gully.y + R) / cell));
  const fan = [];
  let weights = 0, wet = 0;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const ox = (cx + 0.5) * cell - gully.x, oy = (cy + 0.5) * cell - gully.y;
    if (ox * gully.dirx + oy * gully.diry >= 0) continue; // only out from the wall
    const r = Math.sqrt(ox * ox + oy * oy);
    if (r >= R) continue;
    const w = 1 - r / R;
    weights += w;
    const i = cy * cols + cx;
    if (!channel[i]) fan.push(i, w); // fan on the river is the river's to carry off
    else if (channel[i] === 1) wet += w;
  }
  for (let p = 0; p < fan.length; p += 2) {
    const i = fan[p], add = (keep * fan[p + 1]) / weights;
    height[i] += add;
    if (add > 0.01 && surface[i] !== SURFACE.WATER) { surface[i] = SURFACE.GRAVEL; veg[i] *= 0.9; }
  }
  // Washed out to the river: the part of the fan that fell on it, and the fines.
  const area = cell * cell;
  return { bed: (keep * wet * area) / weights, fines: removed * (1 - HILLS.fanFraction) * area };
}

function cellAt(grid, x, y) {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / grid.cell)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / grid.cell)));
  return cy * grid.cols + cx;
}
