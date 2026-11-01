import { Engine } from '../src/engine/engine.js';
import { defaults, DT } from '../src/config.js';
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const e = new Engine({ ...defaults, seed, quality: 'low' });
  let firstNeck = null, necks = 0, chutes = 0;
  for (let t = 0; t < 2000 / DT; t++) {
    e.tick();
    for (const ev of e.snapshot().events) { if (ev.type === 'neck') { necks++; if (firstNeck === null) firstNeck = ev.year; } else if (ev.type === 'chute') chutes++; }
  }
  console.log(`seed ${seed}: first neck ${firstNeck?.toFixed(0)} necks ${necks} chutes ${chutes} pts ${e.x.length}`);
}
