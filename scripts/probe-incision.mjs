import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY, PRESETS } from '../src/config.js';
for (const rate of [0, 2, 4, 8]) {
  const e = new Engine({ ...defaults, ...PRESETS['Incising upland river'], incisionRate: rate, quality: 'low' });
  let necks = 0;
  for (let t = 0; t < 2000 / DT; t++) { e.tick(); for (const ev of e.snapshot().events) if (ev.type === 'neck') necks++; }
  let maxDev = 0; for (const v of e.y) maxDev = Math.max(maxDev, Math.abs(v - VALLEY.width / 2));
  console.log(`incision ${rate} m/kyr: necks ${necks} lateral extent ${maxDev.toFixed(0)} m sinuosity ${(e.x.length * e.ds / VALLEY.length).toFixed(2)}`);
}
