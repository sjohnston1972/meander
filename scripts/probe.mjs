// Quick engine probe: first oxbow year and tick cost. Run: node scripts/probe.mjs
import { Engine } from '../src/engine/engine.js';
import { defaults, DT } from '../src/config.js';
const e = new Engine({ ...defaults, quality: 'low' });
let first = null; const t0 = performance.now(); let ticks = 0;
for (let y = 0; y < 3000; y += DT) { e.tick(); ticks++; if (first === null && e.oxbows.length) first = e.year; }
const ms = performance.now() - t0;
console.log('first oxbow year', first, 'oxbows at 3000', e.oxbows.length, 'points', e.x.length, 'ms/tick', (ms / ticks).toFixed(3));
