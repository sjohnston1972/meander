// Probe wood: log jams and beavers over time.
//   node scripts/probe-wood.mjs [years] [channelWidth] [tributary]
import { Engine } from '../src/engine/engine.js';
import { defaults, SURFACE } from '../src/config.js';

const years = +(process.argv[2] || 500), W = +(process.argv[3] || 30), trib = +(process.argv[4] || 0.2);
const e = new Engine({ ...defaults, quality: 'low', channelWidth: W, logJams: true, beavers: true, tributary: trib });
const t0 = performance.now();
const seen = {};
for (let y = 0; y <= years; y += 50) {
  let wet = 0, marsh = 0;
  for (const v of e.grid.surface) { if (v === SURFACE.WETLAND) wet++; else if (v === SURFACE.MARSH) marsh++; }
  const bd = e.dams.filter((d) => d.kind === 'beaver').length;
  console.log(`y${y} jams=${e.jams.length} (made ${e.jamCount}) beaver dams river=${bd} trib=${e.trib?.dams?.length ?? 0} ponds=${(e.trib?.dams || []).map((d) => d.cells.length).join('/')} lodges=${e.oxbows.filter((o) => o.lodge).length}/${e.oxbows.length} wet=${wet} marsh=${marsh}`);
  if (y < years) for (let i = 0; i < 200; i++) { e.tick(); for (const ev of e.events) seen[ev.type] = (seen[ev.type] || 0) + 1; e.events.length = 0; }
}
console.log(`${((performance.now() - t0) / (years * 4)).toFixed(2)} ms/tick`, JSON.stringify(seen));
