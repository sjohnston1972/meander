// The .meander file: a whole engine state in one binary blob.
//
//   "MEANDER1" | uint32 header length | header JSON | padding | array data
//
// The header is the state with every typed array replaced by
// { $ta: type, o: byte offset, n: length } into the data block. Infinity and
// -Infinity (JSON cannot hold them) are written as { $num: 'inf' | '-inf' }.
// Compression (gzip) is left to the caller, since it is async in browsers.
import { QUALITY, VALLEY, defaults } from '../config.js';
import { sanitizeSettings } from '../settings.js';

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

  // The river: inside the valley, a sane number of points, per-point arrays to match.
  const inside = (xs, ys) => xs.every((v) => num(v, -1, VALLEY.length + 1)) && ys.every((v) => num(v, -1, VALLEY.width + 1));
  const n0 = state.x?.length;
  if (!finite(state.x) || !finite(state.y) || state.y.length !== n0 || n0 < 16 || n0 > 50000) fail('centreline');
  if (!inside(state.x, state.y)) fail('centreline outside the valley');
  // rate and curvature are from before the last re-spacing, so their length may
  // differ (the engine checks before using them); the water level must match.
  for (const k of ['rate', 'curv']) if (!finite(state[k]) || state[k].length > 50000) fail(k);
  if (!finite(state.level) || state.level.length !== n0) fail('level');

  if (!Array.isArray(state.oxbows) || state.oxbows.length > 5000 || !Array.isArray(state.history) || state.history.length > 1000) fail('lists');
  for (const o of state.oxbows) {
    if (!finite(o.x) || !finite(o.y) || o.x.length !== o.y.length || o.x.length > 50000 || !inside(o.x, o.y)) fail('oxbow');
    if (!(o.cells instanceof Int32Array) || o.cells.some((i) => i < 0 || i >= n)) fail('oxbow cells');
    for (const k of ['id', 'age', 'depth', 'width', 'year', 'cx', 'cy', 'level', 'lastStampDepth']) if (!num(o[k], -1e6, 1e9)) fail(`oxbow ${k}`);
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
  if (!Array.isArray(state.knickpoints) || state.knickpoints.length > 1000
    || state.knickpoints.some((k) => !num(k.pos, 0, 1e7) || !num(k.drop, 0, 1000))) fail('knickpoints');
}
