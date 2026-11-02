// The .meander file: a whole engine state in one binary blob.
//
//   "MEANDER1" | uint32 header length | header JSON | padding | array data
//
// The header is the state with every typed array replaced by
// { $ta: type, o: byte offset, n: length } into the data block. Infinity and
// -Infinity (JSON cannot hold them) are written as { $num: 'inf' | '-inf' }.
// Compression (gzip) is left to the caller, since it is async in browsers.
import { QUALITY, defaults } from '../config.js';
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
  let header;
  try { header = new TextDecoder().decode(bytes.subarray(12, 12 + len)); } catch { throw new Error('save header unreadable'); }
  const state = JSON.parse(header, (key, value) => {
    if (value && typeof value === 'object' && typeof value.$ta === 'string') {
      const T = TYPES[value.$ta];
      const { o, n } = value;
      if (!T || !Number.isInteger(o) || !Number.isInteger(n) || o < 0 || n < 0 || o % 8 !== 0 || o + n * T.BYTES_PER_ELEMENT > data.length) {
        throw new Error('save array out of range');
      }
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
  if (!state || typeof state !== 'object') fail('no state');
  if (state.version !== SAVE_VERSION) throw new Error(`save is from a different version (${state.version})`);
  state.settings = sanitizeSettings(state.settings, defaults);
  const q = QUALITY[state.settings.quality];
  const g = state.grid;
  if (!g || g.cols !== q.cols || g.rows !== q.rows) fail('grid size');
  const n = g.cols * g.rows;
  for (const k of ['height', 'base', 'relief', 'surface', 'patch', 'rock', 'veg', 'channel', 'lakeLost', 'chanLevel', 'bedrock']) {
    if (!ArrayBuffer.isView(g[k]) || g[k].length !== n) fail(`grid ${k}`);
  }
  if (!(g.chanList instanceof Int32Array) || g.chanList.some((i) => i < 0 || i >= n)) fail('grid channel list');
  const finite = (a) => ArrayBuffer.isView(a) && a.every(Number.isFinite);
  if (!finite(state.x) || !finite(state.y) || state.x.length !== state.y.length || state.x.length < 16) fail('centreline');
  for (const k of ['rate', 'curv', 'level']) if (!ArrayBuffer.isView(state[k])) fail(k);
  if (!Array.isArray(state.oxbows) || !Array.isArray(state.history)) fail('lists');
  for (const o of state.oxbows) {
    if (!finite(o.x) || !finite(o.y) || !(o.cells instanceof Int32Array) || o.cells.some((i) => i < 0 || i >= n)) fail('oxbow');
  }
  for (const h of state.history) if (!finite(h.x) || !finite(h.y) || h.x.length !== h.y.length) fail('history');
  for (const k of ['year', 'tickCount', 'incision', 'discharge']) if (!Number.isFinite(state[k])) fail(k);
  if (!state.rng || !Number.isFinite(state.rng.state)) fail('random state');
  if (!Number.isFinite(g.alluvium)) fail('alluvium');
  if (!Array.isArray(state.knickpoints) || state.knickpoints.some((k) => !Number.isFinite(k.pos) || !Number.isFinite(k.drop))) fail('knickpoints');
}
