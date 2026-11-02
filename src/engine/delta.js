// The lake at the valley's end (valleyEnd: 'lake') and the delta the river
// builds into it. The lake is open water over the downstream end of the
// grid (grid.channel = OPEN_LAKE). Everything the river carries past its
// mouth settles in front of it: deposits fill lake cells to just above the
// water, so the shore advances and the river lengthens over its own delta.
// Once the delta reaches well out, distributaries fan out from its apex to
// their own mouths, and switch now and then.
import { VALLEY, LAKE, SURFACE } from '../config.js';
import { createNoise2D } from './random.js';
import { exp, sin, cos, hypot } from './dmath.js';

export const OPEN_LAKE = 4;     // grid.channel: open water of the lake
export const DISTRIBUTARY = 5;  // grid.channel: a distributary on the delta

// Flood the downstream end of the valley: a wavy shore, the floor shelving
// from shoreDepth to depth below `level`. Returns the lake cells.
export function makeLake(grid, settings, level) {
  const { cols, rows, cell, height, base, surface, veg, channel, bedrock } = grid;
  const shore = createNoise2D(settings.seed * 92821 + 17);
  const out = [];
  for (let cy = 0; cy < rows; cy++) {
    const y = (cy + 0.5) * cell;
    // The head of the lake is a broad bay: its shore curves away down the valley towards the walls.
    const across = (y - VALLEY.width / 2) / (VALLEY.width / 2);
    const edge = VALLEY.length - LAKE.length + LAKE.bay * across * across + (shore(y / LAKE.shoreScale, 0.5) - 0.5) * 2 * LAKE.shoreWobble;
    for (let cx = 0; cx < cols; cx++) {
      const x = (cx + 0.5) * cell;
      if (x < edge) continue;
      const i = cy * cols + cx;
      const t = Math.min(1, (x - edge) / (0.6 * (VALLEY.length - edge)));
      // A shallow margin shelving down over the first 150 m.
      const shelf = Math.min(1, 0.15 + (0.85 * (x - edge)) / 150);
      const deep = (LAKE.shoreDepth + (LAKE.depth - LAKE.shoreDepth) * t * t * (3 - 2 * t)) * shelf;
      height[i] = level - deep;
      base[i] = level + LAKE.plain;
      surface[i] = SURFACE.WATER;
      veg[i] = 0;
      channel[i] = OPEN_LAKE;
      if (bedrock[i] > height[i] - 1) bedrock[i] = height[i] - 1;
      out.push(i);
    }
  }
  grid.bedrockDirty = true;
  return Int32Array.from(out);
}

// Lake cells built up to the water become delta land; a lake that has
// fallen (base level dropped) leaves its shallows dry. Returns how many.
// Returns { count: how many emerged, open: how many are still open water }.
export function emerge(grid, cells, level) {
  const { height, base, surface, veg, channel } = grid;
  let count = 0, open = 0;
  for (const i of cells) {
    if (channel[i] !== OPEN_LAKE) continue;
    if (height[i] < level - 0.02) { open++; continue; }
    channel[i] = 0;
    surface[i] = SURFACE.SAND;
    veg[i] = 0;
    base[i] = level + LAKE.plain;
    count++;
  }
  return { count, open };
}

// Spread `volume` m^3 of deposit into the open lake in front of a mouth at
// (x, y) flowing towards (dx, dy): thickest just in front, thinning away and
// to the sides, never above `level` + topset. Where the near water is full
// it spills further out. Returns the volume the lake could not take.
export function depositDelta(grid, x, y, dx, dy, volume, level) {
  const { cols, rows, cell, height, channel, surface } = grid;
  const area = cell * cell;
  const top = level + LAKE.topset;
  let left = volume;
  let R = LAKE.spread;
  const cand = [];
  for (let round = 0; round < 24 && left > 1e-6; round++) {
    const x0 = Math.max(0, Math.floor((x - R) / cell)), x1 = Math.min(cols - 1, Math.floor((x + R) / cell));
    const y0 = Math.max(0, Math.floor((y - R) / cell)), y1 = Math.min(rows - 1, Math.floor((y + R) / cell));
    cand.length = 0;
    let wsum = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * cols + cx;
        if (channel[i] !== OPEN_LAKE || height[i] >= top) continue;
        const px = (cx + 0.5) * cell - x, py = (cy + 0.5) * cell - y;
        const d = hypot(px, py);
        if (d > R) continue;
        const ahead = d > 1e-6 ? (px * dx + py * dy) / d : 1;
        if (ahead < -0.2 && d > 1.5 * cell && round < 6) continue; // not behind the mouth, unless there is nowhere else
        const w = exp(-d / LAKE.reach) * (0.5 + 0.5 * Math.max(0, ahead));
        cand.push(i, w);
        wsum += w;
      }
    }
    if (wsum > 0) {
      let used = 0;
      for (let k = 0; k < cand.length; k += 2) {
        const i = cand[k];
        const give = Math.min((top - height[i]) * area, (left * cand[k + 1]) / wsum);
        height[i] += give / area;
        used += give;
        if (height[i] > level - LAKE.shallows) surface[i] = SURFACE.SAND; // a sandy shelf showing through the water
      }
      left -= used;
      if (used > 0.5 * (left + used)) continue; // most of it found room: go round again at the same reach
    }
    R *= 1.4;
  }
  return Math.max(0, left);
}

// A distributary from the delta apex (ax, ay), setting off `angle` radians
// from the direction (dx, dy) and bending gently back down the valley,
// until it reaches open water. Returns { x, y } (points ~15 m apart), or
// null when it finds no open water within reach.
export function traceDistributary(grid, ax, ay, dx, dy, angle) {
  const { cols, rows, cell, channel } = grid;
  const c = cos(angle), s = sin(angle);
  let ux = dx * c - dy * s, uy = dx * s + dy * c;
  const xs = [ax], ys = [ay];
  let x = ax, y = ay;
  const step = 15;
  for (let k = 0; k < 160; k++) {
    // Turn a little back towards the far end of the lake.
    ux += 0.03; const l = hypot(ux, uy); ux /= l; uy /= l;
    x += ux * step; y += uy * step;
    if (x < 0 || y < cell || x >= VALLEY.length || y >= VALLEY.width - cell) return null;
    xs.push(x); ys.push(y);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    if (cx >= cols || cy >= rows) return null;
    if (channel[cy * cols + cx] === OPEN_LAKE) return xs.length >= 4 ? { x: Float64Array.from(xs), y: Float64Array.from(ys) } : null;
  }
  return null;
}

// Carve a distributary's channel into the delta: cells within half its width
// of the course, on land, become shallow channel. Returns the cells.
export function carveDistributary(grid, path, width, depth, levelAt) {
  const { cols, rows, cell, height, surface, veg, channel } = grid;
  const out = [];
  const r = width / 2;
  const n = path.x.length;
  for (let k = 0; k < n; k++) {
    const px = path.x[k], py = path.y[k];
    const bed = levelAt(k / (n - 1)) - depth;
    const x0 = Math.max(0, Math.floor((px - r) / cell)), x1 = Math.min(cols - 1, Math.floor((px + r) / cell));
    const y0 = Math.max(0, Math.floor((py - r) / cell)), y1 = Math.min(rows - 1, Math.floor((py + r) / cell));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * cols + cx;
        if (channel[i] !== 0 && channel[i] !== DISTRIBUTARY) continue;
        if (hypot((cx + 0.5) * cell - px, (cy + 0.5) * cell - py) > Math.max(r, cell * 0.6)) continue;
        if (channel[i] === 0) out.push(i);
        channel[i] = DISTRIBUTARY;
        if (height[i] > bed) height[i] = bed;
        surface[i] = SURFACE.WATER;
        veg[i] = 0;
      }
    }
  }
  return out;
}

// An abandoned distributary silts up into a wet hollow.
export function abandonDistributary(grid, cells, level) {
  const { height, surface, veg, channel } = grid;
  for (const i of cells) {
    if (channel[i] !== DISTRIBUTARY) continue;
    channel[i] = 0;
    surface[i] = SURFACE.WETLAND;
    veg[i] = 0;
    if (height[i] < level + 0.05) height[i] = level + 0.05;
  }
}
