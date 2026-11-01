import { Engine } from '../src/engine/engine.js';
import { defaults, DT } from '../src/config.js';
const e = new Engine({ ...defaults, quality: 'low' });
const g = e.grid;
const hist = {};
for (let t = 0; t < 1500 / DT; t++) {
  e.tick();
  if (t % 100 !== 0) continue;
  for (const o of e.oxbows) for (const c of o.cells) {
    if (g.channel[c] !== 2) continue;
    const over = g.height[c] - o.level;
    if (over > -0.05) { const k = `${over < 0.2 ? '<0.2' : over < 0.5 ? '<0.5' : over < 1 ? '<1' : '>=1'}|surf${g.surface[c]}|age${o.age < 2 ? '<2' : o.age < 20 ? '<20' : '>=20'}`; hist[k] = (hist[k] || 0) + 1; }
  }
}
console.log(hist);
