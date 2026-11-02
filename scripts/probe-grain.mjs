// Probe grain sorting: the bed's gravel fraction along the river for a few rivers.
//   node scripts/probe-grain.mjs [years]
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';

const years = +(process.argv[2] || 600);
const cases = {
  overloaded: { sedimentSupply: 3 },
  starved: { sedimentSupply: 0.2 },
  lake: { valleyEnd: 'lake', sedimentSupply: 2 },
  tributary: { tributary: 0.5 },
  incising: { incisionRate: 8 },
};
for (const [name, extra] of Object.entries(cases)) {
  const e = new Engine({ ...defaults, quality: 'low', ...extra });
  for (let i = 0; i < years * 4; i++) e.tick();
  const n = e.active, g = e.grain;
  const prof = [];
  for (let k = 0; k < 10; k++) prof.push(g ? g[Math.floor((k + 0.5) * n / 10)].toFixed(2) : '-');
  console.log(name.padEnd(11), prof.join(' '), ' bed', Array.from({ length: 5 }, (_, k) => e.aggr[Math.floor((k + 0.5) * n / 5)].toFixed(2)).join(' '));
}
