// CPU cost of terrain.update() in node (no WebGL involved). Usage: node scripts/bench-terrain.mjs [module path]
import { Engine } from '../src/engine/engine.js';
import { defaults, DT } from '../src/config.js';
const mod = process.argv[2] || '../src/render/terrain.js';
const { createTerrain } = await import(mod);
const e = new Engine({ ...defaults, quality: 'medium' });
for (let t = 0; t < 900 / DT; t++) e.tick();
const snap = e.snapshot();
const terrain = createTerrain();
terrain.update(snap, 2);
const n = 20, a = performance.now();
for (let i = 0; i < n; i++) terrain.update(snap, 2);
console.log(`${mod}: terrain.update ${((performance.now() - a) / n).toFixed(2)} ms (medium, ${snap.grid.cols}x${snap.grid.rows})`);
