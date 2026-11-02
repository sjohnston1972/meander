// Probe the valley-end lake: how fast the delta grows and where the load goes.
//   node scripts/probe-delta.mjs [sedimentSupply] [years] [quality]
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { OPEN_LAKE } from '../src/engine/delta.js';

const supply = +(process.argv[2] || 1), years = +(process.argv[3] || 1000), quality = process.argv[4] || 'low';
const e = new Engine({ ...defaults, quality, valleyEnd: 'lake', sedimentSupply: supply });
const open = () => e.lake.cells.reduce((k, i) => k + (e.grid.channel[i] === OPEN_LAKE ? 1 : 0), 0);
const t0 = performance.now();
for (let y = 0; y <= years; y += 100) {
  console.log(`y${y} mouth x=${e.x[e.mouth].toFixed(0)} open=${open()}/${e.lake.cells.length}`
    + ` into lake ${(e.sediment.delta / 1e6).toFixed(2)}M settled ${(e.lake.deposited / 1e6).toFixed(2)}M bulk,`
    + ` exported ${(e.sediment.exported / 1e6).toFixed(2)}M dists=${e.lake.dists.filter((d) => d.path).length} n=${e.x.length}`);
  if (y < years) for (let i = 0; i < 400; i++) e.tick();
}
console.log(`${((performance.now() - t0) / (years * 4)).toFixed(2)} ms/tick`);
