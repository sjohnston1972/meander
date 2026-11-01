import { Engine } from '../src/engine/engine.js';
// Long-run probe: does an incising river keep sweeping the valley floor?
// node scripts/probe-incision-long.mjs [rate m/kyr] [years]
import { defaults, DT, VALLEY } from '../src/config.js';
const rate = Number(process.argv[2] ?? 4), years = Number(process.argv[3] ?? 6000);
const e = new Engine({ ...defaults, incisionRate: rate, quality: 'low' });
const g = e.grid;
for (let y = 0; y < years; y += 1000) {
  for (let t = 0; t < 1000 / DT; t++) e.tick();
  let minY = 1e9, maxY = -1e9, reworked = 0, land = 0, deep = 0;
  for (const v of e.y) { minY = Math.min(minY, v); maxY = Math.max(maxY, v); }
  for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
    const yy = (cy + 0.5) * g.cell; if (yy < 300 || yy > VALLEY.width - 300) continue;
    const i = cy * g.cols + cx; land++;
    const orig = defaults.valleySlope * (VALLEY.length - (cx + 0.5) * g.cell) + defaults.bankHeight;
    if (g.height[i] < orig - 1) reworked++;
    if (g.height[i] < orig - e.incision * 0.5) deep++;
  }
  console.log(`rate ${rate} year ${y + 1000} inc ${e.incision.toFixed(0)} belt ${(maxY - minY).toFixed(0)} reworked ${(reworked / land).toFixed(2)} belowHalfIncision ${(deep / land).toFixed(2)} sinu ${(e.x.length * e.ds / VALLEY.length).toFixed(2)}`);
}
