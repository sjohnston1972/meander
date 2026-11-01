// The simulation engine. Owns the river centreline, the oxbows and the
// floodplain grid, advances them one fixed time step per tick(), and hands out
// snapshots for the renderer. Pure JavaScript; never touches three.js.
import { VALLEY, DT, CENTRELINE, FLOODS } from '../config.js';
import { createRandom } from './random.js';
import {
  curvature, resample, smooth, initialCentreline,
  migrationRate, migrate, findNeckCutoff, spliceCutoff, findChuteCutoff,
} from './centreline.js';

export class Engine {
  constructor(settings) {
    this.reset(settings);
  }

  reset(settings) {
    this.settings = { ...settings };
    this.rng = createRandom(this.settings.seed);
    this.year = 0;
    const { x, y } = initialCentreline(this.settings, this.rng);
    this.x = x; this.y = y;
    this.oxbows = [];
    this.events = [];
    this.history = [];          // [{ year, x: Float32Array, y: Float32Array }]
    this.lastHistoryYear = -Infinity;
    this.flood = 0;             // 0 = normal flow, >0 = flood intensity (years remaining scaled)
    this.floodRemaining = 0;
    this.floodPending = false;
    this.discharge = this.settings.meanDischarge;
    this.yearDischargeAt = -1;
    this.rate = new Float64Array(x.length);
    this.curv = new Float64Array(x.length);
    this.onReset?.();
  }

  // Settings that apply from the next tick without a reset.
  applySettings(partial) {
    Object.assign(this.settings, partial);
    this.onSettings?.(partial);
  }

  triggerFlood() { this.floodPending = true; }

  get ds() { return this.settings.channelWidth * CENTRELINE.spacingFactor; }

  // Erodibility multiplier at a centreline point; overridden by the floodplain
  // grid (Task 9). Keeps the river off the valley walls.
  localErodibility(i) {
    const W = this.settings.channelWidth;
    const y = this.y[i], x = this.x[i];
    // Valley walls: erodibility fades to zero over the last few widths.
    const margin = CENTRELINE.wallMarginWidths * W;
    const edge = Math.min(y, VALLEY.width - y);
    const wall = edge < margin ? Math.max(0, edge / margin) ** 2 : 1;
    // Outlet: bends slow down before the fixed downstream end so they do not pile up.
    const outlet = CENTRELINE.outletFadeFraction * VALLEY.length;
    const toEnd = VALLEY.length - x;
    const exit = toEnd < outlet ? Math.max(0, toEnd / outlet) : 1;
    const grid = this.gridErodibility ? this.gridErodibility(i) : 1;
    return wall * exit * grid;
  }

  updateDischarge() {
    const s = this.settings;
    const yearIndex = Math.floor(this.year + 1e-9);
    if (yearIndex !== this.yearDischargeAt) {
      this.yearDischargeAt = yearIndex;
      this.discharge = s.meanDischarge * Math.exp(this.rng.gaussian() * FLOODS.dischargeVariation);
      // Floods arrive at `floodFrequency` per 100 years.
      if (this.rng.chance(s.floodFrequency / 100)) this.floodPending = true;
    }
    if (this.floodPending) {
      this.floodPending = false;
      this.floodRemaining = FLOODS.duration;
      this.events.push({ type: 'flood', x: VALLEY.length / 2, y: VALLEY.width / 2, year: this.year });
    }
    if (this.floodRemaining > 0) {
      this.floodRemaining -= DT;
      // Rise quickly, fall slowly.
      const f = this.floodRemaining / FLOODS.duration;
      this.flood = Math.max(0, Math.min(1, f < 0.8 ? f / 0.8 : (1 - f) / 0.2 + 0.0001));
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

    // 1. Curvature.
    let c = curvature(this.x, this.y);
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
    for (let i = prot; i < n - prot; i++) rate[i] += noise * this.rng.gaussian() * this.localErodibility(i);
    this.rate = rate;
    this.beforeMigrate?.(rate);

    // 3. Move, smooth, re-space.
    migrate(this.x, this.y, rate, DT);
    smooth(this.x, CENTRELINE.smoothingPasses);
    smooth(this.y, CENTRELINE.smoothingPasses);
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

    // 5. Oxbows age.
    for (const o of this.oxbows) o.age += DT;

    // 6. Floodplain (Tasks 6-9 hook in here).
    this.afterMove?.();

    // 7. History for trails.
    if (this.year - this.lastHistoryYear >= CENTRELINE.trailInterval - 1e-9) {
      this.history.push({ year: this.year, x: Float32Array.from(this.x), y: Float32Array.from(this.y) });
      this.lastHistoryYear = this.year;
      const keep = Math.max(...CENTRELINE.trailAges) / CENTRELINE.trailInterval + 2;
      if (this.history.length > keep) this.history.splice(0, this.history.length - keep);
    }

    this.year += DT;
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
    const out = spliceCutoff(this.x, this.y, i, j);
    this.x = out.x; this.y = out.y;
    ({ x: this.x, y: this.y } = resample(this.x, this.y, this.ds));
    const loop = out.loop;
    let cx = 0, cy = 0;
    for (let p = 0; p < loop.x.length; p++) { cx += loop.x[p]; cy += loop.y[p]; }
    cx /= loop.x.length; cy /= loop.x.length;
    this.oxbows.push({
      x: Float32Array.from(loop.x), y: Float32Array.from(loop.y),
      age: 0, depth: s.channelDepth, width: s.channelWidth, year: this.year, cx, cy,
      level: this.waterLevelAt ? this.waterLevelAt(loop.x[0]) : 0,
    });
    const nx = this.x[i], ny = this.y[i];
    this.events.push({ type, x: nx, y: ny, year: this.year });
    this.onCutoff?.(loop);
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
    const snap = {
      year: this.year,
      flood: this.flood,
      discharge: this.discharge,
      centreline: {
        x: Float32Array.from(this.x),
        y: Float32Array.from(this.y),
        curvature: Float32Array.from(this.curv.length === n ? this.curv : curvature(this.x, this.y)),
        rate: Float32Array.from(this.rate.length === n ? this.rate : new Float64Array(n)),
        width: s.channelWidth,
        depth: s.channelDepth,
      },
      oxbows: this.oxbows.map((o) => ({ x: o.x, y: o.y, age: o.age, depth: o.depth, width: o.width, cx: o.cx, cy: o.cy, level: o.level })),
      events: this.events,
      trails: this.trails(),
    };
    this.events = [];
    this.extendSnapshot?.(snap);
    return snap;
  }
}
