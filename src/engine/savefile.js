// The .meander file: a whole engine state in one binary blob.
//
//   "MEANDER1" | uint32 header length | header JSON | padding | array data
//
// The header is the state with every typed array replaced by
// { $ta: type, o: byte offset, n: length } into the data block. Infinity and
// -Infinity (JSON cannot hold them) are written as { $num: 'inf' | '-inf' }.
// Compression (gzip) is left to the caller, since it is async in browsers.
import { QUALITY, VALLEY, HILLS, LAKE, WOOD, BEAVER, WORKS, CENTRELINE, SEDIMENT, defaults } from '../config.js';
import { tribWidth } from './tributary.js';
import { sanitizeSettings } from '../settings.js';
import { restoreStats } from './stats.js';

export const SAVE_VERSION = 1;
const MAGIC = 'MEANDER1';
const TYPES = { Float64Array, Float32Array, Int32Array, Uint32Array, Uint8Array };

export function encodeSave(state) {
  const arrays = [];
  let offset = 0;
  const header = JSON.stringify(state, function replacer(key, value) {
    if (ArrayBuffer.isView(value)) {
      const type = value.constructor.name;
      if (!TYPES[type]) throw new Error(`cannot save ${type}`);
      offset = Math.ceil(offset / 8) * 8;
      const ref = { $ta: type, o: offset, n: value.length };
      arrays.push({ value, offset });
      offset += value.byteLength;
      return ref;
    }
    if (value === Infinity) return { $num: 'inf' };
    if (value === -Infinity) return { $num: '-inf' };
    return value;
  });
  const head = new TextEncoder().encode(header);
  const start = Math.ceil((8 + 4 + head.length) / 8) * 8;
  const out = new Uint8Array(start + offset);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(8, head.length, true);
  out.set(head, 12);
  for (const { value, offset: o } of arrays) out.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), start + o);
  return out;
}

export function decodeSave(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) throw new Error('not a Meander save');
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) throw new Error('not a Meander save');
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true);
  if (12 + len > bytes.length) throw new Error('save is truncated');
  const start = Math.ceil((12 + len) / 8) * 8;
  const data = bytes.slice(start); // own, aligned buffer
  let copied = 0; // a header may not reference more bytes than the file holds
  let header;
  try { header = new TextDecoder().decode(bytes.subarray(12, 12 + len)); } catch { throw new Error('save header unreadable'); }
  const state = JSON.parse(header, (key, value) => {
    if (value && typeof value === 'object' && typeof value.$ta === 'string') {
      const T = TYPES[value.$ta];
      const { o, n } = value;
      if (!T || !Number.isInteger(o) || !Number.isInteger(n) || o < 0 || n < 0 || o % 8 !== 0 || o + n * T.BYTES_PER_ELEMENT > data.length) {
        throw new Error('save array out of range');
      }
      copied += n * T.BYTES_PER_ELEMENT;
      if (copied > data.length + 64) throw new Error('save arrays overlap');
      return new T(data.buffer, o, n).slice();
    }
    if (value && typeof value === 'object' && value.$num) return value.$num === 'inf' ? Infinity : -Infinity;
    return value;
  });
  validateState(state);
  return state;
}

// Throws unless the state can be handed to Engine.fromState safely. Settings
// are clamped in place.
export function validateState(state) {
  const fail = (what) => { throw new Error(`save is damaged: ${what}`); };
  const num = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi; // false for NaN and text
  const finite = (a) => ArrayBuffer.isView(a) && a.every(Number.isFinite);
  if (!state || typeof state !== 'object') fail('no state');
  if (state.version !== SAVE_VERSION) throw new Error(`save is from a different version (${state.version})`);
  state.settings = sanitizeSettings(state.settings, defaults);
  const s = state.settings;
  const q = QUALITY[s.quality];
  const g = state.grid;
  if (!g || g.cols !== q.cols || g.rows !== q.rows) fail('grid size');
  if (g.cell !== VALLEY.length / g.cols) fail('grid cell size');
  if (!num(g.slope, 0, 1) || !num(g.bankHeight, 0, 100) || !num(g.alluvium, 0, 1000)) fail('grid reference levels');
  const n = g.cols * g.rows;
  for (const k of ['height', 'base', 'relief', 'surface', 'patch', 'rock', 'veg', 'channel', 'lakeLost', 'chanLevel', 'bedrock']) {
    if (!ArrayBuffer.isView(g[k]) || g[k].length !== n) fail(`grid ${k}`);
  }
  for (const k of ['height', 'base', 'relief', 'patch', 'veg', 'chanLevel', 'bedrock']) if (!finite(g[k])) fail(`grid ${k} values`);
  if (!(g.chanList instanceof Int32Array) || g.chanList.length > n || g.chanList.some((i) => i < 0 || i >= n)) fail('grid channel list');
  if (g.chanSeg !== undefined && (!(g.chanSeg instanceof Int32Array) || g.chanSeg.length !== n || g.chanSeg.some((i) => i < 0 || i > 50000))) fail('grid channel segments');

  // The river: inside the valley, a sane number of points, per-point arrays to match.
  const inside = (xs, ys) => xs.every((v) => num(v, -1, VALLEY.length + 1)) && ys.every((v) => num(v, -1, VALLEY.width + 1));
  const n0 = state.x?.length;
  if (!finite(state.x) || !finite(state.y) || state.y.length !== n0 || n0 < 16 || n0 > 50000) fail('centreline');
  if (!inside(state.x, state.y)) fail('centreline outside the valley');
  // Points about as far apart as the engine spaces them, and a river no
  // longer than a very winding one: a stretched course would take the engine
  // hours to re-space.
  const spaced = (xs, ys, maxSeg, maxLength) => {
    let len = 0;
    for (let k = 1; k < xs.length; k++) {
      const dx = xs[k] - xs[k - 1], dy = ys[k] - ys[k - 1];
      const d2 = dx * dx + dy * dy;
      if (d2 > maxSeg * maxSeg) return false;
      len += Math.sqrt(d2);
    }
    return len <= maxLength;
  };
  if (!spaced(state.x, state.y, 3 * s.channelWidth * CENTRELINE.spacingFactor + 1, 12 * (VALLEY.length + VALLEY.width))) fail('centreline spacing');
  if (state.inletY !== undefined && !num(state.inletY, 0, VALLEY.width)) fail('inlet');
  // rate and curvature are from before the last re-spacing, so their length may
  // differ (the engine checks before using them); the water level must match.
  for (const k of ['rate', 'curv']) if (!finite(state[k]) || state[k].length > 50000) fail(k);
  if (!finite(state.level) || state.level.length !== n0) fail('level');

  if (!Array.isArray(state.oxbows) || state.oxbows.length > 5000 || !Array.isArray(state.history) || state.history.length > 1000) fail('lists');
  for (const o of state.oxbows) {
    if (!finite(o.x) || !finite(o.y) || o.x.length !== o.y.length || o.x.length > 50000 || !inside(o.x, o.y)) fail('oxbow');
    if (!(o.cells instanceof Int32Array) || o.cells.some((i) => i < 0 || i >= n)) fail('oxbow cells');
    for (const k of ['id', 'age', 'depth', 'width', 'year', 'cx', 'cy', 'level', 'lastStampDepth']) if (!num(o[k], -1e6, 1e9)) fail(`oxbow ${k}`);
    if (o.draining !== undefined && typeof o.draining !== 'boolean') fail('oxbow draining');
    if ((o.draining || o.drainRate !== undefined) && !num(o.drainRate, 0, 1e6)) fail('oxbow drain rate');
  }
  for (const h of state.history) {
    if (!num(h.year, -1, 1e9) || !finite(h.x) || !finite(h.y) || h.x.length !== h.y.length || h.x.length > 50000) fail('history');
  }

  // Scalars, each within what the engine can produce.
  if (!num(state.year, 0, 1e9) || !Number.isInteger(state.tickCount) || state.tickCount < 0) fail('year');
  if (!num(state.discharge, 0, s.meanDischarge * 100)) fail('discharge');
  if (!num(state.incision, 0, 1e5)) fail('incision');
  if (!num(state.landDt, 0, 100)) fail('land step');
  if (!num(state.flood, 0, 1) || !num(state.floodRemaining, -1, 100) || typeof state.floodPending !== 'boolean') fail('flood');
  if (!num(state.yearDischargeAt, -1, 1e9) || !Number.isInteger(state.yearDischargeAt)) fail('discharge year');
  if (!num(state.oxbowCount, 0, 1e9) || !num(state.lastHistoryYear, -Infinity, 1e9)) fail('counters');
  if (!state.rng || !Number.isInteger(state.rng.state) || state.rng.state < 0 || state.rng.state > 0xffffffff) fail('random state');
  if (!(state.rng.spare === null || state.rng.spare === undefined || Number.isFinite(state.rng.spare))) fail('random state');
  if (state.braid !== undefined && !num(state.braid, 0, 1)) fail('braid');
  if (state.braidTime !== undefined && !num(state.braidTime, 0, 1e9)) fail('braid time');
  if (state.climatePhase !== undefined && !['', 'wet', 'dry'].includes(state.climatePhase)) fail('climate');
  if (state.stats !== undefined && !restoreStats(state.stats)) fail('history');
  if (!Array.isArray(state.knickpoints) || state.knickpoints.length > 1000
    || state.knickpoints.some((k) => !num(k.pos, 0, 1e7) || !num(k.drop, 0, 1000))) fail('knickpoints');

  // Sediment (absent from saves made before the sediment budget).
  // The bed never scours deeper than maxScour, and builds up at most to the top of a lake.
  if (state.aggr !== undefined && (!finite(state.aggr) || state.aggr.length !== n0 || state.aggr.some((v) => v < -SEDIMENT.maxScour - 0.01 || v > 60))) fail('bed change');
  if (state.grain !== undefined && state.grain !== null
    && (!finite(state.grain) || state.grain.length !== n0 || state.grain.some((v) => v < 0 || v > 1))) fail('bed grain');
  if (state.wash !== undefined && state.wash !== null
    && (!finite(state.wash) || state.wash.length !== n0 || state.wash.some((v) => v < 0 || v > 1e12))) fail('muddy water');
  if (state.sediment !== undefined) {
    const sd = state.sediment;
    if (!sd || typeof sd !== 'object') fail('sediment');
    for (const k of ['out', 'exported', 'trapped', 'stored', 'inflow', 'fromWalls', 'fromSlides', 'fromGullies', 'delta', 'fromTributary']) {
      if (sd[k] !== undefined && !num(sd[k], -1e15, 1e15)) fail(`sediment ${k}`);
    }
  }
  if (state.q !== undefined && !num(state.q, 0, s.meanDischarge * 100)) fail('flow');
  if (state.loadExcess !== undefined && !num(state.loadExcess, 1, SEDIMENT.maxLoadExcess)) fail('load excess');
  // Optional lists: absent in older saves, never longer than the engine makes them.
  const list = (k, max) => {
    if (state[k] === undefined) return [];
    if (!Array.isArray(state[k]) || state[k].length > max) fail(k);
    return state[k];
  };
  const tallies = [null, 'fromSlides', 'fromGullies'];
  for (const p of list('sedPending', 1000)) {
    if (!num(p?.x, -1, VALLEY.length + 1) || !num(p?.y, -1, VALLEY.width + 1) || !num(p.bed, 0, 1e12) || !num(p.fines, 0, 1e12)) fail('pending sediment');
    if (!tallies.includes(p.from ?? null)) fail('pending sediment');
  }

  // The lake at the valley's end (absent from older saves, null without one).
  if (state.lake !== undefined && state.lake !== null) {
    const L = state.lake;
    if (s.valleyEnd !== 'lake') fail('lake');
    if (!(L.cells instanceof Int32Array) || L.cells.length > n || L.cells.some((i) => i < 0 || i >= n)) fail('lake cells');
    if (!(L.distCells instanceof Int32Array) || L.distCells.length > n || L.distCells.some((i) => i < 0 || i >= n)) fail('distributary cells');
    if (!num(L.pending, 0, 1e12) || !num(L.fines, 0, 1e12) || !num(L.deposited, 0, 1e15) || !num(L.nextSwitch, -1, 1e9)) fail('lake');
    if (L.across !== undefined && typeof L.across !== 'boolean') fail('lake');
    if (!Array.isArray(L.dists) || L.dists.length > LAKE.distCount || L.dists.some((d) => !num(d?.angle, -Math.PI, Math.PI))) fail('distributaries');
  } else if (s.valleyEnd === 'lake') fail('lake');

  // The tributary (absent from older saves, null without one).
  if (state.trib !== undefined && state.trib !== null) {
    const t = state.trib;
    if (!finite(t.x) || !finite(t.y) || t.x.length !== t.y.length || t.x.length < 2 || t.x.length > 20000 || !inside(t.x, t.y)) fail('tributary course');
    if (!spaced(t.x, t.y, 3 * tribWidth(s) * CENTRELINE.spacingFactor + 1, 6 * (VALLEY.length + VALLEY.width))) fail('tributary spacing');
    if (!num(t.entryX, 0, VALLEY.length) || !num(t.entryX0, 0, VALLEY.length) || !num(t.entryY, 0, VALLEY.width) || (t.side !== 1 && t.side !== -1)) fail('tributary entry');
    if (!Number.isInteger(t.j) || t.j < 0 || t.j >= n0 || !num(t.age, 0, 1e9)) fail('tributary junction');
    if (t.dams !== undefined) {
      if (!Array.isArray(t.dams) || t.dams.length > BEAVER.maxDams) fail('tributary beaver dams');
      for (const d of t.dams) {
        if (!num(d?.id, 0, 1e9) || !num(d.age, 0, 1e9) || !num(d.life, 0, 1e9) || !num(d.a, 0, 1e6) || !num(d.h, 0, 10)) fail('tributary beaver dam');
        if (!(d.cells instanceof Int32Array) || d.cells.length > n || d.cells.some((i) => i < 0 || i >= n)) fail('beaver pond');
      }
    }
    if (t.damCount !== undefined && (!Number.isInteger(t.damCount) || t.damCount < 0)) fail('tributary dam count');
    if (t.dams && new Set(t.dams.map((d) => d.id)).size !== t.dams.length) fail('tributary beaver dam ids');
  }

  // Valley walls (absent from saves made before landslides and gullies).
  const nums = (v, keys, lo, hi) => keys.every((k) => num(v?.[k], lo, hi));
  const at = (v) => num(v?.x, -1, VALLEY.length + 1) && num(v?.y, -1, VALLEY.width + 1);
  for (const v of list('slides', 1000)) if (!at(v) || !nums(v, ['dirx', 'diry'], -1.01, 1.01) || !nums(v, ['width', 'age'], 0, 1e5)) fail('landslide');
  for (const v of list('slideMarks', 100)) if (!at(v) || !num(v.year, 0, 1e9)) fail('landslide scar');
  for (const v of list('hangingLoops', 100)) if (!at(v) || !num(v.year, 0, 1e9)) fail('hanging loop');
  for (const d of list('dams', 100)) {
    if (!at(d) || !nums(d, ['crest', 'natural'], -1e5, 1e5) || !nums(d, ['id', 'age', 'radius'], 0, 1e9)) fail('dam');
    if (d.kind !== undefined && !['slide', 'beaver', 'weir'].includes(d.kind)) fail('dam kind');
    if (d.life !== undefined && !num(d.life, 0, 1e9)) fail('dam life');
    if (!(d.cells instanceof Int32Array) || d.cells.length > n || d.cells.some((i) => i < 0 || i >= n)) fail('dam lake');
  }
  if (state.damCount !== undefined && (!Number.isInteger(state.damCount) || state.damCount < 0)) fail('dam count');
  const damIds = list('dams', 100).map((d) => d.id);
  if (new Set(damIds).size !== damIds.length) fail('dam ids'); // works and the renderer find dams by id
  for (const v of list('jams', WOOD.maxJams)) {
    if (!at(v) || !nums(v, ['height'], 0, 10) || !nums(v, ['id', 'age', 'life'], 0, 1e9) || (v.side !== 1 && v.side !== -1)) fail('log jam');
  }
  for (const w of list('works', WORKS.max)) {
    if (!['straighten', 'weir', 'bridge', 'embankment'].includes(w?.kind) || !at(w) || !num(w.id, 0, 1e9) || !num(w.year, 0, 1e9)) fail('work');
    if (w.kind === 'straighten' && !(num(w.x0, -1, VALLEY.length + 1) && num(w.x1, -1, VALLEY.length + 1) && num(w.y0, -1, VALLEY.width + 1) && num(w.y1, -1, VALLEY.width + 1))) fail('straightened reach');
    if ((w.kind === 'weir' || w.kind === 'bridge') && !nums(w, ['dirx', 'diry'], -1.01, 1.01)) fail('work direction');
    if (w.kind === 'weir' && !num(w.dam, 0, 1e9)) fail('weir');
    if (w.cells !== undefined && (!(w.cells instanceof Int32Array) || w.cells.length > n || w.cells.some((i) => i < 0 || i >= n))) fail('work cells');
    if ((w.kind === 'straighten' || w.kind === 'embankment') && !(w.cells instanceof Int32Array)) fail('work cells');
  }
  if (state.workCount !== undefined && (!Number.isInteger(state.workCount) || state.workCount < 0)) fail('work count');
  if (state.jamCount !== undefined && (!Number.isInteger(state.jamCount) || state.jamCount < 0)) fail('jam count');
  for (const o of state.oxbows) if (o.lodge !== undefined && typeof o.lodge !== 'boolean') fail('oxbow lodge');
  // Gullies no bigger than the engine makes: their cost each step follows their size.
  const maxPoints = Math.ceil(HILLS.gullyMaxLength / 40) + 3;
  for (const v of list('gullies', HILLS.maxGullies)) {
    if (!at(v) || !nums(v, ['dirx', 'diry'], -1.01, 1.01) || !num(v.age, 0, 1e9)
      || !num(v.maxLength, 0, HILLS.gullyMaxLength + 1) || !num(v.length, 0, v.maxLength)) fail('gully');
    if (!(v.footZ === Infinity || num(v.footZ, -1e5, 1e5))) fail('gully mouth');
    if (!Array.isArray(v.px) || !Array.isArray(v.py) || v.px.length !== v.py.length || v.px.length < 2 || v.px.length > maxPoints
      || !inside(v.px, v.py)) fail('gully course');
    for (let k = 1; k < v.px.length; k++) {
      const dx = v.px[k] - v.px[k - 1], dy = v.py[k] - v.py[k - 1];
      if (dx * dx + dy * dy > 45 * 45) fail('gully course');
    }
  }
}
