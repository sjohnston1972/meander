// Probe the tributary: its course, junction, cutoffs, and the main river's bed below it.
//   node scripts/probe-trib.mjs [share] [years] [seed]
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { arcLength } from '../src/engine/centreline.js';

const share = +(process.argv[2] || 0.4), years = +(process.argv[3] || 1000), seed = +(process.argv[4] || 1);
const e = new Engine({ ...defaults, quality: 'low', seed, tributary: share });
const t0 = performance.now();
for (let y = 0; y <= years; y += 100) {
  const t = e.trib;
  const len = arcLength(t.x, t.y);
  let maxA = 0, at = 0;
  for (let i = 0; i < e.aggr.length; i++) if (e.aggr[i] > maxA) { maxA = e.aggr[i]; at = i; }
  const sin = len[len.length - 1] / Math.hypot(t.x[t.x.length - 1] - t.x[0], t.y[t.y.length - 1] - t.y[0]);
  console.log(`y${y} sinuosity ${sin.toFixed(2)} trib pts=${t.x.length} len=${len[len.length - 1].toFixed(0)} entry=(${t.entryX.toFixed(0)},${t.entryY.toFixed(0)}) j=${t.j}/${e.x.length} junction=(${e.x[t.j].toFixed(0)},${e.y[t.j].toFixed(0)}) oxbows=${e.oxbows.length} bed max ${maxA.toFixed(2)}m at ${at} out ${e.sediment.out.toFixed(0)}`);
  if (y < years) for (let i = 0; i < 400; i++) e.tick();
}
console.log(`${((performance.now() - t0) / (years * 4)).toFixed(2)} ms/tick`);
