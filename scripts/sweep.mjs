// Parameter sweep: node scripts/sweep.mjs
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY, CENTRELINE } from '../src/config.js';
const combos = [];
for (const noise of [0.1, 0.3]) combos.push({ alpha: 0.02, scale: 5, cut: 1, gamma: 2.5, noise });
for (const { alpha, scale, cut, gamma, noise } of combos) {
  CENTRELINE.migrationScale = scale; CENTRELINE.bankNoise = noise;
  const e = new Engine({ ...defaults, alpha, gamma, cutoffDistance: cut, quality: 'low' });
  let first = null, maxDev = 0;
  for (let y = 0; y < 2000; y += DT) {
    e.tick();
    if (first === null && e.oxbows.length) first = e.year;
    if (Math.abs(e.year - 1500) < DT / 2) for (const v of e.y) maxDev = Math.max(maxDev, Math.abs(v - VALLEY.width / 2));
  }
  const sin = (e.x.length * e.ds / VALLEY.length).toFixed(2); let loop = 0; for (const o of e.oxbows) { let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity; for (let i=0;i<o.x.length;i++){a=Math.min(a,o.x[i]);b=Math.max(b,o.x[i]);c=Math.min(c,o.y[i]);d=Math.max(d,o.y[i]);} loop += Math.hypot(b-a,d-c); } loop = e.oxbows.length ? (loop/e.oxbows.length).toFixed(0) : '-'; let firstBendX = VALLEY.length; for (let i=0;i<e.x.length;i++) if (Math.abs(e.y[i]-VALLEY.width/2) > 100) { firstBendX = e.x[i]; break; } console.log(`noise ${noise} alpha ${alpha} gamma ${gamma} sinuosity ${sin}: first ${first} oxbows@2000 ${e.oxbows.length} amp@1500 ${maxDev.toFixed(0)} loopSize ${loop} firstBendX ${firstBendX.toFixed(0)} pts ${e.x.length}`);
}
