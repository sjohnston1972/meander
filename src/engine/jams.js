// Log jams (settings.logJams) and beavers (settings.beavers): wood in the
// river. Trees from eroding wooded banks fall in and lodge, backing the
// water up and pushing the river aside, until they rot or a flood flushes
// them. Beavers dam channels narrow enough, flooding ponds that silt up into
// meadows once the colony moves on, and keep oxbow lakes open with lodges.
// Plain functions; the engine owns the lists.
import { WOOD, BEAVER, SURFACE } from '../config.js';
import { cellsNear } from './floodplain.js';
import { hypot } from './dmath.js';

// The water a jam backs up at a point `d` metres upstream of it: highest at
// the jam, gone `reach` metres up.
export function backwater(height, d, reach) {
  return d >= reach ? 0 : height * (1 - d / reach);
}

// How far up the river a jam `height` metres high backs the water, at valley slope `slope`.
export function backwaterReach(height, slope) {
  return Math.min(WOOD.maxReach, height / Math.max(1e-5, slope));
}

// Chance a year that the bank at a point drops a jam: eroding fast, wooded,
// and on a river small enough for the trees to span.
export function jamChance(rate, veg, width) {
  if (Math.abs(rate) < WOOD.minRate || veg < WOOD.minVeg) return 0;
  return WOOD.jamChance * veg * Math.min(2, Math.abs(rate) / WOOD.minRate) * Math.min(1.5, WOOD.refWidth / width);
}

// Ground the backed-up water reaches beside the river above a jam turns wet.
export function wetUpstream(grid, x, y, from, to, level, radius) {
  if (to - from < 2) return;
  const cells = cellsNear(grid, x.subarray(from, to), y.subarray(from, to), radius);
  const { height, surface, veg, channel } = grid;
  for (const i of cells) {
    if (channel[i] || surface[i] === SURFACE.ROCK || height[i] > level + WOOD.wetAbove) continue;
    surface[i] = SURFACE.WETLAND;
    veg[i] *= 0.97;
  }
}

// A good place for a beaver colony on the main river: trees within reach
// for food and building (vegetation on the bank), away from other dams.
export function beaverSite(grid, x, y, i, W) {
  const i0 = Math.max(0, i - 1), i1 = Math.min(x.length - 1, i + 1);
  const tx = x[i1] - x[i0], ty = y[i1] - y[i0];
  const l = hypot(tx, ty) || 1;
  let trees = 0;
  for (const side of [1, -1]) {
    const bx = x[i] + (ty / l) * side * W * 1.5, by = y[i] - (tx / l) * side * W * 1.5;
    const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(bx / grid.cell))) + Math.min(grid.rows - 1, Math.max(0, Math.floor(by / grid.cell))) * grid.cols;
    trees = Math.max(trees, grid.veg[c]);
  }
  return trees >= BEAVER.minVeg && !grid.rock[Math.min(grid.cols - 1, Math.max(0, Math.floor(x[i] / grid.cell))) + Math.min(grid.rows - 1, Math.max(0, Math.floor(y[i] / grid.cell))) * grid.cols];
}
