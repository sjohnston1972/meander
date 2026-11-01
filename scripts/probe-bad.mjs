import { Engine } from '../src/engine/engine.js';
import { defaults, DT } from '../src/config.js';
import { cellIndex } from '../src/engine/floodplain.js';
const e = new Engine({ ...defaults, quality: 'low' });
for (let t = 0; t < 1500 / DT; t++) e.tick();
const g = e.grid;
for (let i = 0; i < e.x.length; i++) {
  const c = cellIndex(g, e.x[i], e.y[i]);
  if (g.height[c] > e.level[i] - 0.05) console.log('idx', i, 'of', e.x.length, 'x', e.x[i].toFixed(0), 'y', e.y[i].toFixed(0), 'h', g.height[c].toFixed(2), 'lvl', e.level[i].toFixed(2), 'chan', g.channel[c], 'surf', g.surface[c], 'lost', g.lakeLost[c]);
}
let lakeBad = 0, lakeCells = 0;
for (const o of e.oxbows) for (const c of o.cells) { if (g.channel[c] !== 2) continue; lakeCells++; if (g.height[c] > o.level - 0.05) lakeBad++; }
console.log('oxbows', e.oxbows.length, 'lakeCells', lakeCells, 'lakeBad', lakeBad);
for (const o of e.oxbows) { let b = 0, n = 0, maxOver = -9; for (const c of o.cells) { if (g.channel[c] !== 2) continue; n++; if (g.height[c] > o.level - 0.05) { b++; maxOver = Math.max(maxOver, g.height[c] - o.level); } } console.log(' oxbow year', o.year.toFixed(0), 'pts', o.x.length, 'depth', o.depth.toFixed(2), 'cells', n, 'bad', b, 'maxOver', maxOver.toFixed(2)); }
