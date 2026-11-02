// Gorge check: builds, serves dist/, runs an incising river (15 m per 1000
// years) for 4000 years in headless Chromium and saves
// docs/looks/<label>-gorge-*.png: overview, oblique, Explain mode, close-ups
// on a landslide and a gully (when there are any), and the Landslide button.
// Prints the terrain and water update times and what the walls hold. Exits
// non-zero on any console error. Usage: node scripts/shoot-gorge.mjs <label> [years]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const label = process.argv[2] || 'gorge';
const YEARS = Number(process.argv[3] || 4000);
const PORT = 4823;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

await run('npx', ['vite', 'build']);
mkdirSync('docs/looks', { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
let exitCode = 0;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?autoplay=0&fresh#seed=1&incisionRate=15`);
  await page.waitForFunction(() => window.meander && window.meander.snapshot, null, { timeout: 60000 });
  await page.evaluate((y) => window.meander.sim.step(y), YEARS);
  await page.waitForFunction((y) => window.meander.snapshot.year >= y, YEARS, { timeout: 900000, polling: 2000 });
  await page.evaluate(() => { window.meander.sim.pause(); window.meander.controls.setPlaying(false); });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const m = window.meander, s = m.snapshot;
    const time = (fn, n) => { const a = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - a) / n; };
    const count = {};
    for (let i = 0; i < s.grid.surface.length; i++) count[s.grid.surface[i]] = (count[s.grid.surface[i]] || 0) + 1;
    return {
      terrain: time(() => m.terrain.update(s, m.settings.exaggeration), 5).toFixed(1),
      water: time(() => m.water.update(s, m.settings.exaggeration, m.settings.waterOpacity), 10).toFixed(1),
      incision: s.settings.incision.toFixed(1), ponds: s.ponds.map((p) => p.cells.length),
      features: s.features.map((f) => f.type).filter((t) => !['pool', 'cutbank', 'pointbar', 'riffle', 'helical'].includes(t)),
      scree: count[8] || 0,
    };
  });
  console.log('[gorge]', JSON.stringify(info));
  for (const [key, name] of [['1', 'overview'], ['2', 'oblique']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/looks/${label}-gorge-${key}-${name}.png`, timeout: 180000, animations: 'disabled' });
  }
  await page.evaluate(() => { window.meander.settings.showLabels = true; window.meander.controls.refresh(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/looks/${label}-gorge-3-labels.png`, timeout: 180000, animations: 'disabled' });
  await page.evaluate(() => { window.meander.settings.showLabels = false; window.meander.controls.refresh(); });

  // Close-ups: look at a feature from 350 m away, across the valley.
  const look = (types) => page.evaluate((ts) => {
    const m = window.meander, s = m.snapshot;
    const f = s.features.filter((v) => ts.includes(v.type)).pop(); // the newest
    if (!f) return false;
    const ex = m.settings.exaggeration;
    const g = s.grid;
    const i = Math.min(g.cols - 1, Math.floor(f.x / g.cell)) + Math.min(g.rows - 1, Math.floor(f.y / g.cell)) * g.cols;
    const tx = f.x - 3000, tz = f.y - 1500, ty = g.height[i] * ex;
    const side = f.y < 1500 ? 1 : -1;
    m.view.camera.position.set(tx - 120, ty + 140, tz + side * 330);
    m.view.controls.target.set(tx, ty - 10, tz);
    m.view.controls.update();
    return f.type;
  }, types);
  const shots = [['4-landslide', ['landslidelake', 'landslidedam', 'landslide']], ['5-gully', ['gully', 'fan']], ['6-ledges', ['rockledge', 'scree']]];
  for (const [name, types] of shots) {
    const what = await look(types);
    console.log(`[gorge] ${name}: ${what || 'none in view'}`);
    if (!what) continue;
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/looks/${label}-gorge-${name}.png`, timeout: 180000, animations: 'disabled' });
  }
  // The Landslide button.
  await page.evaluate(() => window.meander.sim.triggerLandslide());
  await page.evaluate(() => window.meander.sim.step(1));
  await page.waitForTimeout(1500);
  const fresh = await look(['landslide']);
  await page.waitForTimeout(1500);
  if (fresh) await page.screenshot({ path: `docs/looks/${label}-gorge-7-button.png`, timeout: 180000, animations: 'disabled' });
  if (errors.length) {
    console.log(`[gorge] ${errors.length} console error(s):`);
    for (const e of errors) console.log('  ' + e);
    exitCode = 1;
  } else console.log('[gorge] no console errors');
  await browser.close();
} catch (e) {
  console.error('[gorge] failed:', e.message);
  exitCode = 1;
} finally {
  server.kill();
  if (process.platform === 'win32') spawn('cmd', ['/c', `for /f "tokens=5" %p in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %p`], { stdio: 'ignore', shell: false });
}
process.exit(exitCode);
