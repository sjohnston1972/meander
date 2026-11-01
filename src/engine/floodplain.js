// The floodplain: a grid of cells covering the valley with a height, a surface
// type, an erodibility multiplier and a vegetation value. The channel is carved
// into it every step; land the channel leaves behind becomes point bar; floods
// build levees; low ground slowly rises back to floodplain level.
import { VALLEY, QUALITY, SURFACE, FLOODPLAIN, THALWEG, CENTRELINE } from '../config.js';
import { createNoise2D } from './random.js';

// Floodplain top (no noise) at distance x down the valley.
export function baseLevel(x, settings) {
  return settings.valleySlope * (VALLEY.length - x) + settings.bankHeight;
}

// Channel depth actually used: never deeper than the banks allow.
export function effectiveDepth(settings) {
  return Math.min(settings.channelDepth, settings.bankHeight - CENTRELINE.depthBelowBank);
}

export function cellIndex(grid, x, y) {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / grid.cell)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / grid.cell)));
  return cy * grid.cols + cx;
}

export function createGrid(settings, rng) {
  const q = QUALITY[settings.quality] || QUALITY.medium;
  const cols = q.cols, rows = q.rows, cell = VALLEY.length / cols;
  const n = cols * rows;
  const grid = {
    cols, rows, cell,
    height: new Float32Array(n),     // ground height, metres
    base: new Float32Array(n),       // floodplain height for the current slope and bank height (aggradation target)
    relief: new Float32Array(n),     // gentle random relief baked into base
    surface: new Uint8Array(n),      // SURFACE code
    patch: new Float32Array(n),      // ground patchiness noise, 0..1 (erodibility = 1 ± patchiness)
    rock: new Uint8Array(n),         // 1 = hard rock
    veg: new Float32Array(n),        // vegetation 0..1
    channel: new Uint8Array(n),      // 1 = river this step, 2 = oxbow lake, 3 = river last step (transient)
    lakeLost: new Uint8Array(n),     // 1 = an oxbow cell the river has since taken back
    chanList: [],                    // indices of river cells this step
    chanLevel: new Float32Array(n),  // water level last time the cell was channel
    stamp: new Uint32Array(n),       // per-call visit marker
    stampId: 1,
    slope: settings.valleySlope,
    bankHeight: settings.bankHeight,
  };
  const relief = createNoise2D(settings.seed * 104729 + 3);
  const cover = createNoise2D(settings.seed * 15485863 + 11);
  const patch = createNoise2D(settings.seed * 7919 + 1);
  const nScale = FLOODPLAIN.noiseScaleWidths * settings.channelWidth;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      const x = (cx + 0.5) * cell, y = (cy + 0.5) * cell;
      grid.relief[i] = (relief(x / FLOODPLAIN.reliefScale, y / FLOODPLAIN.reliefScale) - 0.5) * 2 * FLOODPLAIN.baseNoise;
      const h = baseLevel(x, settings) + grid.relief[i];
      grid.base[i] = h;
      grid.height[i] = h;
      grid.surface[i] = SURFACE.GRASS;
      grid.veg[i] = Math.min(1, Math.max(0, 0.55 + (cover(x / 200 + 7, y / 200 + 3) - 0.5) * 1.2));
      grid.patch[i] = patch(x / nScale, y / nScale);
    }
  }
  if (settings.hardRock) {
    const r = FLOODPLAIN.rockRadiusWidths * settings.channelWidth;
    for (let p = 0; p < FLOODPLAIN.rockPatches; p++) {
      const x = rng.range(VALLEY.length * 0.15, VALLEY.length * 0.85);
      const y = rng.range(VALLEY.width * 0.2, VALLEY.width * 0.8);
      paintRock(grid, x, y, r * rng.range(0.6, 1.3), true);
    }
  }
  return grid;
}

// Valley slope or bank height changed mid-run: move the whole floodplain with
// the new base so bars, levees and scars keep their relative relief.
export function rebase(grid, settings) {
  if (grid.slope === settings.valleySlope && grid.bankHeight === settings.bankHeight) return;
  // Shift every cell by the change in the reference floodplain at its x, so
  // terraces and the lower floodplain inside the belt keep their relative relief.
  const { cols, rows, cell, base, height } = grid;
  const old = { valleySlope: grid.slope, bankHeight: grid.bankHeight };
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      const x = (cx + 0.5) * cell;
      const d = baseLevel(x, settings) - baseLevel(x, old);
      height[i] += d;
      base[i] += d;
    }
  }
  grid.slope = settings.valleySlope;
  grid.bankHeight = settings.bankHeight;
}

// Paint (or clear) a disc of hard rock.
export function paintRock(grid, x, y, radius, on) {
  const { cols, rows, cell } = grid;
  const x0 = Math.max(0, Math.floor((x - radius) / cell)), x1 = Math.min(cols - 1, Math.floor((x + radius) / cell));
  const y0 = Math.max(0, Math.floor((y - radius) / cell)), y1 = Math.min(rows - 1, Math.floor((y + radius) / cell));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const dx = (cx + 0.5) * cell - x, dy = (cy + 0.5) * cell - y;
    if (dx * dx + dy * dy > radius * radius) continue;
    const i = cy * cols + cx;
    if (grid.channel[i]) continue;
    if (on) {
      grid.rock[i] = 1;
      grid.surface[i] = SURFACE.ROCK;
      grid.veg[i] = 0;
      if (grid.height[i] < grid.base[i]) grid.height[i] = grid.base[i];
    } else if (grid.rock[i]) {
      grid.rock[i] = 0;
      grid.surface[i] = SURFACE.GRASS;
    }
  }
}

// Erodibility at a bank position: ground patchiness, rock, and plant roots.
export function sampleErodibility(grid, x, y, settings) {
  const i = cellIndex(grid, x, y);
  const ground = grid.rock[i] ? FLOODPLAIN.rockErodibility
    : Math.min(2, Math.max(0.15, 1 + (grid.patch[i] - 0.5) * 2 * settings.patchiness));
  return ground * (1 - settings.rootStrength * grid.veg[i]);
}

// Visit every cell within `radius` of a polyline, calling fn(cellIndex, u, t, segIndex)
// where u is the signed lateral offset (positive to the right of flow) and t the
// position along the segment. Each cell is visited once per call.
function forCellsNear(grid, x, y, radius, fn) {
  const { cols, rows, cell } = grid;
  const id = ++grid.stampId;
  const stamp = grid.stamp;
  const n = x.length;
  for (let s = 0; s < n - 1; s++) {
    const ax = x[s], ay = y[s], bx = x[s + 1], by = y[s + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    const len = Math.sqrt(len2);
    const minx = Math.min(ax, bx) - radius, maxx = Math.max(ax, bx) + radius;
    const miny = Math.min(ay, by) - radius, maxy = Math.max(ay, by) + radius;
    const x0 = Math.max(0, Math.floor(minx / cell)), x1 = Math.min(cols - 1, Math.floor(maxx / cell));
    const y0 = Math.max(0, Math.floor(miny / cell)), y1 = Math.min(rows - 1, Math.floor(maxy / cell));
    for (let cy = y0; cy <= y1; cy++) {
      const py = (cy + 0.5) * cell;
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * cols + cx;
        if (stamp[i] === id) continue;
        const px = (cx + 0.5) * cell;
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        // Cells before the start belong to the previous segment. Cells past the
        // end belong to the next segment, unless they also lie before its start
        // (the wedge outside a sharp corner), which this segment's end cap takes.
        if (t < 0 && s > 0) continue;
        if (t > 1 && s < n - 2) {
          const ex = x[s + 2] - bx, ey = y[s + 2] - by;
          if ((px - bx) * ex + (py - by) * ey >= 0) continue;
        }
        t = Math.max(0, Math.min(1, t));
        const qx = ax + dx * t, qy = ay + dy * t;
        const d = Math.hypot(px - qx, py - qy);
        if (d > radius) continue;
        const side = ((px - ax) * dy - (py - ay) * dx) / len; // >0 on the right of flow
        stamp[i] = id;
        fn(i, side >= 0 ? d : -d, t, s);
      }
    }
  }
}

// Indices of all cells within `radius` of a polyline.
export function cellsNear(grid, x, y, radius) {
  const out = [];
  forCellsNear(grid, x, y, radius, (i) => out.push(i));
  return Int32Array.from(out);
}

// Carve the current channel. `river` holds x, y, curvature, rate and water
// level per point. `flood` (0..1) switches on levee building.
export function stampChannel(grid, river, settings, year, flood, sedimentSupply = settings.sedimentSupply) {
  const { x, y, curvature: c, rate, level } = river;
  const W = settings.channelWidth, halfW = W / 2, D = effectiveDepth(settings);
  const innerRamp = FLOODPLAIN.innerRampWidths * W;
  const cutBand = FLOODPLAIN.cutBankBandWidths * W;
  const leveeW = FLOODPLAIN.leveeWidthWidths * W;
  const reach = halfW + Math.max(innerRamp, flood > 0 ? leveeW : 0, cutBand);
  const { height, base, surface, veg, channel, chanLevel, lakeLost } = grid;

  // Clear last step's river cells; remember them to detect abandoned ground.
  const prevList = grid.chanList;
  for (const i of prevList) if (channel[i] === 1) channel[i] = 3; // 3 = was river last step
  const list = [];

  const ridge = FLOODPLAIN.scrollAmplitude * (0.5 + 0.5 * Math.sin((2 * Math.PI * year) / FLOODPLAIN.scrollPeriod));
  // Levee growth is per flood-year; this call covers one step of DT years.
  const leveeGain = FLOODPLAIN.leveeRate * sedimentSupply * flood * river.dt;

  forCellsNear(grid, x, y, reach, (i, u, t, s) => {
    const lvl = level[s] + (level[s + 1] - level[s]) * t;
    const cv = c[s] + (c[s + 1] - c[s]) * t;
    const r = rate[s] + (rate[s + 1] - rate[s]) * t;
    const bend = Math.min(1, Math.abs(cv) * W * THALWEG.curvatureScale);
    const outerSign = cv > 0 ? 1 : -1;
    const dist = Math.abs(u);
    const isOuter = (u >= 0 ? 1 : -1) === outerSign;
    if (dist <= halfW) {
      const dmax = D * (1 + THALWEG.poolFactor * bend);
      const shift = outerSign * THALWEG.shiftFraction * halfW * bend;
      const q = (u - shift) / (halfW + Math.abs(shift));
      const depth = FLOODPLAIN.edgeDepth + (dmax - FLOODPLAIN.edgeDepth) * Math.max(0, 1 - q * q);
      const h = lvl - depth;
      if (channel[i] === 2) lakeLost[i] = 1; // the river has taken this bit of lake back
      if (channel[i] !== 3 || h < height[i] || Math.abs(height[i] - h) > 0.5) height[i] = h;
      channel[i] = 1;
      list.push(i);
      chanLevel[i] = lvl;
      // The floodplain this channel builds sits a bank height above its own water.
      const localBase = lvl - D + settings.bankHeight;
      if (localBase < base[i]) base[i] = localBase;
      surface[i] = SURFACE.WATER;
      veg[i] = 0;
      return;
    }
    if (channel[i] === 2) return; // lake cells beside the river keep their water
    const f = dist - halfW;
    if (!isOuter && f <= innerRamp && height[i] <= base[i] + 0.01) {
      // Inner bank: gentle slope from the bar top up to the floodplain.
      const k = f / innerRamp;
      const sm = k * k * (3 - 2 * k);
      const edge = lvl + FLOODPLAIN.barAboveWater;
      const target = edge + (base[i] - edge) * sm;
      if (target < height[i]) height[i] = target;
    }
    if (isOuter && f <= cutBand && Math.abs(r) > FLOODPLAIN.cutBankRate) {
      surface[i] = SURFACE.EARTH;
      veg[i] *= 0.5;
    }
    if (leveeGain > 0 && f <= leveeW && height[i] < base[i] + FLOODPLAIN.leveeMaxHeight) {
      height[i] += leveeGain * (1 - f / leveeW);
    }
  });

  // Land the channel left behind this step becomes point bar.
  for (const i of prevList) {
    if (channel[i] === 3) {
      channel[i] = 0;
      const top = Math.min(base[i] - 0.3, chanLevel[i] + FLOODPLAIN.barAboveWater + ridge);
      height[i] = top;
      surface[i] = grid.rock[i] ? SURFACE.ROCK : SURFACE.SAND;
      veg[i] = 0;
    }
  }
  grid.chanList = list;
}

// Mark an oxbow's cells as lake and set its bed. With `carve` (at creation)
// the bed is cut down to the lake bed; afterwards infill only raises it.
export function stampOxbow(grid, oxbow, settings, carve = false) {
  const { height, surface, channel, veg, lakeLost } = grid;
  const bed = oxbow.level - oxbow.depth;
  const marsh = oxbow.depth <= FLOODPLAIN.oxbowMarshDepth;
  for (const i of oxbow.cells) {
    // At creation the loop is still flagged as river from the last stamp; claim it.
    // Later, cells the river has taken back stay river.
    if (lakeLost[i] || (!carve && (channel[i] === 1 || channel[i] === 3))) continue;
    channel[i] = 2;
    if (carve ? height[i] !== bed : height[i] < bed) height[i] = carve ? Math.min(height[i], bed) : bed;
    surface[i] = marsh ? SURFACE.WETLAND : SURFACE.WATER;
    veg[i] = marsh ? Math.min(1, veg[i] + 0.02) : 0;
  }
}

// Retire a fully infilled oxbow: cells become marsh land that greens over.
export function retireOxbow(grid, oxbow) {
  const { height, surface, channel, base, lakeLost } = grid;
  for (const i of oxbow.cells) {
    lakeLost[i] = 0;
    if (channel[i] !== 2) continue;
    channel[i] = 0;
    surface[i] = SURFACE.MARSH;
    height[i] = Math.min(height[i], base[i] - FLOODPLAIN.scarDepth);
  }
}

// Vegetation growth, aggradation of low ground, overbank silt, surface ageing.
// Runs over the whole grid; call every few steps with the accumulated dt.
export function growLand(grid, settings, dt, flood = 0) {
  const { height, base, surface, veg, channel } = grid;
  const grow = (dt * settings.vegGrowth) / FLOODPLAIN.vegFullYears;
  const aggrade = FLOODPLAIN.aggradeRate * settings.sedimentSupply * dt;
  const silt = FLOODPLAIN.overbankRate * settings.sedimentSupply * flood * dt;
  for (let i = 0; i < height.length; i++) {
    if (channel[i]) continue;
    const s = surface[i];
    if (s === SURFACE.ROCK) continue;
    let v = veg[i] + grow;
    if (v > 1) v = 1;
    veg[i] = v;
    let h = height[i];
    const b = base[i];
    if (h < b) { h += aggrade; if (h > b) h = b; }
    if (silt > 0 && h < b + FLOODPLAIN.overbankMax) h += silt;
    height[i] = h;
    if (s === SURFACE.SAND && v > 0.5) surface[i] = SURFACE.GRASS;
    else if (s === SURFACE.EARTH && v > 0.35) surface[i] = SURFACE.GRASS;
    else if (s === SURFACE.MARSH && v > 0.85 && h >= b - 0.15) surface[i] = SURFACE.GRASS;
    else if (s === SURFACE.WETLAND && v > 0.9) surface[i] = SURFACE.MARSH;
  }
}
