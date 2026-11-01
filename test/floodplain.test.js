import { describe, it, expect } from 'vitest';
import {
  createGrid, stampChannel, growLand, sampleErodibility, paintRock, cellIndex, baseLevel,
} from '../src/engine/floodplain.js';
import { createRandom } from '../src/engine/random.js';
import { defaults, SURFACE, VALLEY, DT } from '../src/config.js';

const settings = { ...defaults, quality: 'low', hardRock: false, patchiness: 0 };

// A straight channel across the valley at a given y, with per-point water levels.
function straightRiver(yPos, settings) {
  const n = 121;
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = (i / (n - 1)) * VALLEY.length; y[i] = yPos; }
  const level = new Float64Array(n);
  for (let i = 0; i < n; i++) level[i] = baseLevel(x[i], settings) - settings.bankHeight + settings.channelDepth;
  return { x, y, curvature: new Float64Array(n), rate: new Float64Array(n), level, dt: DT };
}

describe('createGrid', () => {
  it('sizes the grid from the quality setting with square cells', () => {
    const g = createGrid(settings, createRandom(1));
    expect(g.cols).toBe(256);
    expect(g.rows).toBe(128);
    expect(g.cell).toBeCloseTo(VALLEY.length / 256, 9);
    expect(g.height.length).toBe(256 * 128);
  });

  it('slopes down the valley', () => {
    const g = createGrid(settings, createRandom(1));
    const up = g.height[cellIndex(g, 100, 1500)];
    const down = g.height[cellIndex(g, 5900, 1500)];
    expect(up - down).toBeGreaterThan(2);
  });
});

describe('stampChannel', () => {
  it('carves the channel below the floodplain and marks it as water', () => {
    const g = createGrid(settings, createRandom(1));
    const r = straightRiver(1500, settings);
    stampChannel(g, r, settings, 0, 0);
    const i = cellIndex(g, 3000, 1500);
    expect(g.surface[i]).toBe(SURFACE.WATER);
    expect(g.height[i]).toBeLessThan(baseLevel(3000, settings) - settings.bankHeight + 0.5);
    const bank = cellIndex(g, 3000, 1500 + settings.channelWidth * 2);
    expect(g.surface[bank]).toBe(SURFACE.GRASS);
  });

  it('turns abandoned channel into a sandy bar between bed and bank height', () => {
    const g = createGrid(settings, createRandom(1));
    stampChannel(g, straightRiver(1500, settings), settings, 0, 0);
    const shift = g.cell * 3;
    stampChannel(g, straightRiver(1500 + shift, settings), settings, DT, 0);
    const i = cellIndex(g, 3000, 1500); // cell that was channel, now land
    expect(g.surface[i]).toBe(SURFACE.SAND);
    const bed = baseLevel(3000, settings) - settings.bankHeight;
    expect(g.height[i]).toBeGreaterThan(bed);
    expect(g.height[i]).toBeLessThan(baseLevel(3000, settings));
  });

  it('builds a levee next to the bank during a flood', () => {
    const g = createGrid(settings, createRandom(1));
    const r = straightRiver(1500, settings);
    stampChannel(g, r, settings, 0, 0);
    const near = cellIndex(g, 3000, 1500 + settings.channelWidth / 2 + g.cell);
    const far = cellIndex(g, 3000, 1500 + settings.channelWidth / 2 + g.cell * 12);
    const nearBefore = g.height[near], farBefore = g.height[far];
    for (let t = 0; t < 40; t++) stampChannel(g, r, settings, t * DT, 1);
    expect(g.height[near] - nearBefore).toBeGreaterThan(g.height[far] - farBefore);
    expect(g.height[near] - nearBefore).toBeGreaterThan(0.05);
  });
});

describe('growLand', () => {
  it('grows vegetation on land but not in the channel', () => {
    const g = createGrid(settings, createRandom(1));
    stampChannel(g, straightRiver(1500, settings), settings, 0, 0);
    for (let t = 0; t < 400; t++) growLand(g, settings, DT);
    expect(g.veg[cellIndex(g, 3000, 2500)]).toBeGreaterThan(0.5);
    expect(g.veg[cellIndex(g, 3000, 1500)]).toBe(0);
  });
});

describe('erodibility', () => {
  it('is near 1 on plain ground and tiny inside painted rock', () => {
    const g = createGrid(settings, createRandom(1));
    const bare = { ...settings, rootStrength: 0 };
    expect(sampleErodibility(g, 3000, 2500, bare)).toBeCloseTo(1, 5);
    paintRock(g, 3000, 2500, 60, true);
    expect(sampleErodibility(g, 3000, 2500, bare)).toBeLessThan(0.1);
    expect(g.surface[cellIndex(g, 3000, 2500)]).toBe(SURFACE.ROCK);
  });

  it('is reduced by vegetation according to root strength', () => {
    const g = createGrid(settings, createRandom(1));
    g.veg[cellIndex(g, 3000, 2500)] = 1;
    expect(sampleErodibility(g, 3000, 2500, { ...settings, rootStrength: 0.6 })).toBeCloseTo(0.4, 5);
  });
});
