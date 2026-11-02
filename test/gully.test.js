// Gullies: side valleys that start at a tall wall and cut back into the
// plateau, dumping what they wash out as a fan at their mouth.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, SURFACE, DT, HILLS } from '../src/config.js';
import { createGrid } from '../src/engine/floodplain.js';
import { createRandom } from '../src/engine/random.js';
import { findSlideSite, newGully, growGully, relaxSlopes } from '../src/engine/hillslope.js';

const LONG = 300000;
const settings = { ...defaults, quality: 'low', valleySlope: 0 };

function wall(top) {
  const g = createGrid(settings, createRandom(1));
  const run = top / (g.cell * HILLS.softRockSlope);
  for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
    const i = cy * g.cols + cx;
    const k = Math.min(1, Math.max(0, (cy - g.rows / 2) / run));
    g.height[i] = top * (1 - k);
    g.base[i] = g.height[i];
    g.bedrock[i] = -100;
    g.surface[i] = SURFACE.GRASS;
    g.veg[i] = 1;
  }
  return g;
}

describe('gullies', () => {
  it('cut back into the plateau and build a fan at their mouth', { timeout: LONG }, () => {
    const g = wall(40);
    const before = Float32Array.from(g.height);
    const site = findSlideSite(g, (g.rows / 2) * g.cols + Math.floor(g.cols / 2));
    const gully = newGully(site, createRandom(3));
    for (let y = 0; y < 2000; y++) {
      growGully(g, settings, gully, 1, 0);
      relaxSlopes(g, settings, 1);
    }
    expect(gully.length).toBeGreaterThan(200);
    // 100 m in from the mouth, the gully floor is well below the plateau.
    const ix = Math.floor((gully.x + gully.dirx * 100) / g.cell);
    const iy = Math.floor((gully.y + gully.diry * 100) / g.cell);
    const at = iy * g.cols + ix;
    expect(before[at] - g.height[at]).toBeGreaterThan(8);
    // The fan: ground just out from the mouth has risen.
    let raised = 0;
    for (let i = 0; i < before.length; i++) {
      const cx = i % g.cols, cy = (i - cx) / g.cols;
      const dx = (cx + 0.5) * g.cell - gully.x, dy = (cy + 0.5) * g.cell - gully.y;
      if (dx * gully.dirx + dy * gully.diry < 0 && dx * dx + dy * dy < 150 * 150 && g.height[i] > before[i] + 0.2) raised++;
    }
    expect(raised).toBeGreaterThan(3);
  });

  it('keep their mouth at the ground when the bank height changes', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 15 });
    for (let i = 0; i < 3000 / DT; i++) e.tick();
    const v = e.gullies.find((u) => Number.isFinite(u.footZ));
    expect(v).toBeTruthy();
    const foot = v.footZ;
    e.applySettings({ bankHeight: e.settings.bankHeight + 3 });
    expect(v.footZ - foot).toBeCloseTo(3, 3);
  });

  it('appear in the walls of a deeply incised valley', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 15 });
    for (let i = 0; i < 3000 / DT; i++) e.tick();
    expect(e.gullies.length).toBeGreaterThan(0);
    expect(e.gullies.length).toBeLessThanOrEqual(HILLS.maxGullies);
  });
});
