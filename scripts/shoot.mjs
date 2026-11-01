// Screenshot harness for look tuning. Usage: node scripts/shoot.mjs <label> [--tod]
// Builds the site, serves dist/, runs the river to year 900 in headless
// Chromium and saves docs/looks/<label>-<preset>.png for camera presets 1-4
// plus an Explain-mode shot. Prints console errors and CPU timings of the
// terrain and water updates. Exits non-zero on any console error.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const label = process.argv[2] || 'shot';
const withTod = process.argv.includes('--tod');
const PORT = 4819;
const YEAR = 900;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

async function waitFor(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

await run('npx', ['vite', 'build']);
mkdirSync('docs/looks', { recursive: true });
// A previous run's preview server may still be shutting down: wait for the port to be free.
for (let i = 0; i < 40; i++) {
  let busy = false;
  try { await fetch(`http://localhost:${PORT}/`); busy = true; } catch {}
  if (!busy) break;
  await new Promise((r) => setTimeout(r, 500));
}
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
let exitCode = 0;
try {
  await waitFor(`http://localhost:${PORT}/`);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?autoplay=0#seed=1`);
  const title = await page.title();
  if (!/Meander/.test(title)) throw new Error(`wrong page served on port ${PORT}: ${title}`);
  await page.waitForFunction(() => window.meander && window.meander.snapshot, null, { timeout: 30000 });

  // Run the river forward and wait for the engine to report it.
  await page.evaluate((y) => { window.meander.sim.step(y); }, YEAR);
  await page.waitForFunction((y) => window.meander.snapshot && window.meander.snapshot.year >= y, YEAR, { timeout: 120000 });
  await page.evaluate(() => { window.meander.sim.pause(); window.meander.controls.setPlaying(false); });
  await page.waitForTimeout(1500);

  // CPU timings of the two heavy updates.
  const timings = await page.evaluate(() => {
    const m = window.meander;
    const s = m.snapshot;
    const time = (fn, n) => { const a = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - a) / n; };
    return {
      terrain: time(() => m.terrain.update(s, m.settings.exaggeration), 10),
      water: time(() => m.water.update(s, m.settings.exaggeration, m.settings.waterOpacity), 20),
      points: s.centreline.x.length, grid: `${s.grid.cols}x${s.grid.rows}`,
    };
  });

  const shots = [['1', 'overview'], ['2', 'oblique'], ['3', 'bend'], ['4', 'topdown']];
  for (const [key, name] of shots) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/looks/${label}-${key}-${name}.png`, timeout: 180000, animations: 'disabled' });
  }
  // Explain mode from the bend camera.
  await page.evaluate(() => { window.meander.settings.showLabels = true; window.meander.controls.refresh(); });
  await page.keyboard.press('3');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/looks/${label}-5-labels.png`, timeout: 180000, animations: 'disabled' });
  await page.evaluate(() => { window.meander.settings.showLabels = false; });

  if (withTod) {
    await page.keyboard.press('1');
    for (const h of [7, 12, 17]) {
      await page.evaluate((hour) => { window.meander.settings.timeOfDay = hour; window.meander.view.setTimeOfDay(hour); }, h);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `docs/looks/${label}-tod-${h}.png`, timeout: 180000, animations: 'disabled' });
    }
  }

  console.log(`[shoot] ${label}: year ${YEAR}, ${timings.points} points, grid ${timings.grid}`);
  console.log(`[shoot] terrain.update ${timings.terrain.toFixed(2)} ms, water.update ${timings.water.toFixed(2)} ms`);
  if (errors.length) {
    console.log(`[shoot] ${errors.length} console error(s):`);
    for (const e of errors) console.log('  ' + e);
    exitCode = 1;
  } else {
    console.log('[shoot] no console errors');
  }
  await browser.close();
} catch (e) {
  console.error('[shoot] failed:', e.message);
  exitCode = 1;
} finally {
  server.kill();
  // vite preview spawns a child on Windows; make sure the port is freed.
  if (process.platform === 'win32') spawn('cmd', ['/c', `for /f "tokens=5" %p in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %p`], { stdio: 'ignore', shell: false });
}
process.exit(exitCode);
