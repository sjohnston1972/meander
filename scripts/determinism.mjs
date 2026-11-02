// Cross-browser determinism: share links promise the same river everywhere.
// Runs the same rivers in Node and in headless Chromium, Firefox and WebKit
// (Playwright's builds) and compares fingerprints of the result.
// Usage: node scripts/determinism.mjs   (exits non-zero on any mismatch)
import { spawn } from 'node:child_process';
import { chromium, firefox, webkit } from 'playwright';
import { Engine } from '../src/engine/engine.js';
import { defaults, PRESETS } from '../src/config.js';
import { fingerprint } from '../test/helpers.js';

const PORT = 4822;
const CASES = [
  { name: 'seed 1', settings: { seed: 1 }, ticks: 2800 },
  { name: 'seed 2', settings: { seed: 2 }, ticks: 2800 },
  { name: 'seed 7, hard rock', settings: { seed: 7, hardRock: true }, ticks: 2000 },
  { name: 'incising, base drop', settings: { seed: 3, incisionRate: 6 }, ticks: 2400, drop: 1200 },
  { name: 'braided', settings: { seed: 4, ...PRESETS['Braided gravel river'] }, ticks: 1200 },
  { name: 'gorge: landslides, dams, gullies', settings: { seed: 5, incisionRate: 20, alluviumDepth: 4 }, ticks: 12000, slide: 11000 },
  { name: 'overloaded with sediment', settings: { seed: 6, sedimentSupply: 3 }, ticks: 2400 },
  { name: 'starved of sediment', settings: { seed: 8, sedimentSupply: 0.2 }, ticks: 2400 },
];

function runCase(EngineClass, base, fp, c) {
  const e = new EngineClass({ ...base, ...c.settings, quality: 'low' });
  for (let i = 0; i < c.ticks; i++) {
    if (c.drop === i) e.dropBaseLevel(2);
    if (c.slide === i) e.triggerLandslide();
    e.tick();
  }
  return fp(e);
}

const expected = CASES.map((c) => runCase(Engine, defaults, fingerprint, c));
console.log('node     ', expected.join('  '));

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
let bad = 0;
try {
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    try { up = (await fetch(`http://localhost:${PORT}/debug.html`)).ok; } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) throw new Error(`dev server on port ${PORT} did not start`);
  for (const [name, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
    const browser = await type.launch();
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/debug.html`);
    const got = await page.evaluate(async ({ cases }) => {
      const { Engine } = await import('/src/engine/engine.js');
      const { defaults } = await import('/src/config.js');
      const { fingerprint } = await import('/test/helpers.js');
      return cases.map((c) => {
        const e = new Engine({ ...defaults, ...c.settings, quality: 'low' });
        for (let i = 0; i < c.ticks; i++) {
          if (c.drop === i) e.dropBaseLevel(2);
          if (c.slide === i) e.triggerLandslide();
          e.tick();
        }
        return fingerprint(e);
      });
    }, { cases: CASES });
    const ok = got.map((g, i) => g === expected[i]);
    console.log(name.padEnd(9), got.map((g, i) => (ok[i] ? g : `${g}(!)`)).join('  '));
    for (let i = 0; i < ok.length; i++) if (!ok[i]) { bad++; console.log(`  MISMATCH ${name}: ${CASES[i].name}`); }
    await browser.close();
  }
} finally {
  server.kill();
  if (process.platform === 'win32') spawn('cmd', ['/c', `for /f "tokens=5" %p in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %p`], { stdio: 'ignore', shell: false });
}
console.log(bad ? `${bad} mismatch(es)` : 'all browsers match');
process.exit(bad ? 1 : 0);
