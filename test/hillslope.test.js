// Valley walls: creep rounds their rims, bedrock stands in ledges where hard
// and soft layers alternate, and rock shed from the faces collects as scree.
import { describe, it, expect } from 'vitest';
import { defaults, SURFACE, HILLS } from '../src/config.js';
import { createGrid } from '../src/engine/floodplain.js';
import { createRandom } from '../src/engine/random.js';
import { relaxSlopes, rockHardness } from '../src/engine/hillslope.js';

const LONG = 120000;
const settings = { ...defaults, quality: 'low', valleySlope: 0 };

// A grid whose top half is a plateau `top` metres high above a flat floor at
// 0, with the bedrock surface at `rock` everywhere.
function wall(top, rock, quality = 'low') {
  const g = createGrid({ ...settings, quality }, createRandom(1));
  for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
    const i = cy * g.cols + cx;
    g.height[i] = cy < g.rows / 2 ? top : 0;
    g.base[i] = g.height[i];
    g.bedrock[i] = rock;
    g.surface[i] = SURFACE.GRASS;
    g.veg[i] = 1;
  }
  return g;
}
const column = (g, cx = Math.floor(g.cols / 2)) => Array.from({ length: g.rows }, (_, cy) => g.height[cy * g.cols + cx]);
const years = (g, n) => { for (let y = 0; y < n; y++) relaxSlopes(g, settings, 1); };

describe('valley walls', () => {
  it('creep rounds the rim of a scarp in soft ground', { timeout: LONG }, () => {
    const g = wall(15, -100);
    years(g, 50);
    const settled = column(g);
    years(g, 3000);
    const after = column(g);
    // The ground just behind the rim has crept down; far back it has not moved.
    let rim = 0;
    while (rim < g.rows && settled[rim + 1] > settled[rim] - 0.01) rim++;
    expect(settled[rim - 1] - after[rim - 1]).toBeGreaterThan(0.3);
    expect(after[2]).toBeCloseTo(15, 3);
    // The profile still falls steadily from plateau to floor.
    for (let cy = 1; cy < g.rows; cy++) expect(after[cy]).toBeLessThanOrEqual(after[cy - 1] + 1e-4);
  });

  it('creep leaves low floodplain ridges alone', { timeout: LONG }, () => {
    const g = wall(0, -100);
    const i = 40 * g.cols + 100;
    g.height[i] = 0.3; // a scroll-bar ridge
    years(g, 1000);
    expect(g.height[i]).toBeCloseTo(0.3, 5);
  });

  it('rock layers move with the ground when the bank height or valley slope changes', () => {
    const a = { valleySlope: 0.0005, bankHeight: 4 }, b = { valleySlope: 0.0005, bankHeight: 7 }, c = { valleySlope: 0.002, bankHeight: 4 };
    for (let z = 0; z < 60; z += 0.7) {
      expect(rockHardness(z + 3, 1000, b)).toBe(rockHardness(z, 1000, a));
      expect(rockHardness(z + 0.0015 * 5000, 1000, c)).toBe(rockHardness(z, 1000, a));
    }
  });

  it('bedrock alternates hard and soft layers', () => {
    const seen = new Set();
    for (let z = 0; z < 40; z += 0.5) seen.add(rockHardness(z, 1000, settings));
    expect(seen.has(0)).toBe(true);
    expect(seen.has(1)).toBe(true);
    expect(HILLS.layerThickness).toBeGreaterThan(2);
  });

  it('a rock wall settles into ledges: steep cliffs in hard layers, gentler slopes in soft ones', { timeout: LONG }, () => {
    const g = wall(90, 88, 'medium');
    years(g, 400);
    const h = column(g);
    const soft = g.cell * HILLS.softRockSlope;
    let steep = 0, gentle = 0;
    for (let cy = 1; cy < g.rows; cy++) {
      const d = h[cy - 1] - h[cy];
      if (d < 1 || h[cy - 1] > 86 || h[cy] < 2) continue; // the rock face only
      if (d > soft * 1.6) steep++;
      else if (d < soft * 1.25) gentle++;
    }
    expect(steep).toBeGreaterThan(0);
    expect(gentle).toBeGreaterThan(0);
  });

  it('scree collects at the foot of rock walls', { timeout: LONG }, () => {
    const g = wall(60, 58);
    years(g, 400);
    const cx = Math.floor(g.cols / 2);
    let scree = 0;
    for (let cy = g.rows / 2; cy < g.rows; cy++) if (g.surface[cy * g.cols + cx] === SURFACE.SCREE) scree++;
    expect(scree).toBeGreaterThan(0);
  });
});
