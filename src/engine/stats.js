// The river's history for the graphs: a row every few years of how winding
// it is, sediment leaving, its bed level, oxbows, flow, climate and braiding.
// When the table is full every other row goes, and rows come half as often,
// so a long run still fits.
import { STATS } from '../config.js';
import { arcLength } from './centreline.js';

export const STAT_KEYS = ['year', 'sinuosity', 'sediment', 'bed', 'oxbows', 'flow', 'wet', 'braid'];

// The table as saved: typed arrays for the columns.
export function saveStats(t) {
  const out = { every: t.every, acc: { ...t.acc } };
  for (const k of STAT_KEYS) out[k] = Float64Array.from(t[k]);
  return out;
}

// The columns for the renderer (a copy).
export function statsForSnapshot(t) {
  const out = { every: t.every, version: t.version };
  for (const k of STAT_KEYS) out[k] = Float32Array.from(t[k]);
  return out;
}

export function newStats() {
  const t = { every: STATS.everyYears, version: 0, acc: { q: 0, t: 0, sed: 0 } };
  for (const k of STAT_KEYS) t[k] = [];
  return t;
}

// Add to the running sums each step (flow is averaged over the interval).
export function accumulate(stats, q, dt) {
  stats.acc.q += q * dt;
  stats.acc.t += dt;
}

// A row, when one is due: `e` is the engine.
export function maybeRecord(stats, e) {
  const last = stats.year.length ? stats.year[stats.year.length - 1] : -Infinity;
  if (e.year - last < stats.every - 1e-9) return false;
  const n = e.active;
  const arc = arcLength(n === e.x.length ? e.x : e.x.subarray(0, n), n === e.y.length ? e.y : e.y.subarray(0, n));
  const span = Math.max(1, e.x[n - 1] - e.x[0]);
  let bed = 0;
  for (let i = 0; i < n; i++) bed += e.aggr[i];
  const moved = e.sediment.exported + (e.sediment.delta || 0);
  const years = stats.acc.t || stats.every;
  const row = {
    year: e.year,
    sinuosity: arc[n - 1] / span,
    sediment: stats.year.length ? Math.max(0, (moved - stats.acc.sed) / years) : e.sediment.out,
    bed: bed / n - e.incision,
    oxbows: e.oxbows.length,
    flow: stats.acc.t > 0 ? stats.acc.q / stats.acc.t : e.q,
    wet: e.wet,
    braid: e.braid,
  };
  for (const k of STAT_KEYS) stats[k].push(row[k]);
  stats.acc = { q: 0, t: 0, sed: moved };
  if (stats.year.length > STATS.maxRows) {
    for (const k of STAT_KEYS) stats[k] = stats[k].filter((_, i) => i % 2 === 0);
    stats.every *= 2;
  }
  stats.version++;
  return true;
}

// Checked copy of saved stats (null if they are not sound), for restore.
// Saved as typed arrays; plain arrays are accepted too.
export function restoreStats(st) {
  if (!st || typeof st !== 'object') return null;
  const out = newStats();
  const list = (a) => (Array.isArray(a) || ArrayBuffer.isView(a) ? Array.from(a) : null);
  const years = list(st.year);
  const len = years ? years.length : -1;
  if (len < 0 || len > STATS.maxRows + 1) return null;
  for (const k of STAT_KEYS) {
    const a = list(st[k]);
    if (!a || a.length !== len || !a.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15)) return null;
    out[k] = a;
  }
  const every = st.every;
  if (typeof every !== 'number' || !(every >= STATS.everyYears) || every > STATS.everyYears * 1073741824) return null;
  out.every = every;
  const acc = st.acc || {};
  for (const k of ['q', 't', 'sed']) if (typeof acc[k] === 'number' && Number.isFinite(acc[k]) && Math.abs(acc[k]) < 1e15) out.acc[k] = acc[k];
  out.version = 1;
  return out;
}
