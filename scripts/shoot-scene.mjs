// Screenshots of any river: builds, serves dist/, opens the app with the
// given share-link settings, runs it for some years in headless Chromium and
// saves docs/looks/<label>-1-overview.png, -2-oblique.png, -3-labels.png,
// -4-topdown.png, and -5-close.png (looking at the newest feature of the
// types given). Prints update times and the features found. Exits non-zero
// on any console error.
//   node scripts/shoot-scene.mjs <label> "<hash settings>" [years] [feature,types]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const label = process.argv[2] || 'scene';
const hash = process.argv[3] || 'seed=1';
const YEARS = Number(process.argv[4] || 1000);
const closeTypes = (process.argv[5] || '').split(',').filter(Boolean);
const PORT = 4824;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

if (!process.env.NO_BUILD) await run('npx', ['vite', 'build']);
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?autoplay=0&fresh#${hash}`);
  await page.waitForFunction(() => window.meander && window.meander.snapshot, null, { timeout: 60000 });
  await page.evaluate((y) => window.meander.sim.step(y), YEARS);
  await page.waitForFunction((y) => window.meander.snapshot.year >= y, YEARS, { timeout: 1800000, polling: 2000 });
  await page.waitForTimeout(2000);
  if (!process.env.SHOW_PANEL) await page.evaluate(() => { window.meander.controls.gui.domElement.style.display = 'none'; });
  const info = await page.evaluate(() => {
    const m = window.meander, s = m.snapshot;
    const time = (fn, n) => { const a = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - a) / n; };
    return {
      year: Math.floor(s.year),
      terrain: time(() => m.terrain.update(s, m.settings.exaggeration), 5).toFixed(1),
      water: time(() => m.water.update(s, m.settings.exaggeration, m.settings.waterOpacity), 10).toFixed(1),
      features: [...new Set(s.features.map((f) => f.type))].join(' '),
      hud: document.getElementById('hud')?.innerText.replace(/\n/g, ' | '),
    };
  });
  console.log(`[${label}]`, JSON.stringify(info));
  for (const [key, name] of [['1', 'overview'], ['2', 'oblique']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/looks/${label}-${key}-${name}.png`, timeout: 180000, animations: 'disabled' });
  }
  await page.evaluate(() => { window.meander.settings.showLabels = true; window.meander.controls.refresh(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/looks/${label}-3-labels.png`, timeout: 180000, animations: 'disabled' });
  await page.evaluate(() => { window.meander.settings.showLabels = false; window.meander.controls.refresh(); });
  await page.evaluate(() => {
    const v = window.meander.view;
    v.camera.position.set(0, 5600, 1);
    v.controls.target.set(0, 0, 0);
    v.controls.update();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/looks/${label}-4-topdown.png`, timeout: 180000, animations: 'disabled' });
  // The downstream end, from above.
  await page.evaluate(() => {
    const v = window.meander.view;
    v.camera.position.set(1900, 2300, 1);
    v.controls.target.set(1900, 0, 0);
    v.controls.update();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/looks/${label}-6-downstream.png`, timeout: 180000, animations: 'disabled' });
  if (closeTypes.length) {
    const ok = await page.evaluate((ts) => {
      const m = window.meander, s = m.snapshot;
      const f = s.features.filter((v) => ts.includes(v.type)).pop();
      if (!f) return false;
      const ex = m.settings.exaggeration;
      const g = s.grid;
      const i = Math.min(g.cols - 1, Math.floor(f.x / g.cell)) + Math.min(g.rows - 1, Math.floor(f.y / g.cell)) * g.cols;
      const tx = f.x - 3000, tz = f.y - 1500, ty = g.height[i] * ex;
      m.view.camera.position.set(tx - 650, ty + 420, tz + (f.y < 1500 ? 1 : -1) * 500);
      m.view.controls.target.set(tx, ty, tz);
      m.view.controls.update();
      return true;
    }, closeTypes);
    if (ok) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `docs/looks/${label}-5-close.png`, timeout: 180000, animations: 'disabled' });
    } else console.log(`[${label}] no ${closeTypes.join('/')} to look at`);
  }
  if (errors.length) { console.error('[console errors]', errors); exitCode = 1; }
  await browser.close();
} finally {
  server.kill();
}
process.exit(exitCode);
