import { Engine } from '../src/engine/engine.js';
import { defaults, DT } from '../src/config.js';
const e = new Engine({ ...defaults, quality: 'medium' });
const t = {};
const time = (name, fn) => { const a = performance.now(); fn(); t[name] = (t[name] || 0) + performance.now() - a; };
import * as fp from '../src/engine/floodplain.js';
const t0 = performance.now();
for (let i = 0; i < 2000; i++) e.tick();
const total = performance.now() - t0;
// Now time individual pieces on the final state
time('stamp', () => { for (let i = 0; i < 100; i++) e.stamp(); });
time('levels', () => { for (let i = 0; i < 100; i++) e.computeLevels(); });
time('growLand', () => { for (let i = 0; i < 100; i++) fp.growLand(e.grid, e.settings, 1, 0); });
time('snapshot', () => { for (let i = 0; i < 20; i++) e.snapshot(); });
time('erod', () => { for (let r = 0; r < 100; r++) for (let i = 0; i < e.x.length; i++) e.localErodibility(i); });
console.log('ms/tick', (total / 2000).toFixed(3), 'points', e.x.length);
for (const k in t) console.log(k, (t[k] / (k === 'snapshot' ? 20 : 100)).toFixed(3), 'ms each');
