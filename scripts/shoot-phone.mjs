// Phone check: builds, serves dist/, opens the app as a touch phone (Pixel 7
// emulation in headless Chromium) and saves docs/looks/<label>-phone-*.png:
// the valley, the help sheet and the open control panel. Taps the touch
// toolbar's play button and checks the year moves. Exits non-zero on any
// console error. Usage: node scripts/shoot-phone.mjs <label>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const label = process.argv[2] || 'phone';
const PORT = 4821;

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
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?fresh`);
  await page.waitForFunction(() => window.meander && window.meander.snapshot, null, { timeout: 60000 });
  const info = await page.evaluate(() => ({
    quality: window.meander.settings.quality,
    touch: document.body.classList.contains('touch'),
    toolbar: getComputedStyle(document.getElementById('touchbar')).display,
    panelClosed: document.querySelector('.lil-gui.lil-root').classList.contains('lil-closed'),
  }));
  console.log('[phone]', JSON.stringify(info));
  if (info.quality !== 'low' || !info.touch || info.toolbar === 'none' || !info.panelClosed) { console.log('[phone] unexpected start state'); exitCode = 1; }
  // Pause, step, then play with the toolbar.
  await page.evaluate(() => window.meander.sim.step(150));
  await page.waitForFunction(() => window.meander.snapshot.year >= 150, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/looks/${label}-phone-1-valley.png`, timeout: 180000 });
  await page.tap('#tb-help');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `docs/looks/${label}-phone-2-help.png`, timeout: 180000 });
  await page.tap('#tb-help');
  // The toolbar's play button runs the river (it starts playing, so tap twice: pause, play).
  const y0 = await page.evaluate(() => window.meander.snapshot.year);
  await page.tap('#tb-play');
  const playing = await page.evaluate(() => window.meander.sim.playing);
  if (playing) await page.tap('#tb-play');
  await page.waitForTimeout(4000);
  const y1 = await page.evaluate(() => window.meander.snapshot.year);
  console.log(`[phone] play button: year ${y0} -> ${y1}`);
  if (!(y1 > y0)) { console.log('[phone] the play button did not run the river'); exitCode = 1; }
  await page.tap('.lil-gui.lil-root > .lil-title');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `docs/looks/${label}-phone-3-panel.png`, timeout: 180000 });
  if (errors.length) {
    console.log(`[phone] ${errors.length} console error(s):`);
    for (const e of errors) console.log('  ' + e);
    exitCode = 1;
  } else {
    console.log('[phone] no console errors');
  }
  await browser.close();
} catch (e) {
  console.error('[phone] failed:', e.message);
  exitCode = 1;
} finally {
  server.kill();
  if (process.platform === 'win32') spawn('cmd', ['/c', `for /f "tokens=5" %p in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %p`], { stdio: 'ignore', shell: false });
}
process.exit(exitCode);
