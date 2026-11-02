// The simulation engine. Owns the river centreline, the oxbows and the
// floodplain grid, advances them one fixed time step per tick(), and hands out
// snapshots for the renderer. Pure JavaScript; never touches three.js.
import { VALLEY, DT, CENTRELINE, FLOODS, FLOODPLAIN, THALWEG, RENDER, SURFACE, BRAID, HILLS, SEDIMENT, LAKE, TRIB } from '../config.js';

const RENDER_FEATURE_TICKS = RENDER.featureEveryTicks;
const BEDROCK_SEND_TICKS = 40; // at most every 10 years
import { createRandom, createNoise2D } from './random.js';
import { SAVE_VERSION } from './savefile.js';
import {
  curvature, resample, smooth, initialCentreline, arcLength,
  migrationRate, migrate, findNeckCutoff, spliceCutoff, findChuteCutoff,
} from './centreline.js';
import {
  createGrid, baseLevel, raiseFloodplain, stampChannel, stampOxbow, retireOxbow, growLand, sampleErodibility, paintRock, cellsNear, rebase, effectiveDepth, cellIndex, setAlluvium, stampBraided,
} from './floodplain.js';
import { relaxSlopes, findSlideSite, landslide, newGully, growGully } from './hillslope.js';
import { fillPond } from './dams.js';
import { solveBed } from './sediment.js';
import {
  OPEN_LAKE, makeLake, emerge, depositDelta, traceDistributary, carveDistributary, abandonDistributary,
} from './delta.js';
import {
  newTributary, migrateTributary, joinMain, tributaryLevels, carveTributary, growFan, tribWidth, tribDepth,
} from './tributary.js';
import { exp, pow, hypot, sin, cos } from './dmath.js';

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
    this.inletY = y[0];
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
    this.knickpoints = [];      // [{ pos: metres upstream of the outlet, drop: metres }]
    this.sentBedrockVersion = -1;
    this.braid = 0;             // 0 = one meandering channel, 1 = fully braided
    this.braidTime = 0;         // noise time that moves the braid threads about
    this.braidNoise = createNoise2D(this.settings.seed * 48271 + 5);
    this.inflowNoise = createNoise2D(this.settings.seed * 69621 + 13);
    this.threads = null;        // { offsets[k][i], width, half } while braided
    this.slides = [];           // landslide debris pushing the river: [{ x, y, dirx, diry, width, age }]
    this.slideMarks = [];       // recent landslide scars, for labels: [{ x, y, year }]
    this.hangingLoops = [];     // loops left high and dry by a river cutting down: [{ x, y, year }]
    this.gullies = [];          // side gullies cutting back into the valley walls (see hillslope.newGully)
    this.dams = [];             // landslide dams: [{ id, x, y, crest, natural, age, radius, cells }]
    this.damCount = 0;
    this.rate = new Float64Array(x.length);
    this.curv = new Float64Array(x.length);
    this.level = new Float64Array(x.length);
    this.aggr = new Float64Array(x.length);  // bed built up (+) or scoured (-) by sediment, metres, per point
    this.sedPending = [];       // sediment dumped in the river this step: [{ x, y, volume }]
    this.sediment = { out: 0, exported: 0, trapped: 0, stored: 0, inflow: 0, fromWalls: 0, fromSlides: 0, fromGullies: 0, delta: 0, fromTributary: 0 };
    this.wash = null;           // fines passing each point, m^3/yr (null when there are none beyond the usual)
    this.loadExcess = 1;        // load leaving the valley over the load coming in from upstream (1 to maxLoadExcess)
    this.loadRatio = null;      // load carried past each point over the load from upstream (null when in balance)
    this.q = this.settings.meanDischarge;
    this.grid = createGrid(this.settings, this.rng);
    this.trib = null;           // the tributary, while settings.tributary > 0 (see tributary.js)
    this.tribNoise = null; this.mouthNoise = null; // made from the seed when first needed
    this.lake = null;           // the lake at the valley's end and its delta (valleyEnd: 'lake')
    this.mouth = x.length - 1;  // the river's last point above open water
    if (this.settings.valleyEnd === 'lake') this.lake = Engine.newLake(makeLake(this.grid, this.settings, this.depth));
    this.landDt = 0;
    this.features = [];
    this.computeLevels();
    this.stamp();
    if (this.settings.tributary > 0) this.tributaryStep(0);
  }

  // Lake state: its original cells, sediment waiting to settle, the distributaries.
  static newLake(cells, saved = {}) {
    const lake = {
      cells, version: 1, pending: saved.pending ?? 0, fines: saved.fines ?? 0, deposited: saved.deposited ?? 0,
      dists: (saved.dists || []).map((d) => ({ angle: d.angle, path: null })),
      distCells: saved.distCells ? Array.from(saved.distCells) : [],
      nextSwitch: saved.nextSwitch ?? -1,
      mask: null,
    };
    return lake;
  }

  // The lake's surface: the river's base level at the valley's end.
  get lakeLevel() {
    const r = this.refLevel;
    return r ? r[r.length - 1] : this.depth - this.incision - this.knickLowering(0);
  }

  // How many centreline points carry the river: all of them, or those down to its mouth.
  get active() { return this.lake ? Math.min(this.x.length, this.mouth + 1) : this.x.length; }

  // The first centreline point over open lake water (never right at the inlet).
  findMouth() {
    const n = this.x.length;
    if (!this.lake) return n - 1;
    const g = this.grid;
    for (let i = 0; i < n; i++) {
      if (g.channel[cellIndex(g, this.x[i], this.y[i])] === OPEN_LAKE) return Math.max(i, CENTRELINE.endProtection + 6);
    }
    return n - 1;
  }

  // The whole state as plain data and typed arrays (copies), for saving.
  // Engine.fromState(serialize()) carries on exactly as this engine would.
  serialize() {
    const g = this.grid;
    return {
      version: SAVE_VERSION,
      settings: { ...this.settings },
      rng: this.rng.getState(),
      year: this.year,
      tickCount: this.tickCount,
      x: Float64Array.from(this.x), y: Float64Array.from(this.y), inletY: this.inletY,
      rate: Float64Array.from(this.rate), curv: Float64Array.from(this.curv), level: Float64Array.from(this.level),
      aggr: Float64Array.from(this.aggr), sediment: { ...this.sediment }, q: this.q,
      wash: this.wash ? Float64Array.from(this.wash) : null, loadExcess: this.loadExcess, sedPending: this.sedPending.map((p) => ({ ...p })),
      oxbows: this.oxbows.map((o) => ({ ...o, x: o.x.slice(), y: o.y.slice(), cells: o.cells.slice() })),
      oxbowCount: this.oxbowCount,
      history: this.history.map((h) => ({ year: h.year, x: h.x.slice(), y: h.y.slice() })),
      lastHistoryYear: this.lastHistoryYear,
      flood: this.flood, floodRemaining: this.floodRemaining, floodPending: this.floodPending,
      discharge: this.discharge, yearDischargeAt: this.yearDischargeAt,
      incision: this.incision, knickpoints: this.knickpoints.map((k) => ({ ...k })),
      braid: this.braid, braidTime: this.braidTime,
      slides: this.slides.map((v) => ({ ...v })), slideMarks: this.slideMarks.map((v) => ({ ...v })),
      dams: this.dams.map((d) => ({ ...d, cells: d.cells.slice() })), damCount: this.damCount,
      gullies: this.gullies.map((v) => ({ ...v, px: v.px.slice(), py: v.py.slice() })),
      hangingLoops: this.hangingLoops.map((v) => ({ ...v })),
      trib: this.trib ? {
        x: Float64Array.from(this.trib.x), y: Float64Array.from(this.trib.y), entryX: this.trib.entryX, entryX0: this.trib.entryX0, entryY: this.trib.entryY,
        side: this.trib.side, j: this.trib.j, age: this.trib.age,
      } : null,
      lake: this.lake ? {
        cells: this.lake.cells.slice(), pending: this.lake.pending, fines: this.lake.fines, deposited: this.lake.deposited,
        dists: this.lake.dists.map((d) => ({ angle: d.angle })), distCells: Int32Array.from(this.lake.distCells), nextSwitch: this.lake.nextSwitch,
      } : null,
      landDt: this.landDt,
      grid: {
        cols: g.cols, rows: g.rows, cell: g.cell, slope: g.slope, bankHeight: g.bankHeight,
        height: g.height.slice(), base: g.base.slice(), relief: g.relief.slice(), surface: g.surface.slice(),
        patch: g.patch.slice(), rock: g.rock.slice(), veg: g.veg.slice(), channel: g.channel.slice(),
        lakeLost: g.lakeLost.slice(), chanLevel: g.chanLevel.slice(), chanList: Int32Array.from(g.chanList),
        bedrock: g.bedrock.slice(), alluvium: g.alluvium,
      },
    };
  }

  // Load a state from serialize() (checked by savefile.validateState first).
  restore(st) {
    this.settings = { ...st.settings };
    this.rng = createRandom(this.settings.seed);
    this.rng.setState(st.rng);
    this.year = st.year;
    this.tickCount = st.tickCount;
    this.x = Float64Array.from(st.x); this.y = Float64Array.from(st.y);
    this.inflowNoise = createNoise2D(this.settings.seed * 69621 + 13);
    this.inletY = st.inletY ?? st.y[0] - this.inletSwing(st.year); // older saves: carry on from where the inlet is
    this.rate = Float64Array.from(st.rate); this.curv = Float64Array.from(st.curv); this.level = Float64Array.from(st.level);
    this.aggr = st.aggr ? Float64Array.from(st.aggr) : new Float64Array(this.x.length);
    this.sedPending = (st.sedPending || []).map((p) => ({ x: p.x, y: p.y, bed: p.bed, fines: p.fines, from: p.from ?? null }));
    this.sediment = { out: 0, exported: 0, trapped: 0, stored: 0, inflow: 0, fromWalls: 0, fromSlides: 0, fromGullies: 0, delta: 0, fromTributary: 0, ...(st.sediment || {}) };
    this.wash = st.wash ? Float64Array.from(st.wash) : null;
    this.loadExcess = st.loadExcess ?? 1;
    this.loadRatio = null;
    this.q = st.q ?? st.discharge;
    this.oxbows = st.oxbows.map((o) => ({ ...o, x: Float32Array.from(o.x), y: Float32Array.from(o.y), cells: Int32Array.from(o.cells) }));
    this.oxbowCount = st.oxbowCount;
    this.history = st.history.map((h) => ({ year: h.year, x: Float32Array.from(h.x), y: Float32Array.from(h.y) }));
    this.lastHistoryYear = st.lastHistoryYear ?? -Infinity;
    this.flood = st.flood; this.floodRemaining = st.floodRemaining; this.floodPending = st.floodPending;
    this.discharge = st.discharge; this.yearDischargeAt = st.yearDischargeAt;
    this.incision = st.incision;
    this.knickpoints = (st.knickpoints || []).map((k) => ({ pos: +k.pos || 0, drop: +k.drop || 0 }));
    this.sentBedrockVersion = -1;
    this.braid = st.braid ?? 0;
    this.braidTime = st.braidTime ?? 0;
    this.braidNoise = createNoise2D(this.settings.seed * 48271 + 5);
    this.threads = null;
    this.slides = (st.slides || []).map((v) => ({ x: v.x, y: v.y, dirx: v.dirx, diry: v.diry, width: v.width, age: v.age }));
    this.slideMarks = (st.slideMarks || []).map((v) => ({ x: v.x, y: v.y, year: v.year }));
    this.dams = (st.dams || []).map((d) => ({ id: d.id, x: d.x, y: d.y, crest: d.crest, natural: d.natural, age: d.age, radius: d.radius, cells: Int32Array.from(d.cells) }));
    this.damCount = st.damCount ?? 0;
    this.hangingLoops = (st.hangingLoops || []).map((v) => ({ x: v.x, y: v.y, year: v.year }));
    this.gullies = (st.gullies || []).map((v) => ({
      x: v.x, y: v.y, dirx: v.dirx, diry: v.diry, px: Array.from(v.px), py: Array.from(v.py),
      length: v.length, maxLength: v.maxLength, footZ: v.footZ, age: v.age,
    }));
    this.landDt = st.landDt;
    const g = st.grid;
    const n = g.cols * g.rows;
    this.grid = {
      cols: g.cols, rows: g.rows, cell: g.cell, slope: g.slope, bankHeight: g.bankHeight,
      height: Float32Array.from(g.height), base: Float32Array.from(g.base), relief: Float32Array.from(g.relief),
      surface: Uint8Array.from(g.surface), patch: Float32Array.from(g.patch), rock: Uint8Array.from(g.rock),
      veg: Float32Array.from(g.veg), channel: Uint8Array.from(g.channel), lakeLost: Uint8Array.from(g.lakeLost),
      chanLevel: Float32Array.from(g.chanLevel), chanList: Array.from(g.chanList),
      bedrock: Float32Array.from(g.bedrock), alluvium: g.alluvium, bedrockVersion: 0,
      stamp: new Uint32Array(n), stampId: 1, chanSeg: new Int32Array(n),
    };
    this.lake = st.lake ? Engine.newLake(Int32Array.from(st.lake.cells), st.lake) : null;
    this.mouth = this.findMouth();
    this.trib = st.trib ? {
      x: Float64Array.from(st.trib.x), y: Float64Array.from(st.trib.y), entryX: st.trib.entryX, entryX0: st.trib.entryX0, entryY: st.trib.entryY,
      side: st.trib.side, j: st.trib.j, age: st.trib.age,
    } : null;
    if (this.trib) tributaryLevels(this.trib, this.settings, this.level, this.depth);
    this.events = [];
    if (this.braid > 0) this.computeThreads();
    this.features = this.findFeatures();
  }

  static fromState(st) {
    const e = Object.create(Engine.prototype);
    e.restore(st);
    return e;
  }

  // Settings that apply from the next tick without a reset.
  applySettings(partial) {
    Object.assign(this.settings, partial);
    if (partial.alluviumDepth !== undefined) setAlluvium(this.grid, this.settings.alluviumDepth);
    if (partial.valleySlope !== undefined || partial.bankHeight !== undefined) {
      // Dam crests and gully mouths are heights on the ground: they move with it.
      const old = { valleySlope: this.grid.slope, bankHeight: this.grid.bankHeight };
      const shift = (x) => baseLevel(x, this.settings) - baseLevel(x, old);
      for (const d of this.dams) d.crest += shift(d.x);
      for (const v of this.gullies) if (Number.isFinite(v.footZ)) v.footZ += shift(v.x);
      rebase(this.grid, this.settings);
      this.computeLevels();
    }
  }

  // Tall banks (terrace edges) erode more slowly than the river's own banks.
  // The river's own levees (up to leveeMaxHeight) do not count; only ground
  // standing higher than that, such as a terrace edge, slows it down. The
  // slowing is weak, a low power of the extra height (tall banks also fail
  // by slumping, which keeps them retreating), and never below
  // minBankFactor, so an incising river keeps sweeping the valley floor and
  // cuts a broad terraced valley rather than freezing in a slot.
  static bankFactor(actual, nominal) {
    const excess = actual - nominal - FLOODPLAIN.leveeMaxHeight;
    if (excess <= 0) return 1;
    return Math.max(CENTRELINE.minBankFactor, pow(nominal / (nominal + excess), CENTRELINE.bankHeightExponent));
  }

  static helpers = { sampleErodibility, effectiveDepth, bankFactor: Engine.bankFactor };

  get depth() { return effectiveDepth(this.settings); }

  // How strongly a river wants to braid: steep, strong and loaded with sediment.
  static braidingIndex(s) { return s.valleySlope * Math.sqrt(s.meanDischarge) * s.sedimentSupply; }
  static threadCount(s) { return Math.max(BRAID.threadsMin, Math.min(BRAID.threadsMax, Math.round(2 + 1.5 * s.sedimentSupply))); }
  static beltHalfWidth(s) { return BRAID.beltWidths * s.channelWidth * Math.sqrt(s.sedimentSupply); }

  // Move the braid amount towards what the pattern setting asks for.
  updatePattern() {
    const s = this.settings;
    let want = s.pattern === 'braided';
    if (s.pattern === 'auto') {
      const t = BRAID.autoThreshold;
      want = Engine.braidingIndex(s) * this.loadExcess > t * (this.braid > 0 ? 1 - BRAID.autoHysteresis : 1 + BRAID.autoHysteresis);
    }
    if (!want && this.braid === 0) return;
    const step = DT / BRAID.rampYears;
    this.braid = want ? Math.min(1, this.braid + step) : Math.max(0, this.braid - step);
    this.braidTime += (DT * (1 + BRAID.floodShift * this.flood)) / BRAID.shiftYears;
  }

  // Thread offsets from the axis: spread evenly across the belt, wandering
  // with smooth noise in distance and time, converging at both ends.
  computeThreads() {
    const s = this.settings;
    const W = s.channelWidth;
    const n = this.x.length;
    const arc = arcLength(this.x, this.y);
    const total = arc[n - 1] || 1;
    const N = Engine.threadCount(s);
    const width = W * (1 - this.braid * (1 - BRAID.threadWidthFraction));
    const half = Engine.beltHalfWidth(s) * this.braid;
    const amp = Math.max(0, half - width / 2);
    const taper = BRAID.taperFraction * total;
    const wave = BRAID.wavelengthWidths * W;
    const c = curvature(this.x, this.y);
    const offsets = [];
    for (let k = 0; k < N; k++) offsets.push(new Float64Array(n));
    // Each thread carries its own share of the flow, which drifts: a main
    // thread now, a trickle later.
    const widths = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const drift = 2 * this.braidNoise(k * 31.7 + 500, this.braidTime * 0.5) - 1;
      widths[k] = width * Math.max(0.3, 1 + BRAID.widthVariation * this.braid * Math.max(-1, Math.min(1, drift * 1.6)));
    }
    for (let i = 0; i < n; i++) {
      let tp = Math.min(1, arc[i] / taper, (total - arc[i]) / taper);
      tp = tp * tp * (3 - 2 * tp);
      const fold = Math.abs(c[i]) > 1e-9 ? 0.7 / Math.abs(c[i]) : Infinity; // never past the bend's centre
      for (let k = 0; k < N; k++) {
        const lane = N > 1 ? -1 + (2 * k) / (N - 1) : 0;
        const wander = (2 * this.braidNoise(arc[i] / wave + k * 17.3, this.braidTime + k * 7.1) - 1) * 1.6;
        let v = BRAID.spread * lane + (1 - BRAID.spread) * 2 * wander;
        if (v > 1) v = 1; else if (v < -1) v = -1;
        let o = amp * tp * v;
        if (o > fold) o = fold; else if (o < -fold) o = -fold;
        offsets[k][i] = o;
      }
    }
    // Thread polylines: the axis offset along its right-hand normal.
    const tx = [], ty = [];
    for (let k = 0; k < N; k++) { tx.push(new Float64Array(n)); ty.push(new Float64Array(n)); }
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const dx = this.x[i1] - this.x[i0], dy = this.y[i1] - this.y[i0];
      const l = hypot(dx, dy) || 1;
      const nx = dy / l, ny = -dx / l;
      for (let k = 0; k < N; k++) {
        tx[k][i] = this.x[i] + nx * offsets[k][i];
        ty[k][i] = Math.min(VALLEY.width, Math.max(0, this.y[i] + ny * offsets[k][i]));
      }
    }
    this.threads = { offsets, tx, ty, width, widths, half };
  }

  // How far the entry point has swung from where it started, metres.
  inletSwing(year) {
    const T = CENTRELINE.inflowYears;
    return CENTRELINE.inletWander * this.settings.channelWidth * 2 * (this.inflowNoise(year / T, 0.37) - this.inflowNoise(0, 0.37));
  }

  triggerFlood() { this.floodPending = true; }

  // Sudden base-level fall: a step (knickpoint) forms at the outlet and
  // travels upstream, lowering the river behind it.
  dropBaseLevel(metres = CENTRELINE.baseLevelDrop) { this.knickpoints.push({ pos: 0, drop: metres }); }

  // Vertical erosion for one step: steady incision everywhere, and each
  // knickpoint moves upstream (faster in high flow). Knickpoints that have
  // passed the head of the river are folded into the steady incision in
  // computeLevels, which knows the river's length.
  updateIncision() {
    this.incision += (this.settings.incisionRate / 1000) * DT;
    if (this.knickpoints.length) {
      const v = CENTRELINE.knickCelerity * Math.sqrt(Math.max(0, this.discharge) / this.settings.meanDischarge) * DT;
      for (const k of this.knickpoints) k.pos += v;
    }
  }

  // How far the knickpoints have lowered the water `fromOutlet` metres
  // (along the river) above the outlet.
  knickLowering(fromOutlet) {
    let drop = 0;
    const L = CENTRELINE.knickLength;
    for (const k of this.knickpoints) {
      const t = (k.pos + L - fromOutlet) / L; // the step rises from pos to pos + L: 1 below it, 0 above
      if (t >= 1) drop += k.drop;
      else if (t > 0) drop += k.drop * t * t * (3 - 2 * t);
    }
    return drop;
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
    for (let k = this.knickpoints.length - 1; k >= 0; k--) {
      const kp = this.knickpoints[k];
      if (kp.pos > total) { this.incision += kp.drop; this.knickpoints.splice(k, 1); }
    }
    const ref = new Float64Array(n);
    const knick = this.knickpoints.length > 0;
    // The graded profile without knickpoint steps: what the sediment budget
    // takes the river's slope from, so a step keeps working its way up the
    // river instead of being smoothed out by the bed.
    const graded = knick ? new Float64Array(n) : ref;
    for (let i = 0; i < n; i++) {
      const g = top - (arc[i] / total) * fall - this.incision;
      ref[i] = knick ? g - this.knickLowering(total - arc[i]) : g;
      if (knick) graded[i] = g;
    }
    this.refLevel = ref;
    this.gradedLevel = graded;
    this.composeLevels();
  }

  // Water level: the reference profile, plus whatever the bed has built up
  // or lost to sediment; behind a landslide dam it stands level at the crest.
  composeLevels() {
    const n = this.x.length;
    const ref = this.refLevel;
    if (this.aggr.length !== n) this.aggr = new Float64Array(n); // only if something replaced the course without carrying it
    const level = new Float64Array(n);
    for (let i = 0; i < n; i++) level[i] = ref[i] + this.aggr[i];
    for (const d of this.dams) {
      const j = this.nearestPoint(d.x, d.y);
      const k = Math.min(n - 1, j + 1);
      d.natural = ref[k] + Math.max(0, this.aggr[k]); // scour below a dam does not make it taller
      for (let i = j; i >= 0 && level[i] < d.crest; i--) level[i] = d.crest;
    }
    this.level = level;
  }

  // Height of the higher ground either side of the river at point i: the
  // floodplain (or braidplain edge) the water cannot rise above.
  bankTop(i) {
    const n = this.x.length;
    const W = this.settings.channelWidth;
    const off = this.threads ? Math.max(W, this.threads.half + W / 2) : 0.9 * W;
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const tx = this.x[i1] - this.x[i0], ty = this.y[i1] - this.y[i0];
    const l = hypot(tx, ty) || 1;
    const nx = ty / l, ny = -tx / l;
    const g = this.grid;
    let top = -Infinity;
    for (const side of [1, -1]) {
      const c = cellIndex(g, this.x[i] + nx * off * side, this.y[i] + ny * off * side);
      if (!g.channel[c] && g.height[c] > top) top = g.height[c];
    }
    return top === -Infinity ? this.level[i] : top;
  }

  // Dump `bed` m^3 of sand and gravel and `fines` m^3 of silt and clay in
  // the river near (x, y) this step; `from` names the tally it counts in.
  addSediment(x, y, bed, fines = 0, from = null) {
    if (bed > 0 || fines > 0) this.sedPending.push({ x, y, bed: Math.max(0, bed), fines: Math.max(0, fines), from });
  }

  // How much cloudier than usual the water is, on average along the river.
  meanWash() {
    if (!this.wash) return 1;
    let t = 0;
    for (let i = 0; i < this.wash.length; i++) t += this.washFactor(i);
    return Math.min(SEDIMENT.maxWash, t / this.wash.length);
  }

  // How much cloudier than usual the water is at point i: 1 = as usual.
  washFactor(i) {
    const w = this.wash;
    if (!w || i < 0 || i >= w.length) return 1;
    return 1 + w[i] / (SEDIMENT.washRef * Math.max(0.2, this.q / this.settings.meanDischarge));
  }

  // Carry bed material down the river for one step (see sediment.js): from
  // upstream, from what fell in this step, out past the outlet.
  sedimentStep() {
    const s = this.settings;
    const N = this.x.length;
    const n = this.active;
    const ds = this.ds;
    const W = this.threads ? Math.max(s.channelWidth, 2 * this.threads.half) : s.channelWidth; // a braided river spreads its load over the braidplain
    const k = SEDIMENT.transport * Math.max(0, this.q);
    const ref = this.refLevel;
    const graded = this.gradedLevel || ref;
    const S = new Float64Array(n - 1);
    for (let f = 0; f < n - 1; f++) {
      const l = hypot(this.x[f + 1] - this.x[f], this.y[f + 1] - this.y[f]) || ds;
      S[f] = Math.max(0, (graded[f] - graded[f + 1]) / l);
    }
    const ratio = 1 + SEDIMENT.supplyCoupling * (s.sedimentSupply - 1);
    const inflow = ratio * k * S[0];
    const sed = this.sediment;
    sed.inflow = inflow;
    // What came into the river this step: walls (as the river ate into them
    // and as they slumped), and landslide and gully debris. Sand and gravel
    // join the bed load; fines are washed straight through.
    const L = new Float64Array(n), fines = new Float64Array(n);
    let sources = false;
    const wall = this.sedWall && this.sedWall.length === N ? this.sedWall : null;
    const bluff = this.sedBluff && this.sedBluff.length === N ? this.sedBluff : null;
    if (wall || bluff) {
      const f = SEDIMENT.wallBedFraction;
      let total = 0;
      for (let i = 0; i < n; i++) {
        const v = (wall ? wall[i] : 0) + (bluff ? bluff[i] / DT : 0);
        if (v <= 0) continue;
        L[i] += f * v; fines[i] += (1 - f) * v; total += v;
        sources = true;
      }
      sed.fromWalls += total * DT;
    }
    this.sedBluff = null;
    for (const p of this.sedPending) {
      const i = Math.min(n - 1, this.nearestPoint(p.x, p.y));
      L[i] += p.bed / DT; fines[i] += p.fines / DT;
      if (p.from) sed[p.from] += p.bed + p.fines;
      sources = true;
    }
    this.sedPending.length = 0;
    // The tributary brings more than its own flow can carry: a fan builds,
    // and the main river below has more water to carry it with.
    let kf = k;
    if (this.trib && this.trib.j < n - 1) {
      const j = this.trib.j;
      const load = TRIB.load * s.tributary * k * S[0];
      L[j] += load; fines[j] += 0.3 * load;
      sed.fromTributary += 1.3 * load * DT;
      sources = true;
      kf = new Float64Array(n - 1);
      for (let f = 0; f < n - 1; f++) kf[f] = f >= j ? k * (1 + s.tributary) : k;
    }
    // Fines are not dropped on the way, except in a lake: what passes each
    // point has come in above it, below the last lake.
    const pool = this.dams.length ? this.pooledPoints() : new Uint8Array(N);
    if (sources) {
      const w = this.wash && this.wash.length === N ? this.wash : new Float64Array(N);
      let sum = 0;
      for (let i = 0; i < n; i++) { sum = pool[i] ? 0 : sum + fines[i]; w[i] = sum; }
      for (let i = n; i < N; i++) w[i] = 0;
      this.wash = w;
      if (this.lake) this.lake.fines += sum * LAKE.finesTrap * DT; // half the mud settles in the lake
    } else this.wash = null;
    let busy = sources || ratio !== 1 || this.knickpoints.length > 0 || this.dams.length > 0;
    for (let i = 0; i < N && !busy; i++) if (this.aggr[i] !== 0) busy = true;
    if (!busy) {
      // In balance: everything that comes in goes straight through.
      this.loadExcess = 1;
      this.loadRatio = null;
      sed.out = k * S[n - 2];
      if (this.lake) { this.lake.pending += sed.out * DT; sed.delta += sed.out * DT; } else sed.exported += sed.out * DT;
      sed.stored = 0;
      return;
    }
    const zMin = new Float64Array(n), zMax = new Float64Array(n);
    const g = this.grid;
    const D = this.depth;
    for (let i = 0; i < n; i++) {
      const rock = g.bedrock[cellIndex(g, this.x[i], this.y[i])] - (ref[i] - D); // bedrock relative to the reference bed
      zMin[i] = Math.min(this.aggr[i], Math.max(-SEDIMENT.maxScour, rock));
      // The bed builds up no faster than its banks: the water stays below the
      // higher bank (the floodplain beside it, which rises too). A delta
      // builds up until the river runs at the lake surface over it.
      const cap = pool[i] ? this.level[i] - ref[i] : Math.min(SEDIMENT.maxAggrade, this.bankTop(i) - ref[i]);
      zMax[i] = Math.max(0, cap); // what stands above it passes on downstream
    }
    // A landslide lake stores sediment over all the ground it floods, not just the channel.
    let width = W;
    if (this.dams.length) {
      width = new Float64Array(n).fill(W);
      const area = g.cell * g.cell;
      for (const d of this.dams) {
        let m = 0;
        for (let i = Math.min(n - 1, this.nearestPoint(d.x, d.y)); i >= 0 && pool[i]; i--) m++;
        const extra = m ? (d.cells.length * area) / (m * ds) : 0;
        for (let i = Math.min(n - 1, this.nearestPoint(d.x, d.y)), c = 0; c < m; i--, c++) width[i] = W + extra;
      }
    }
    const z = n === N ? this.aggr : this.aggr.subarray(0, n);
    const res = solveBed({ z, k: kf, S: n === N ? S : S.subarray(0, n - 1), L, pool, zMin, zMax, inflow, dt: DT, width, ds, porosity: SEDIMENT.porosity });
    if (n < N) this.aggr.fill(0, n);
    sed.out = res.out;
    // More load than comes in from upstream (walls, landslides) makes a river likelier to braid.
    this.loadExcess = inflow > 0 ? Math.min(SEDIMENT.maxLoadExcess, Math.max(1, res.out / inflow)) : 1;
    // The load carried past each point, as a multiple of what comes in from upstream.
    const carried = this.loadRatio && this.loadRatio.length === N ? this.loadRatio : new Float64Array(N);
    for (let f = 0; f < n - 1; f++) {
      const kk = typeof kf === 'number' ? kf : kf[f];
      const flux = pool[f] ? 0 : kk * S[f] - (kk / ds) * (this.aggr[f + 1] - this.aggr[f]);
      carried[f] = inflow > 0 ? Math.max(0, flux / inflow) : 1;
    }
    for (let f = n - 1; f < N; f++) carried[f] = inflow > 0 ? res.out / inflow : 1;
    this.loadRatio = carried;
    if (this.lake) { this.lake.pending += res.out * DT; sed.delta += res.out * DT; } else sed.exported += res.out * DT;
    let stored = 0, trapped = 0;
    for (let i = 0; i < n; i++) {
      const v = this.aggr[i] * (1 - SEDIMENT.porosity) * (typeof width === 'number' ? width : width[i]) * ds;
      stored += v;
      if (pool[i] && v > 0) trapped += v;
    }
    sed.stored = stored;
    sed.trapped = trapped;
    this.composeLevels();
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
    const wall = edge < margin ? (Math.max(0, edge / margin) * Math.max(0, edge / margin)) : 1;
    const outlet = CENTRELINE.outletFadeFraction * VALLEY.length;
    const toEnd = VALLEY.length - x;
    const exit = toEnd < outlet ? Math.max(0, toEnd / outlet) : 1;
    // Outer bank position: right of flow when turning left (positive curvature).
    const n = this.x.length;
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const tx = this.x[i1] - this.x[i0], ty = this.y[i1] - this.y[i0];
    const l = hypot(tx, ty) || 1;
    const side = this.curv[i] > 0 ? 1 : -1;
    const bx = x + (ty / l) * side * W * 0.5, by = y - (tx / l) * side * W * 0.5;
    const ground = sampleErodibility(this.grid, bx, by, s);
    // Bank height at the outer bank: the old floodplain stands tall above an incised river.
    const ci = cellIndex(this.grid, bx, by);
    const bed = this.level[i] - this.depth;
    const actualBank = this.grid.height[ci] - bed;
    if (this.bankH && i < this.bankH.length) this.bankH[i] = actualBank;
    // Where the river has cut below the top of the bedrock, that part of the
    // bank is rock and erodes more slowly.
    const rockDepth = this.grid.bedrock[ci] - bed;
    let rock = 1;
    if (rockDepth > 0) rock = 1 - Math.min(1, rockDepth / Math.max(0.5, actualBank)) * (1 - CENTRELINE.bedrockBankFactor);
    // Tall banks only matter once the river is cutting down (terraces). On a
    // river that is not, a bank can look tall just because the water profile
    // follows the river's length while the floodplain follows the valley.
    const cutting = this.incision > 0 || this.knickpoints.length > 0;
    const tall = cutting ? Engine.bankFactor(actualBank, s.bankHeight) : 1;
    // In a gorge, tall and rocky banks together never slow the river below
    // gorgeBankFloor: their faces keep failing (slumps, landslides) and the
    // river carries the debris away, so an entrenched river still winds and
    // cuts off loops.
    const bank = cutting ? Math.max(CENTRELINE.gorgeBankFloor, Math.min(1, rock * tall)) : rock;
    return wall * exit * ground * bank;
  }

  updateDischarge() {
    const s = this.settings;
    const yearIndex = Math.floor(this.year + 1e-9);
    if (yearIndex !== this.yearDischargeAt) {
      this.yearDischargeAt = yearIndex;
      this.discharge = s.meanDischarge * exp(this.rng.gaussian() * FLOODS.dischargeVariation);
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
    this.updatePattern();

    // 1. Curvature.
    const c = curvature(this.x, this.y);
    smooth(c, CENTRELINE.curvatureSmoothing);
    this.curv = c;

    // 2. Migration rate.
    const n = this.x.length;
    const q = this.flood > 0 ? s.meanDischarge * (1 + (s.floodSize - 1) * this.flood) : this.discharge;
    this.q = q;
    const qFactor = pow(q / s.meanDischarge, CENTRELINE.dischargeExponent);
    let base = s.erodibility * CENTRELINE.migrationScale * qFactor;
    if (this.braid > 0) base *= 1 - (1 - BRAID.migrationFactor) * this.braid; // the braidplain axis wanders slowly
    const k = new Float64Array(n);
    const prot = CENTRELINE.endProtection;
    const cutting = this.incision > 0 || this.knickpoints.length > 0;
    this.bankH = cutting ? new Float64Array(n) : null;
    for (let i = prot; i < n - prot; i++) k[i] = base * this.localErodibility(i);
    if (this.dams.length) { const pool = this.pooledPoints(); for (let i = 0; i < n; i++) if (pool[i]) k[i] = 0; } // a lake does not migrate
    if (this.lake) for (let i = Math.max(0, this.mouth); i < n; i++) k[i] = 0; // nor does the river's line out over the valley-end lake
    if (this.trib) { const more = Math.sqrt(1 + s.tributary); for (let i = Math.min(this.trib.j, n); i < n; i++) k[i] *= more; } // more water below the junction
    const rate = migrationRate(this.x, this.y, c, k, { omega: s.omega, gamma: s.gamma, alpha: s.alpha }, ds, W);
    // Bank heterogeneity: a little random lateral wobble seeds bends on
    // straight reaches, which the model then amplifies at its preferred wavelength.
    const noise = CENTRELINE.bankNoise * base;
    for (let i = prot; i < n - prot; i++) rate[i] += noise * this.rng.gaussian() * (k[i] / base || 0);
    this.bankCollapses(rate, k, base);
    if (this.slides.length) this.pushFromSlides(rate);
    if (this.trib) this.pushFromTributary(rate);
    this.rate = rate;
    // Valley walls the river eats into: material above an ordinary bank
    // (terrace and gorge walls) joins the load, m^3/yr per point.
    const wall = new Float64Array(n);
    if (cutting) {
      const ordinary = s.bankHeight + FLOODPLAIN.leveeMaxHeight;
      for (let i = prot; i < n - prot; i++) {
        const excess = this.bankH[i] - ordinary;
        if (excess > 0) wall[i] = Math.abs(rate[i]) * ds * excess;
      }
    }

    // 3. Move, re-space. Bends passing just upstream of the valley swing
    // the river's entry point slowly from side to side.
    migrate(this.x, this.y, rate, DT);
    const yIn = this.inletY + this.inletSwing(this.year);
    for (let i = 0; i < prot; i++) this.y[i] = yIn;
    if (CENTRELINE.smoothingPasses > 0) {
      smooth(this.x, CENTRELINE.smoothingPasses);
      smooth(this.y, CENTRELINE.smoothingPasses);
    }
    this.clampToValley();
    ({ x: this.x, y: this.y, fields: [this.aggr, this.sedWall] } = resample(this.x, this.y, ds, [this.aggr, wall]));

    // 4. Cutoffs (a braided river has no meander loops to cut off).
    const minSep = Math.round((CENTRELINE.minSeparationWidths * W) / ds);
    for (let guard = 0; guard < 3 && this.braid < 0.5; guard++) {
      const hit = findNeckCutoff(this.x, this.y, minSep, s.cutoffDistance * W, prot);
      if (!hit) break;
      this.cutoff(hit.i, hit.j, 'neck');
    }
    if (this.flood > 0 && this.braid < 0.5) {
      const c2 = curvature(this.x, this.y);
      const hit = findChuteCutoff(this.x, this.y, c2, this.rng, s.chuteChance * DT, ds, W, prot);
      if (hit) this.cutoff(hit.i, hit.j, 'chute');
    }

    // 5. Floodplain: carve the channel, age oxbows, grow land.
    this.computeLevels();
    if (this.braid > 0) this.computeThreads(); else this.threads = null;
    this.stamp();
    if (s.tributary > 0) this.tributaryStep(DT); else this.trib = null;
    this.ageOxbows();
    this.landDt += DT;
    this.tickCount++;
    if (this.tickCount % FLOODPLAIN.landEveryTicks === 0) {
      // Beds build up slowly: lifting the floodplain every few years is enough.
      if (this.tickCount % (FLOODPLAIN.landEveryTicks * SEDIMENT.floodplainEveryLand) === 0) raiseFloodplain(this.grid, this.x, this.y, this.aggr, this.refLevel, s);
      growLand(this.grid, s, this.landDt, this.flood, this.meanWash());
      if (this.incision > 0 || this.knickpoints.length) {
        this.spontaneousSlides(this.landDt); // first, so fresh debris slumps to a stable slope at once
        this.sedBluff = new Float64Array(this.x.length);
        relaxSlopes(this.grid, s, this.landDt, this.sedBluff);
      }
      if (this.dams.length) this.updateDams(this.landDt);
      if (this.lake) this.updateLake();
      if (this.trib) growFan(this.grid, this.trib, s, this.landDt);
      this.landDt = 0;
    }
    this.sedimentStep();
    // Rock planed under the river: tell the renderer now and then, not every step.
    if (this.grid.bedrockDirty && this.tickCount % BEDROCK_SEND_TICKS === 0) {
      this.grid.bedrockDirty = false;
      this.grid.bedrockVersion++;
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
    const N = this.x.length;
    this.mouth = this.findMouth();
    const n = this.active;
    const cut = (a) => (n === N ? a : a.subarray(0, n));
    const river = {
      x: cut(this.x), y: cut(this.y),
      curvature: cut(this.curv.length === N ? this.curv : new Float64Array(N)),
      rate: cut(this.rate.length === N ? this.rate : new Float64Array(N)),
      level: cut(this.level),
      dt: DT,
      cutting: this.incision > 0 || this.knickpoints.length > 0,
      wash: null,
    };
    if (this.wash && this.wash.length === N) {
      river.wash = new Float64Array(n);
      for (let i = 0; i < n; i++) river.wash[i] = this.washFactor(i);
    }
    if (this.threads) {
      const t = this.threads;
      const threads = n === N ? t : { ...t, tx: t.tx.map(cut), ty: t.ty.map(cut), offsets: t.offsets.map(cut) };
      stampBraided(this.grid, river, threads, this.settings, this.flood);
    } else stampChannel(this.grid, river, this.settings, this.year, this.flood);
  }

  // The lake at the valley's end, once a year: what the river brought
  // settles in front of its mouths, the delta front advances, and the
  // distributaries are re-traced (and now and then switch).
  updateLake() {
    const L = this.lake, g = this.grid;
    const level = this.lakeLevel;
    if (!L.mask) {
      L.mask = new Uint8Array(g.height.length);
      for (const i of L.cells) L.mask[i] = 1;
    }
    emerge(g, L.cells, level);
    this.updateDistributaries(level);
    const bulk = L.pending / (1 - SEDIMENT.porosity) + L.fines;
    L.pending = 0; L.fines = 0;
    if (bulk > 0) {
      let left = 0;
      for (const m of this.deltaMouths()) left += depositDelta(g, m.x, m.y, m.dx, m.dy, bulk * m.share, level);
      L.deposited += bulk - left;
      this.sediment.exported += left * (1 - SEDIMENT.porosity); // the lake is full there: it goes on out of the valley
      emerge(g, L.cells, level);
    }
  }

  // Where the delta takes the river's load: the main mouth, and the mouth
  // of each distributary, each with the direction the water arrives from.
  deltaMouths() {
    const n = this.x.length;
    const m = Math.min(n - 1, this.mouth);
    const dx = this.x[m] - this.x[m - 1], dy = this.y[m] - this.y[m - 1];
    const l = hypot(dx, dy) || 1;
    const live = this.lake.dists.filter((d) => d.path);
    // Bars at the mouth turn the water now one way, now the other, so the
    // delta grows as a fan rather than a finger.
    if (!this.mouthNoise) this.mouthNoise = createNoise2D(this.settings.seed * 52361 + 7);
    const swing = ((2 * this.mouthNoise(this.year / LAKE.mouthSwingYears, 0.71) - 1) * 1.6 * LAKE.mouthSwing * Math.PI) / 180;
    const c = cos(swing), sn = sin(swing);
    const ux = dx / l, uy = dy / l;
    const out = [{ x: this.x[m], y: this.y[m], dx: ux * c - uy * sn, dy: ux * sn + uy * c, share: 1 - LAKE.distShare * live.length }];
    for (const d of live) {
      const p = d.path, k = p.x.length - 1;
      const ex = p.x[k] - p.x[k - 1], ey = p.y[k] - p.y[k - 1];
      const el = hypot(ex, ey) || 1;
      out.push({ x: p.x[k], y: p.y[k], dx: ex / el, dy: ey / el, share: LAKE.distShare });
    }
    return out;
  }

  // Distributaries fan out from the delta's apex, a third of the way from the
  // old shore to the mouth, once the delta reaches distMinLength out into
  // the lake. Every avulsionYears or so they switch to new courses.
  updateDistributaries(level) {
    const L = this.lake, g = this.grid;
    const n = this.x.length;
    let a = -1;
    for (let i = 0; i < n && a < 0; i++) if (L.mask[cellIndex(g, this.x[i], this.y[i])]) a = i;
    const reach = a < 0 ? 0 : (this.mouth - a) * this.ds;
    const drop = () => {
      abandonDistributary(g, L.distCells, level);
      L.distCells = [];
      L.dists = [];
    };
    if (reach < LAKE.distMinLength) { if (L.dists.length) drop(); return; }
    if (!L.dists.length || this.year >= L.nextSwitch) {
      const had = L.dists.length > 0;
      drop();
      for (let k = 0; k < LAKE.distCount; k++) {
        const side = k % 2 ? 1 : -1;
        L.dists.push({ angle: (side * this.rng.range(LAKE.distAngle[0], LAKE.distAngle[1]) * Math.PI) / 180, path: null });
      }
      L.nextSwitch = this.year + LAKE.avulsionYears * this.rng.range(0.5, 1.5);
      if (had) this.events.push({ type: 'avulsion', x: this.x[this.mouth], y: this.y[this.mouth], year: this.year });
    }
    const ap = Math.min(n - 2, Math.max(1, a + Math.floor((this.mouth - a) / 3)));
    const dx = this.x[ap + 1] - this.x[ap - 1], dy = this.y[ap + 1] - this.y[ap - 1];
    const l = hypot(dx, dy) || 1;
    const top = this.level[ap];
    const W = this.settings.channelWidth;
    for (const d of L.dists) {
      d.path = traceDistributary(g, this.x[ap], this.y[ap], dx / l, dy / l, d.angle);
      if (!d.path) continue;
      const cells = carveDistributary(g, d.path, W * LAKE.distWidth, LAKE.distDepth, (t) => top + (level - top) * t);
      for (const c of cells) L.distCells.push(c);
    }
  }

  // Tall valley walls fail now and then: a few random ground cells are
  // checked each land update, and a tall wall under one may give way (taller
  // walls, and floods, make it likelier).
  spontaneousSlides(dt) {
    const g = this.grid;
    const n = g.height.length;
    const flood = 1 + (HILLS.slideFloodFactor - 1) * this.flood;
    for (let k = 0; k < HILLS.slideSamples; k++) {
      const site = findSlideSite(g, this.rng.int(n));
      if (!site) continue;
      const tall = site.height / HILLS.slideMinHeight;
      if (this.rng.chance(HILLS.slideChance * dt * flood * tall)) this.slide(site);
      else if (this.gullies.length < HILLS.maxGullies && this.rng.chance(HILLS.gullyChance * dt * tall)
        && !this.gullies.some((v) => hypot(v.x - site.footX, v.y - site.footY) < HILLS.gullySpacing)) {
        this.gullies.push(newGully(site, this.rng));
      }
    }
    for (const v of this.gullies) {
      const wash = growGully(g, this.settings, v, dt, this.flood);
      if (wash) this.addSediment(v.x, v.y, wash.bed, wash.fines, 'fromGullies');
    }
  }

  // The Landslide button: fail the tallest wall among a few hundred looked at.
  // Returns false when there is no wall tall enough.
  triggerLandslide() {
    const g = this.grid;
    let best = null;
    for (let k = 0; k < 400; k++) {
      const site = findSlideSite(g, this.rng.int(g.height.length));
      if (site && (!best || site.height > best.height)) best = site;
    }
    if (!best) {
      this.events.push({ type: 'noWalls', x: VALLEY.length / 2, y: VALLEY.width / 2, year: this.year });
      return false;
    }
    this.slide(best);
    return true;
  }

  slide(site) {
    const rec = landslide(this.grid, this.settings, site, this.rng);
    this.events.push({ type: 'landslide', x: rec.footX, y: rec.footY, year: this.year, volume: rec.volume });
    this.slideMarks.push({ x: rec.x, y: rec.y, year: this.year });
    if (this.slideMarks.length > HILLS.slideMarks) this.slideMarks.shift();
    // Enough debris in the river to stand well above the water: a dam.
    const cx = rec.footX + rec.dirx * rec.runout * 0.5, cy = rec.footY + rec.diry * rec.runout * 0.5;
    const above = Math.min(rec.riverDepth - this.depth, rec.height * HILLS.damHeightFraction);
    if (above >= HILLS.damMinHeight) {
      const j = this.nearestPoint(cx, cy);
      if (hypot(this.x[j] - cx, this.y[j] - cy) < rec.width && this.makeDam(j, above, Math.max(rec.width, 3 * this.settings.channelWidth))) {
        this.events.push({ type: 'landslidedam', x: this.x[j], y: this.y[j], year: this.year, height: above });
        return rec;
      }
    }
    if (rec.intoRiver > 0) {
      this.addSediment(rec.footX, rec.footY, rec.intoRiver * SEDIMENT.slideBedFraction, rec.intoRiver * (1 - SEDIMENT.slideBedFraction), 'fromSlides');
      this.slides.push({ x: rec.footX + rec.dirx * rec.runout * 0.5, y: rec.footY + rec.diry * rec.runout * 0.5, dirx: rec.dirx, diry: rec.diry, width: rec.width, age: 0 });
    }
    return rec;
  }

  nearestPoint(x, y) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.x.length; i++) {
      const dx = this.x[i] - x, dy = this.y[i] - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Centreline points standing in a landslide lake.
  pooledPoints() {
    const n = this.x.length;
    const pool = new Uint8Array(n);
    for (const d of this.dams) {
      for (let i = Math.min(n - 1, this.nearestPoint(d.x, d.y)); i >= 0 && this.level[i] === d.crest; i--) pool[i] = 1;
    }
    return pool;
  }

  // Dam the river at centreline point `i`, `above` metres over the water.
  // The water behind it rises to the crest. Returns false (and leaves the
  // river as it was) if the water could get round the debris, or the river
  // is already dammed nearby.
  makeDam(i, above, radius = 3 * this.settings.channelWidth) {
    const prot = CENTRELINE.endProtection;
    const n = this.x.length;
    if (i < prot + 5 || i > n - prot - 2) return false;
    const x = this.x[i], y = this.y[i];
    if (this.dams.some((d) => hypot(d.x - x, d.y - y) < HILLS.damSpacing)) return false;
    const dam = { id: ++this.damCount, x, y, crest: this.level[i] + above, natural: this.level[i], age: 0, radius, cells: new Int32Array(0) };
    this.dams.push(dam);
    this.computeLevels();
    this.stamp();
    if (!this.fillDam(dam)) {
      this.dams.pop();
      this.computeLevels();
      this.stamp();
      return false;
    }
    return true;
  }

  // Re-flood a dam's lake; false if the water now gets round it.
  fillDam(d) {
    const j = this.nearestPoint(d.x, d.y);
    const k = Math.max(0, j - 3);
    const cells = fillPond(this.grid, cellIndex(this.grid, this.x[k], this.y[k]), d.crest, d.x, d.y, d.radius);
    if (!cells) return false;
    d.cells = cells;
    return true;
  }

  // Dams wear down as the water pours over them, faster in floods, and
  // sometimes burst. Their lakes drown the plants and slowly silt up; when
  // a lake goes, its floor is left as wet ground.
  updateDams(dt) {
    const g = this.grid;
    for (let k = this.dams.length - 1; k >= 0; k--) {
      const d = this.dams[k];
      d.age += dt;
      d.crest -= HILLS.damErosion * dt * (1 + HILLS.damFloodErosion * this.flood);
      const above = d.crest - d.natural;
      let gone = above <= 0.1;
      if (!gone && this.rng.chance(HILLS.damFailChance * dt * (above / HILLS.damMinHeight))) {
        gone = true;
        this.floodPending = true;
        this.events.push({ type: 'outburst', x: d.x, y: d.y, year: this.year });
      }
      if (!gone && !this.fillDam(d)) gone = true;
      if (gone) {
        for (const i of d.cells) if (!g.channel[i]) { g.surface[i] = SURFACE.WETLAND; g.veg[i] = Math.min(g.veg[i], 0.2); }
        this.dams.splice(k, 1);
        continue;
      }
      const silt = HILLS.lakeInfill * dt;
      for (const i of d.cells) {
        if (g.channel[i]) continue;
        g.veg[i] *= Math.max(0, 1 - 0.2 * dt);
        g.surface[i] = SURFACE.WETLAND;
        if (g.height[i] < d.crest - 0.3) g.height[i] = Math.min(d.crest - 0.3, g.height[i] + silt);
      }
    }
    this.computeLevels();
  }

  // Debris in the river pushes the channel away from the slide, fading as
  // the river carries it off.
  pushFromSlides(rate) {
    const n = this.x.length;
    const prot = CENTRELINE.endProtection;
    for (let k = this.slides.length - 1; k >= 0; k--) {
      const sl = this.slides[k];
      const fade = 1 - sl.age / HILLS.slidePushYears;
      sl.age += DT;
      if (fade <= 0) { this.slides.splice(k, 1); continue; }
      const r = sl.width;
      for (let i = Math.max(1, prot); i < n - Math.max(1, prot); i++) {
        const dx = this.x[i] - sl.x, dy = this.y[i] - sl.y;
        if (dx > r || dx < -r || dy > r || dy < -r) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r) continue;
        const tx = this.x[i + 1] - this.x[i - 1], ty = this.y[i + 1] - this.y[i - 1];
        const l = hypot(tx, ty) || 1;
        const along = (ty / l) * sl.dirx - (tx / l) * sl.diry; // right-hand normal . push direction
        rate[i] += HILLS.slidePush * fade * (1 - d / r) * along;
      }
    }
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
    const cut = (a) => {
      const b = new Float64Array(out.x.length);
      if (!a || a.length !== this.x.length) return b;
      b.set(a.subarray(0, i + 1));
      b.set(a.subarray(j), i + 1);
      return b;
    };
    const aggr = cut(this.aggr), wall = cut(this.sedWall);
    this.x = out.x; this.y = out.y;
    ({ x: this.x, y: this.y, fields: [this.aggr, this.sedWall] } = resample(this.x, this.y, this.ds, [aggr, wall]));
    this.addOxbow(out.loop, level, s.channelWidth, this.depth);
    this.events.push({ type, x: this.x[i], y: this.y[i], year: this.year });
  }

  // An abandoned loop becomes an oxbow lake.
  addOxbow(loop, level, width, depth) {
    let cx = 0, cy = 0;
    for (let p = 0; p < loop.x.length; p++) { cx += loop.x[p]; cy += loop.y[p]; }
    cx /= loop.x.length; cy /= loop.x.length;
    const oxbow = {
      id: ++this.oxbowCount,
      x: Float32Array.from(loop.x), y: Float32Array.from(loop.y),
      age: 0, depth, width, year: this.year, cx, cy, level,
      cells: cellsNear(this.grid, loop.x, loop.y, width / 2),
      lastStampDepth: depth,
    };
    this.oxbows.push(oxbow);
    // Carve the lake bed now, before the channel stamp turns the loop into point bar.
    stampOxbow(this.grid, oxbow, this.settings, true);
  }

  // The tributary for one step (dt 0: just lay it out and carve it): it
  // migrates, finds the main river, cuts off its own tight loops, and is
  // carved into the ground after the main river.
  tributaryStep(dt) {
    const s = this.settings;
    if (!this.trib) {
      this.trib = newTributary(s, this.x, this.y);
      if (dt > 0) this.events.push({ type: 'tributary', x: this.trib.entryX, y: this.trib.entryY, year: this.year });
    }
    if (!this.tribNoise) this.tribNoise = createNoise2D(s.seed * 7368787 + 41);
    const t = this.trib;
    if (dt > 0) {
      t.age += dt;
      migrateTributary(t, s, this.grid, pow(Math.max(0, this.q) / s.meanDischarge, CENTRELINE.dischargeExponent), dt, this.tribNoise);
    }
    joinMain(t, s, this.grid, this.x, this.y);
    tributaryLevels(t, s, this.level, this.depth);
    const w = tribWidth(s);
    const minSep = Math.round(CENTRELINE.minSeparationWidths / CENTRELINE.spacingFactor);
    const hit = dt > 0 ? findNeckCutoff(t.x, t.y, minSep, s.cutoffDistance * w, 3) : null;
    if (hit) {
      const out = spliceCutoff(t.x, t.y, hit.i, hit.j);
      this.addOxbow(out.loop, t.level[hit.i], w, tribDepth(this.depth));
      ({ x: t.x, y: t.y } = resample(out.x, out.y, w * CENTRELINE.spacingFactor));
      this.events.push({ type: 'tribcutoff', x: t.x[hit.i], y: t.y[hit.i], year: this.year });
      tributaryLevels(t, s, this.level, this.depth);
    }
    carveTributary(this.grid, t, s, this.depth, this.incision > 0 || this.knickpoints.length > 0);
  }

  // The tributary's fan pushes the main river away from the junction, the
  // way the tributary's water arrives.
  pushFromTributary(rate) {
    const t = this.trib, s = this.settings;
    const n = this.x.length, m = t.x.length;
    if (m < 4) return;
    const jx = t.x[m - 1], jy = t.y[m - 1];
    let dx = jx - t.x[m - 4], dy = jy - t.y[m - 4];
    const dl = hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const r = TRIB.pushWidths * s.channelWidth;
    const prot = Math.max(1, CENTRELINE.endProtection);
    const push = TRIB.push * s.tributary;
    for (let i = prot; i < n - prot; i++) {
      const ox = this.x[i] - jx, oy = this.y[i] - jy;
      if (ox > r || ox < -r || oy > r || oy < -r) continue;
      const d = Math.sqrt(ox * ox + oy * oy);
      if (d >= r) continue;
      const tx = this.x[i + 1] - this.x[i - 1], ty = this.y[i + 1] - this.y[i - 1];
      const l = hypot(tx, ty) || 1;
      rate[i] += push * (1 - d / r) * ((ty / l) * dx - (tx / l) * dy);
    }
  }

  ageOxbows() {
    const s = this.settings;
    const rate = (this.depth / FLOODPLAIN.oxbowInfillYears) * s.infillRate * DT;
    const cutting = this.incision > 0 || this.knickpoints.length > 0;
    for (let k = this.oxbows.length - 1; k >= 0; k--) {
      const o = this.oxbows[k];
      o.age += DT;
      // A loop cut off from a river that is cutting down is left hanging:
      // once the river is well below it, its water seeps away.
      if (cutting && !o.draining && this.tickCount % 8 === 0 && this.level[this.nearestPoint(o.x[0], o.y[0])] < o.level - HILLS.drainDrop) {
        o.draining = true;
        o.drainRate = o.depth / HILLS.drainYears;
      }
      o.depth -= o.draining ? Math.max(rate, (o.drainRate || 0) * DT) : rate;
      if (o.depth <= 0) {
        retireOxbow(this.grid, o);
        if (o.draining) {
          this.hangingLoops.push({ ...this.loopLabelPoint(o), year: this.year });
          if (this.hangingLoops.length > HILLS.hangingKeep) this.hangingLoops.shift();
        }
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

  // The point of an abandoned loop furthest from its chord.
  loopLabelPoint(o) {
    const ax = o.x[0], ay = o.y[0], bx = o.x[o.x.length - 1], by = o.y[o.y.length - 1];
    let best = 0, bestD = -1;
    for (let p = 0; p < o.x.length; p++) {
      const d = Math.abs((bx - ax) * (ay - o.y[p]) - (ax - o.x[p]) * (by - ay));
      if (d > bestD) { bestD = d; best = p; }
    }
    return { x: o.x[best], y: o.y[best] };
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
      const l = hypot(dx, dy) || 1;
      return [dy / l, -dx / l]; // right-hand normal
    };
    const cellAt = (x, y) => {
      const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell)));
      const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell)));
      return cy * g.cols + cx;
    };
    const minCurv = 0.35 / W;
    const prot = CENTRELINE.endProtection;
    const braided = this.braid >= 0.5 && this.threads;
    if (braided) this.braidFeatures(out, prot);
    if (this.lake) this.lakeFeatures(out);
    if (this.trib) this.tributaryFeatures(out);
    let lastApex = -100, apexCount = 0, lastInflection = -100;
    for (let i = prot + 1; i < (braided ? 0 : Math.min(n, this.active + prot) - prot - 1); i++) {
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
    const neck = braided ? null : findNeckCutoff(this.x, this.y, minSep, 2.5 * W, prot);
    if (neck) out.push({ type: 'neck', x: (this.x[neck.i] + this.x[neck.j]) / 2, y: (this.y[neck.i] + this.y[neck.j]) / 2 });
    // Oxbows: label at the point of the loop furthest from its chord.
    for (const o of this.oxbows) {
      const p = this.loopLabelPoint(o);
      out.push({ type: o.draining ? 'hangingloop' : o.depth > FLOODPLAIN.oxbowMarshDepth ? 'oxbow' : 'marsh', x: p.x, y: p.y, level: o.level });
    }
    for (const h of this.hangingLoops) out.push({ type: 'hangingloop', x: h.x, y: h.y });
    // Levees: banks that stand above the floodplain after floods.
    let levees = 0, lastLevee = -100;
    for (let i = prot; i < (braided ? 0 : n - prot) && levees < 3; i += 6) {
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
    // Knickpoints: the step in the bed, at its place along the river.
    if (this.knickpoints.length) {
      const arc = arcLength(this.x, this.y);
      const total = arc[n - 1];
      for (const k of this.knickpoints) {
        const target = total - k.pos;
        if (target < 0) continue;
        let i = 0;
        while (i < n - 1 && arc[i] < target) i++;
        out.push({ type: 'knickpoint', x: this.x[i], y: this.y[i], level: this.level[i] });
      }
    }
    this.wallFeatures(out);
    this.sedimentFeatures(out);
    if (this.flood > 0) out.push({ type: 'flood', x: this.x[Math.floor(n / 2)], y: this.y[Math.floor(n / 2)], level: this.level[Math.floor(n / 2)] + 1 });
    return out;
  }

  // Explain-mode features of the tributary: its course, the junction, its fan.
  tributaryFeatures(out) {
    const t = this.trib;
    const m = t.x.length;
    if (m < 6 || !t.level) return;
    const mid = Math.floor(m * 0.45);
    out.push({ type: 'tributary', x: t.x[mid], y: t.y[mid], level: t.level[mid] });
    const j = Math.min(this.x.length - 1, t.j);
    out.push({ type: 'confluence', x: this.x[j], y: this.y[j], level: this.level[j] });
    const R = TRIB.fanWidths * this.settings.channelWidth;
    out.push({ type: 'tributaryfan', x: t.entryX + R * 0.3, y: t.entryY - t.side * R * 0.35 });
  }

  // Explain-mode features of the valley-end lake: the delta at the river's
  // mouth, a distributary, and open water.
  lakeFeatures(out) {
    const L = this.lake, g = this.grid;
    const level = this.lakeLevel;
    const m = Math.min(this.x.length - 1, this.mouth);
    if (L.deposited > 0) {
      const b = Math.max(0, m - 3);
      out.push({ type: 'delta', x: this.x[b], y: this.y[b], level: this.level[b] });
    }
    const d = L.dists.find((v) => v.path);
    if (d) {
      const k = Math.floor(d.path.x.length * 0.6);
      out.push({ type: 'distributary', x: d.path.x[k], y: d.path.y[k], level: level + 0.2 });
    }
    // Open water: the lake cell furthest from the mouth along the valley.
    let best = -1;
    for (let k = 0; k < L.cells.length; k += 7) {
      const i = L.cells[k];
      if (g.channel[i] !== OPEN_LAKE) continue;
      if (best < 0 || (i % g.cols) > (best % g.cols) - 4) best = i;
    }
    if (best >= 0) {
      const cx = best % g.cols, cy = (best - cx) / g.cols;
      out.push({ type: 'deltalake', x: (cx + 0.5) * g.cell - 150, y: (cy + 0.5) * g.cell, level });
    }
  }

  // Explain-mode features of the sediment budget: where the bed has built up
  // most, where it has been scoured most, and deltas at the heads of lakes.
  sedimentFeatures(out) {
    const n = this.x.length;
    if (this.aggr.length !== n) return;
    const pool = this.dams.length ? this.pooledPoints() : null;
    let hi = -1, lo = -1;
    for (let i = CENTRELINE.endProtection; i < n - CENTRELINE.endProtection; i++) {
      if (pool && pool[i]) continue;
      if (hi < 0 || this.aggr[i] > this.aggr[hi]) hi = i;
      if (lo < 0 || this.aggr[i] < this.aggr[lo]) lo = i;
    }
    if (hi >= 0 && this.aggr[hi] > 0.5) out.push({ type: 'aggrading', x: this.x[hi], y: this.y[hi], level: this.level[hi] });
    if (lo >= 0 && this.aggr[lo] < -0.5) out.push({ type: 'scoured', x: this.x[lo], y: this.y[lo], level: this.level[lo] });
    if (pool) {
      for (let i = 0; i < n - 1; i++) {
        if (pool[i] && this.aggr[i] > 0.3 && (i === 0 || !pool[i - 1] || this.aggr[i - 1] > 0.3)) {
          let j = i;
          while (j < n - 1 && pool[j + 1] && this.aggr[j + 1] > 0.3) j++;
          out.push({ type: 'lakedelta', x: this.x[j], y: this.y[j], level: this.level[j] });
          i = j;
        }
      }
    }
  }

  // Explain-mode features of the valley walls: recent landslides, dams and
  // their lakes, gullies and their fans, and (from a sparse scan of the
  // grid) scree and rock ledges.
  wallFeatures(out) {
    const g = this.grid;
    for (const m of this.slideMarks) if (this.year - m.year < HILLS.slideLabelYears) out.push({ type: 'landslide', x: m.x, y: m.y });
    for (const d of this.dams) {
      out.push({ type: 'landslidedam', x: d.x, y: d.y, level: d.crest });
      if (d.cells.length > 20) {
        const i = d.cells[Math.floor(d.cells.length / 2)];
        const cx = i % g.cols, cy = (i - cx) / g.cols;
        out.push({ type: 'landslidelake', x: (cx + 0.5) * g.cell, y: (cy + 0.5) * g.cell, level: d.crest });
      }
    }
    for (const v of this.gullies) {
      if (v.length < 80) continue;
      const k = Math.min(v.px.length - 1, Math.floor(v.length / 80)); // about halfway up (points are 40 m apart)
      out.push({ type: 'gully', x: v.px[k], y: v.py[k] });
      out.push({ type: 'fan', x: v.x - v.dirx * 60, y: v.y - v.diry * 60 });
    }
    if (!(this.incision > 0 || this.knickpoints.length)) return;
    const { cols, rows, cell, height, surface, veg, bedrock, channel } = g;
    const hard = cell * HILLS.hardRockSlope * 0.6;
    let scree = 0, ledges = 0;
    const picked = [];
    const apart = (x, y) => picked.every((p) => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) > 600 * 600);
    for (let cy = 2; cy < rows - 2 && (scree < 2 || ledges < 2); cy += 3) {
      for (let cx = 2 + (cy % 2); cx < cols - 2; cx += 5) {
        const i = cy * cols + cx;
        if (channel[i]) continue;
        const x = (cx + 0.5) * cell, y = (cy + 0.5) * cell;
        if (scree < 2 && surface[i] === SURFACE.SCREE && veg[i] < 0.5 && apart(x, y)) {
          out.push({ type: 'scree', x, y }); picked.push({ x, y }); scree++;
        } else if (ledges < 2 && height[i] < bedrock[i] - 2 && height[i] - Math.min(height[i + 1], height[i - 1], height[i + cols], height[i - cols]) > hard && apart(x, y)) {
          out.push({ type: 'rockledge', x, y }); picked.push({ x, y }); ledges++;
        }
      }
    }
  }

  // Explain-mode features of a braided reach: the widest bars between
  // neighbouring threads, and a few of the threads themselves.
  braidFeatures(out, prot) {
    const { offsets, width } = this.threads;
    const n = this.x.length;
    const N = offsets.length;
    let bars = 0, chans = 0, step = 0;
    for (let i = prot + 10; i < n - prot - 10 && bars < 4; i += 30, step++) {
      const o = offsets.map((a) => a[i]).sort((a, b) => a - b);
      let gap = 0, mid = 0;
      for (let k = 1; k < N; k++) if (o[k] - o[k - 1] > gap) { gap = o[k] - o[k - 1]; mid = (o[k] + o[k - 1]) / 2; }
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const tx = this.x[i1] - this.x[i0], ty = this.y[i1] - this.y[i0];
      const l = hypot(tx, ty) || 1;
      const nx = ty / l, ny = -tx / l;
      if (gap > width * 2.5) {
        out.push({ type: 'braidbar', x: this.x[i] + nx * mid, y: this.y[i] + ny * mid });
        bars++;
      }
      if (chans < 3 && step % 2 === 1) {
        const ok = offsets[step % N][i];
        out.push({ type: 'braidchannel', x: this.x[i] + nx * ok, y: this.y[i] + ny * ok, level: this.level[i] });
        chans++;
      }
    }
  }

  // Thread polylines for the renderer, each with its width per point.
  braidSnapshot() {
    const { tx, ty, width, widths, half } = this.threads;
    const n = this.x.length;
    const threads = tx.map((xs, k) => ({ x: Float32Array.from(xs), y: Float32Array.from(ty[k]), width: new Float32Array(n).fill(widths[k]) }));
    return { amount: this.braid, half, threadWidth: width, threads };
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
      braid: this.threads ? this.braidSnapshot() : null,
      sediment: {
        ...this.sediment,
        bed: Float32Array.from(this.aggr),
        load: this.loadRatio && this.loadRatio.length === n ? Float32Array.from(this.loadRatio) : null,
        wash: this.wash && this.wash.length === n ? Float32Array.from(this.wash, (_, i) => this.washFactor(i)) : null,
      },
      ponds: this.dams.map((d) => ({ id: d.id, level: d.crest, cells: d.cells })),
      lake: this.lake ? { level: this.lakeLevel, version: this.lake.version, cells: this.lake.version !== this.sentLakeVersion ? this.lake.cells : null } : null,
      channels: [...(this.trib && this.trib.level && this.trib.level.length === this.trib.x.length ? [{
        kind: 'tributary', x: Float32Array.from(this.trib.x), y: Float32Array.from(this.trib.y),
        level: Float32Array.from(this.trib.level), width: tribWidth(this.settings),
      }] : []), ...(this.lake ? this.lake.dists.filter((d) => d.path).map((d) => {
        const m = d.path.x.length;
        const top = this.level[Math.min(this.x.length - 1, Math.max(0, this.mouth - Math.floor(m / 3)))];
        return { kind: 'distributary', x: Float32Array.from(d.path.x), y: Float32Array.from(d.path.y), width: this.settings.channelWidth * LAKE.distWidth,
          level: Float32Array.from({ length: m }, (_, k) => top + (this.lakeLevel - top) * (k / (m - 1)) + 0.02) };
      }) : [])],
      grid: {
        cols: g.cols, rows: g.rows, cell: g.cell,
        height: Float32Array.from(g.height),
        surface: Uint8Array.from(g.surface),
        veg: veg8,
        // The bedrock surface only when it has moved since the last snapshot.
        bedrock: g.bedrockVersion !== this.sentBedrockVersion ? Float32Array.from(g.bedrock) : null,
      },
      settings: {
        channelWidth: W, channelDepth: this.depth, bankHeight: s.bankHeight, valleySlope: s.valleySlope, incision: this.incision,
        cutting: this.incision > 0 || this.knickpoints.length > 0, // terraces, scarps and maybe bedrock to draw
      },
    };
    this.sentBedrockVersion = g.bedrockVersion;
    if (this.lake) {
      this.sentLakeVersion = this.lake.version;
      snap.sediment.lake = true;
      snap.sediment.deltaVolume = this.lake.deposited;
      // Only the river down to its mouth: the rest of the line lies under the lake.
      const a = this.active;
      if (a < n) {
        const c = snap.centreline;
        for (const k of ['x', 'y', 'curvature', 'rate', 'level', 'depth', 'thalweg']) c[k] = c[k].slice(0, a);
        for (const k of ['bed', 'load', 'wash']) if (snap.sediment[k]) snap.sediment[k] = snap.sediment[k].slice(0, a);
        if (snap.braid) for (const t of snap.braid.threads) { t.x = t.x.slice(0, a); t.y = t.y.slice(0, a); t.width = t.width.slice(0, a); }
      }
    }
    this.events = [];
    return snap;
  }
}
