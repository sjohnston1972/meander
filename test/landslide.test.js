// Landslides: tall valley walls fail now and then. The failed mass leaves a
// scar in the wall and runs out as a lobe of debris across the floor below.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, SURFACE, DT, HILLS } from '../src/config.js';
import { createGrid } from '../src/engine/floodplain.js';
import { createRandom } from '../src/engine/random.js';
import { findSlideSite, landslide } from '../src/engine/hillslope.js';

const LONG = 300000;
const settings = { ...defaults, quality: 'low', valleySlope: 0 };
const run = (e, years) => { for (let i = 0; i < years / DT; i++) e.tick(); };

// Plateau `top` metres high over the top half of the grid, sloping down to a
// flat floor at 0 at the soft-rock slope.
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

describe('the Landslide button', () => {
  it('on a river with no tall walls, says so and leaves the river exactly as it would have been', { timeout: 120000 }, () => {
    const a = new Engine({ ...defaults, quality: 'low' });
    const b = new Engine({ ...defaults, quality: 'low' });
    run(a, 20); run(b, 20);
    expect(b.triggerLandslide()).toBe(false);
    expect(b.events.some((v) => v.type === 'noWalls')).toBe(true);
    run(a, 20); run(b, 20);
    expect(Array.from(b.x)).toEqual(Array.from(a.x));
  });
});

describe('landslides', () => {
  it('cut a scar into the wall and spread the debris below it, keeping the volume', () => {
    const g = wall(40);
    const before = Float32Array.from(g.height);
    const crest = (g.rows / 2) * g.cols + Math.floor(g.cols / 2);
    const site = findSlideSite(g, crest);
    expect(site).not.toBeNull();
    expect(site.height).toBeGreaterThan(30);
    const slide = landslide(g, settings, site, createRandom(2));
    let removed = 0, added = 0, scree = 0;
    for (let i = 0; i < before.length; i++) {
      const d = g.height[i] - before[i];
      if (d < 0) removed -= d; else added += d;
      if (g.surface[i] === SURFACE.SCREE && d > 0) scree++;
    }
    expect(g.height[crest]).toBeLessThan(before[crest] - 3);
    expect(removed).toBeGreaterThan(0);
    expect(Math.abs(added - removed) / removed).toBeLessThan(0.15);
    expect(scree).toBeGreaterThan(3);
    expect(slide.volume).toBeCloseTo(removed * g.cell * g.cell, -2);
  });

  it('need a tall wall', () => {
    const g = wall(3);
    expect(findSlideSite(g, (g.rows / 2) * g.cols + 10)).toBeNull();
  });

  it('happen on their own beside a deeply incised river, never on an open floodplain', { timeout: LONG }, () => {
    const count = (e) => e.events.filter((v) => v.type === 'landslide').length;
    const flat = new Engine({ ...defaults, quality: 'low' });
    run(flat, 1000);
    expect(count(flat)).toBe(0);
    const deep = new Engine({ ...defaults, quality: 'low', incisionRate: 15, alluviumDepth: 6 });
    run(deep, 3000);
    expect(count(deep)).toBeGreaterThan(0);
  });

  it('can be set off on the tallest wall, and say so when there is none', { timeout: LONG }, () => {
    const flat = new Engine({ ...defaults, quality: 'low' });
    expect(flat.triggerLandslide()).toBe(false);
    const deep = new Engine({ ...defaults, quality: 'low', incisionRate: 15 });
    run(deep, 1500);
    deep.events.length = 0;
    expect(deep.triggerLandslide()).toBe(true);
    expect(deep.events.some((v) => v.type === 'landslide')).toBe(true);
  });

  it('push the river away when the debris reaches it', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 10 });
    run(e, 500);
    const i = Math.floor(e.x.length / 2);
    const nx = e.y[i + 1] - e.y[i - 1], ny = -(e.x[i + 1] - e.x[i - 1]);
    const l = Math.hypot(nx, ny);
    const a = Engine.fromState(e.serialize());
    const b = Engine.fromState(e.serialize());
    // Debris arriving from the left bank, pushing towards the right.
    b.slides.push({ x: e.x[i], y: e.y[i], dirx: nx / l, diry: ny / l, width: 120, age: 0 });
    a.tick(); b.tick();
    expect(b.rate[i] - a.rate[i]).toBeGreaterThan(1);
  });
});
