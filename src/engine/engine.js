// The simulation engine. Owns the river centreline, the oxbows and the
// floodplain grid, advances them one fixed time step per tick(), and hands out
// snapshots for the renderer. Pure JavaScript; never touches three.js.
import { VALLEY, DT, CENTRELINE, FLOODS, FLOODPLAIN, THALWEG, RENDER, SURFACE } from '../config.js';

const RENDER_FEATURE_TICKS = RENDER.featureEveryTicks;
import { createRandom } from './random.js';
import {
  curvature, resample, smooth, initialCentreline, arcLength,
  migrationRate, migrate, findNeckCutoff, spliceCutoff, findChuteCutoff,
} from './centreline.js';
import {
  createGrid, stampChannel, stampOxbow, retireOxbow, growLand, sampleErodibility, paintRock, cellsNear, rebase, effectiveDepth, cellIndex,
} from './floodplain.js';

export class Engine {
  constructor(settings) {
    this.reset(settings);
  }

  reset(settings) {
    this.settings = { ...settings };
    this.rng = createRandom(this.settings.seed);
    this.year = 0;
    this.tickCount = 0;
    const { x, y } = initialCentreline(this.settings, this.rng);
    this.x = x; this.y = y;
    this.oxbows = [];
    this.oxbowCount = 0;
    this.events = [];
    this.history = [];          // [{ year, x: Float32Array, y: Float32Array }]
    this.lastHistoryYear = -Infinity;
    this.flood = 0;             // 0 = normal flow, up to 1 at the flood peak
    this.floodRemaining = 0;
    this.floodPending = false;
    this.discharge = this.settings.meanDischarge;
    this.yearDischargeAt = -1;
    this.incision = 0;          // metres the whole water profile has cut down
    this.incisionTarget = 0;    // extra incision still to do after a sudden base-level drop
    this.rate = new Float64Array(x.length);
    this.curv = new Float64Array(x.length);
    this.level = new Float64Array(x.length);
    this.grid = createGrid(this.settings, this.rng);
    this.landDt = 0;
    this.features = [];
    this.computeLevels();
    this.stamp();
  }

  // Settings that apply from the next tick without a reset.
  applySettings(partial) {
    Object.assign(this.settings, partial);
    if (partial.valleySlope !== undefined || partial.bankHeight !== undefined) {
      rebase(this.grid, this.settings);
      this.computeLevels();
    }
  }

  // Tall banks (terrace edges) erode more slowly than the river's own banks.
  // The river's own levees (up to leveeMaxHeight) do not count; only ground
  // standing higher than that, such as a terrace edge, slows it down. The
  // slowing goes with the square root of the extra height (tall banks also
  // fail by slumping, which keeps them retreating) and never below
  // minBankFactor, so an incising river keeps sweeping the valley floor and
  // cuts a broad terraced valley rather than freezing in a slot.
  static bankFactor(actual, nominal) {
    const excess = actual - nominal - FLOODPLAIN.leveeMaxHeight;
    if (excess <= 0) return 1;
    return Math.max(CENTRELINE.minBankFactor, Math.sqrt(nominal / (nominal + excess)));
  }

  static helpers = { sampleErodibility, effectiveDepth, bankFactor: Engine.bankFactor };

  get depth() { return effectiveDepth(this.settings); }

  triggerFlood() { this.floodPending = true; }

  // Sudden base-level fall: the bed cuts down towards it at a limited rate.
  dropBaseLevel(metres = CENTRELINE.baseLevelDrop) { this.incisionTarget += metres; }

  // Vertical erosion for one step: steady incision plus any pending drop.
  updateIncision() {
    this.incision += (this.settings.incisionRate / 1000) * DT;
    if (this.incisionTarget > 0) {
      const cut = Math.min(this.incisionTarget, CENTRELINE.incisionMaxRate * DT);
      this.incision += cut;
      this.incisionTarget -= cut;
    }
  }

  // Paint hard rock (or clear it) in a disc, from the renderer's mouse.
  paint(x, y, radius, on) { paintRock(this.grid, x, y, radius, on); }

  get ds() { return this.settings.channelWidth * CENTRELINE.spacingFactor; }

  // Water surface level at every centreline point: the valley's fall shared
  // out along the river's actual length, so a sinuous river is gentler.
  computeLevels() {
    const s = this.settings;
    const arc = arcLength(this.x, this.y);
    const total = arc[arc.length - 1] || 1;
    const top = s.valleySlope * VALLEY.length + this.depth;
    const fall = s.valleySlope * VALLEY.length;
    const n = this.x.length;
    const level = new Float64Array(n);
    for (let i = 0; i < n; i++) level[i] = top - (arc[i] / total) * fall - this.incision;
    this.level = level;
  }

  waterLevelAt(index) { return this.level[Math.min(index, this.level.length - 1)]; }

  // Erodibility multiplier at a centreline point: valley walls, the outlet
  // fade, and the floodplain grid sampled at the outer bank.
  localErodibility(i) {
    const s = this.settings;
    const W = s.channelWidth;
    const y = this.y[i], x = this.x[i];
    const margin = CENTRELINE.wallMarginWidths * W;
    const edge = Math.min(y, VALLEY.width - y);
    const wall = edge < margin ? Math.max(0, edge / margin) ** 2 : 1;
    const outlet = CENTRELINE.outletFadeFraction * VALLEY.length;
    const toEnd = VALLEY.length - x;
    const exit = toEnd < outlet ? Math.max(0, toEnd / outlet) : 1;
    // Outer bank position: right of flow when turning left (positive curvature).
    const n = this.x.length;
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const tx = this.x[i1] - this.x[i0], ty = this.y[i1] - this.y[i0];
    const l = Math.hypot(tx, ty) || 1;
    const side = this.curv[i] > 0 ? 1 : -1;
    const bx = x + (ty / l) * side * W * 0.5, by = y - (tx / l) * side * W * 0.5;
    const ground = sampleErodibility(this.grid, bx, by, s);
    // Bank height at the outer bank: the old floodplain stands tall above an incised river.
    const actualBank = this.grid.height[cellIndex(this.grid, bx, by)] - (this.level[i] - this.depth);
    return wall * exit * ground * Engine.bankFactor(actualBank, s.bankHeight);
  }

  updateDischarge() {
    const s = this.settings;
    const yearIndex = Math.floor(this.year + 1e-9);
    if (yearIndex !== this.yearDischargeAt) {
      this.yearDischargeAt = yearIndex;
      this.discharge = s.meanDischarge * Math.exp(this.rng.gaussian() * FLOODS.dischargeVariation);
      if (this.rng.chance(s.floodFrequency / 100)) this.floodPending = true;
    }
    if (this.floodPending) {
      this.floodPending = false;
      this.floodRemaining = FLOODS.duration;
      this.events.push({ type: 'flood', x: VALLEY.length / 2, y: VALLEY.width / 2, year: this.year });
    }
    if (this.floodRemaining > 0) {
      this.floodRemaining -= DT;
      const f = Math.max(0, this.floodRemaining / FLOODS.duration);
      // Rise fast, fall slowly.
      this.flood = f > 0.75 ? (1 - f) / 0.25 : f / 0.75;
      if (this.flood < 0.05) this.flood = 0.05;
    } else {
      this.flood = 0;
    }
  }

  tick() {
    const s = this.settings;
    const W = s.channelWidth;
    const ds = this.ds;
    this.updateDischarge();
    this.updateIncision();

    // 1. Curvature.
    const c = curvature(this.x, this.y);
    smooth(c, CENTRELINE.curvatureSmoothing);
    this.curv = c;

    // 2. Migration rate.
    const n = this.x.length;
    const q = this.flood > 0 ? s.meanDischarge * (1 + (s.floodSize - 1) * this.flood) : this.discharge;
    const qFactor = Math.pow(q / s.meanDischarge, CENTRELINE.dischargeExponent);
    const base = s.erodibility * CENTRELINE.migrationScale * qFactor;
    const k = new Float64Array(n);
    const prot = CENTRELINE.endProtection;
    for (let i = prot; i < n - prot; i++) k[i] = base * this.localErodibility(i);
    const rate = migrationRate(this.x, this.y, c, k, { omega: s.omega, gamma: s.gamma, alpha: s.alpha }, ds, W);
    // Bank heterogeneity: a little random lateral wobble seeds bends on
    // straight reaches, which the model then amplifies at its preferred wavelength.
    const noise = CENTRELINE.bankNoise * base;
    for (let i = prot; i < n - prot; i++) rate[i] += noise * this.rng.gaussian() * (k[i] / base || 0);
    this.bankCollapses(rate, k, base);
    this.rate = rate;

    // 3. Move, re-space.
    migrate(this.x, this.y, rate, DT);
    if (CENTRELINE.smoothingPasses > 0) {
      smooth(this.x, CENTRELINE.smoothingPasses);
      smooth(this.y, CENTRELINE.smoothingPasses);
    }
    this.clampToValley();
    ({ x: this.x, y: this.y } = resample(this.x, this.y, ds));

    // 4. Cutoffs.
    const minSep = Math.round((CENTRELINE.minSeparationWidths * W) / ds);
    for (let guard = 0; guard < 3; guard++) {
      const hit = findNeckCutoff(this.x, this.y, minSep, s.cutoffDistance * W, prot);
      if (!hit) break;
      this.cutoff(hit.i, hit.j, 'neck');
    }
    if (this.flood > 0) {
      const c2 = curvature(this.x, this.y);
      const hit = findChuteCutoff(this.x, this.y, c2, this.rng, s.chuteChance * DT, ds, W, prot);
      if (hit) this.cutoff(hit.i, hit.j, 'chute');
    }

    // 5. Floodplain: carve the channel, age oxbows, grow land.
    this.computeLevels();
    this.stamp();
    this.ageOxbows();
    this.landDt += DT;
    this.tickCount++;
    if (this.tickCount % FLOODPLAIN.landEveryTicks === 0) {
      growLand(this.grid, s, this.landDt, this.flood);
      this.landDt = 0;
    }

    if (this.tickCount % RENDER_FEATURE_TICKS === 0) this.features = this.findFeatures();

    // 6. History for trails.
    if (this.year - this.lastHistoryYear >= CENTRELINE.trailInterval - 1e-9) {
      this.history.push({ year: this.year, x: Float32Array.from(this.x), y: Float32Array.from(this.y) });
      this.lastHistoryYear = this.year;
      const keep = Math.max(...CENTRELINE.trailAges) / CENTRELINE.trailInterval + 2;
      if (this.history.length > keep) this.history.splice(0, this.history.length - keep);
    }

    this.year += DT;
  }

  stamp() {
    const n = this.x.length;
    const river = {
      x: this.x, y: this.y,
      curvature: this.curv.length === n ? this.curv : new Float64Array(n),
      rate: this.rate.length === n ? this.rate : new Float64Array(n),
      level: this.level,
      dt: DT,
    };
    stampChannel(this.grid, river, this.settings, this.year, this.flood);
  }

  // Undercut banks occasionally fail: a chunk falls in, plants are stripped.
  bankCollapses(rate, k, base) {
    const s = this.settings;
    const n = this.x.length;
    const prot = CENTRELINE.endProtection;
    for (let i = prot; i < n - prot; i++) {
      if (Math.abs(rate[i]) < FLOODS.collapseRateThreshold) continue;
      if (!this.rng.chance(FLOODS.collapseChance * DT)) continue;
      const sign = rate[i] > 0 ? 1 : -1;
      const slump = (FLOODS.collapseSlump * (k[i] / base || 0)) / DT;
      rate[i] += sign * slump;
      if (i > prot) rate[i - 1] += sign * slump * 0.5;
      if (i < n - 1 - prot) rate[i + 1] += sign * slump * 0.5;
      // Strip vegetation around the failed bank.
      const W = s.channelWidth;
      const r = FLOODS.collapseVegStripRadius * W;
      const cells = cellsNear(this.grid, Float64Array.of(this.x[i], this.x[i] + 0.01), Float64Array.of(this.y[i], this.y[i]), r);
      for (const c of cells) this.grid.veg[c] *= 0.2;
      this.events.push({ type: 'collapse', x: this.x[i], y: this.y[i], year: this.year });
    }
  }

  clampToValley() {
    const W = this.settings.channelWidth;
    const lo = W, hi = VALLEY.width - W;
    for (let i = 1; i < this.y.length - 1; i++) {
      if (this.y[i] < lo) this.y[i] = lo; else if (this.y[i] > hi) this.y[i] = hi;
      if (this.x[i] < 0) this.x[i] = 0; else if (this.x[i] > VALLEY.length) this.x[i] = VALLEY.length;
    }
  }

  cutoff(i, j, type) {
    const s = this.settings;
    const level = this.waterLevelAt(i);
    const out = spliceCutoff(this.x, this.y, i, j);
    this.x = out.x; this.y = out.y;
    ({ x: this.x, y: this.y } = resample(this.x, this.y, this.ds));
    const loop = out.loop;
    let cx = 0, cy = 0;
    for (let p = 0; p < loop.x.length; p++) { cx += loop.x[p]; cy += loop.y[p]; }
    cx /= loop.x.length; cy /= loop.x.length;
    const oxbow = {
      id: ++this.oxbowCount,
      x: Float32Array.from(loop.x), y: Float32Array.from(loop.y),
      age: 0, depth: this.depth, width: s.channelWidth, year: this.year, cx, cy, level,
      cells: cellsNear(this.grid, loop.x, loop.y, s.channelWidth / 2),
      lastStampDepth: this.depth,
    };
    this.oxbows.push(oxbow);
    // Carve the lake bed now, before the channel stamp turns the loop into point bar.
    stampOxbow(this.grid, oxbow, s, true);
    this.events.push({ type, x: this.x[i], y: this.y[i], year: this.year });
  }

  ageOxbows() {
    const s = this.settings;
    const rate = (this.depth / FLOODPLAIN.oxbowInfillYears) * s.infillRate * DT;
    for (let k = this.oxbows.length - 1; k >= 0; k--) {
      const o = this.oxbows[k];
      o.age += DT;
      o.depth -= rate;
      if (o.depth <= 0) {
        retireOxbow(this.grid, o);
        this.oxbows.splice(k, 1);
        continue;
      }
      // Re-stamp when the bed has risen noticeably, or every few years so the
      // live channel's carving cannot erase the lake.
      if (o.lastStampDepth - o.depth > 0.1 || this.tickCount % 8 === 0) {
        stampOxbow(this.grid, o, s);
        o.lastStampDepth = o.depth;
      }
    }
  }

  // Explain-mode features: where the labelled things are right now.
  findFeatures() {
    const s = this.settings;
    const W = s.channelWidth;
    const n = this.x.length;
    const c = this.curv.length === n ? this.curv : curvature(this.x, this.y);
    const g = this.grid;
    const out = [];
    const normal = (i) => {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const dx = this.x[i1] - this.x[i0], dy = this.y[i1] - this.y[i0];
      const l = Math.hypot(dx, dy) || 1;
      return [dy / l, -dx / l]; // right-hand normal
    };
    const cellAt = (x, y) => {
      const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell)));
      const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell)));
      return cy * g.cols + cx;
    };
    const minCurv = 0.35 / W;
    const prot = CENTRELINE.endProtection;
    let lastApex = -100, apexCount = 0, lastInflection = -100;
    for (let i = prot + 1; i < n - prot - 1; i++) {
      const a = Math.abs(c[i]);
      if (a > minCurv && a >= Math.abs(c[i - 1]) && a > Math.abs(c[i + 1]) && i - lastApex > 8) {
        lastApex = i;
        apexCount++;
        const [nx, ny] = normal(i);
        const side = c[i] > 0 ? 1 : -1;
        const x = this.x[i], y = this.y[i];
        out.push({ type: 'cutbank', x: x + nx * side * W * 0.65, y: y + ny * side * W * 0.65 });
        out.push({ type: 'pointbar', x: x - nx * side * W * 0.75, y: y - ny * side * W * 0.75 });
        out.push({ type: 'pool', x, y, level: this.level[i] });
        if (apexCount % 3 === 2) out.push({ type: 'helical', x: x + nx * side * W * 0.15, y: y + ny * side * W * 0.15, level: this.level[i] });
        const sx = x - nx * side * W * 2.2, sy = y - ny * side * W * 2.2;
        const ci = cellAt(sx, sy);
        if (g.channel[ci] === 0 && g.height[ci] < g.base[ci] - 0.15) out.push({ type: 'scrollbar', x: sx, y: sy });
      }
      if (c[i - 1] * c[i + 1] < 0 && i - lastInflection > 20 && i - lastApex > 4) {
        lastInflection = i;
        if (out.filter((f) => f.type === 'riffle').length < 4) out.push({ type: 'riffle', x: this.x[i], y: this.y[i], level: this.level[i] });
      }
    }
    // Meander necks: reaches close to joining.
    const minSep = Math.round((CENTRELINE.minSeparationWidths * W) / this.ds);
    const neck = findNeckCutoff(this.x, this.y, minSep, 2.5 * W, prot);
    if (neck) out.push({ type: 'neck', x: (this.x[neck.i] + this.x[neck.j]) / 2, y: (this.y[neck.i] + this.y[neck.j]) / 2 });
    // Oxbows: label at the point of the loop furthest from its chord.
    for (const o of this.oxbows) {
      const ax = o.x[0], ay = o.y[0], bx = o.x[o.x.length - 1], by = o.y[o.y.length - 1];
      let best = 0, bestD = -1;
      for (let p = 0; p < o.x.length; p++) {
        const d = Math.abs((bx - ax) * (ay - o.y[p]) - (ax - o.x[p]) * (by - ay));
        if (d > bestD) { bestD = d; best = p; }
      }
      out.push({ type: o.depth > FLOODPLAIN.oxbowMarshDepth ? 'oxbow' : 'marsh', x: o.x[best], y: o.y[best], level: o.level });
    }
    // Levees: banks that stand above the floodplain after floods.
    let levees = 0, lastLevee = -100;
    for (let i = prot; i < n - prot && levees < 3; i += 6) {
      if (i - lastLevee < 50) continue;
      const [nx, ny] = normal(i);
      for (const side of [1, -1]) {
        const lx = this.x[i] + nx * side * W * 0.85, ly = this.y[i] + ny * side * W * 0.85;
        const ci = cellAt(lx, ly);
        if (g.channel[ci] === 0 && g.height[ci] > g.base[ci] + 0.35) {
          out.push({ type: 'levee', x: lx, y: ly });
          levees++; lastLevee = i;
          break;
        }
      }
    }
    // Terraces: old floodplain standing well above the river beside the channel.
    let terraces = 0, lastTerrace = -100;
    for (let i = prot; i < n - prot && terraces < 3; i += 6) {
      if (i - lastTerrace < 40) continue;
      const [nx, ny] = normal(i);
      for (const side of [1, -1]) {
        const tx = this.x[i] + nx * side * W * 1.2, ty = this.y[i] + ny * side * W * 1.2;
        const ci = cellAt(tx, ty);
        if (g.channel[ci] === 0 && g.height[ci] - (this.level[i] - this.depth) > s.bankHeight * 1.8) {
          out.push({ type: 'terrace', x: tx, y: ty });
          terraces++; lastTerrace = i;
          break;
        }
      }
    }
    if (this.flood > 0) out.push({ type: 'flood', x: this.x[Math.floor(n / 2)], y: this.y[Math.floor(n / 2)], level: this.level[Math.floor(n / 2)] + 1 });
    return out;
  }

  // History trails for the configured ages.
  trails() {
    return CENTRELINE.trailAges.map((age) => {
      const target = this.year - age;
      let best = null;
      for (const h of this.history) if (h.year <= target + 1e-6 && (!best || h.year > best.year)) best = h;
      return best ? { age, x: best.x, y: best.y } : null;
    }).filter(Boolean);
  }

  snapshot() {
    const s = this.settings;
    const n = this.x.length;
    const W = s.channelWidth;
    const curv = this.curv.length === n ? this.curv : curvature(this.x, this.y);
    const depth = new Float32Array(n), thalweg = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const bend = Math.min(1, Math.abs(curv[i]) * W * THALWEG.curvatureScale);
      depth[i] = this.depth * (1 + THALWEG.poolFactor * bend);
      thalweg[i] = (curv[i] > 0 ? 1 : -1) * THALWEG.shiftFraction * (W / 2) * bend;
    }
    const g = this.grid;
    const veg8 = new Uint8Array(g.veg.length);
    for (let i = 0; i < veg8.length; i++) veg8[i] = g.veg[i] * 255;
    const snap = {
      year: this.year,
      flood: this.flood,
      discharge: this.discharge,
      centreline: {
        x: Float32Array.from(this.x),
        y: Float32Array.from(this.y),
        curvature: Float32Array.from(curv),
        rate: Float32Array.from(this.rate.length === n ? this.rate : new Float64Array(n)),
        level: Float32Array.from(this.level.length === n ? this.level : new Float64Array(n)),
        depth, thalweg,
        width: W,
        meanDepth: this.depth,
      },
      oxbows: this.oxbows.map((o) => ({ id: o.id, year: o.year, x: o.x, y: o.y, age: o.age, depth: o.depth, width: o.width, cx: o.cx, cy: o.cy, level: o.level })),
      events: this.events,
      trails: this.trails(),
      features: this.features,
      grid: {
        cols: g.cols, rows: g.rows, cell: g.cell,
        height: Float32Array.from(g.height),
        surface: Uint8Array.from(g.surface),
        veg: veg8,
      },
      settings: { channelWidth: W, channelDepth: this.depth, bankHeight: s.bankHeight, valleySlope: s.valleySlope, incision: this.incision },
    };
    this.events = [];
    return snap;
  }
}
