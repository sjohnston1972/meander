// Top-down 2D debug view of the engine, no three.js. Open /debug.html.
import { Engine } from './engine/engine.js';
import { defaults, DT, VALLEY } from './config.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const speedEl = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const settings = { ...defaults, quality: 'low' };
let engine = new Engine(settings);
let playing = false;
let yearsPerSecond = Number(speedEl.value);
let acc = 0, last = performance.now();
const sx = canvas.width / VALLEY.length, sy = canvas.height / VALLEY.width;

function draw() {
  const snap = engine.snapshot();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1d2a1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const t of snap.trails) {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 - t.age / 1000})`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < t.x.length; i++) ctx.lineTo(t.x[i] * sx, t.y[i] * sy);
    ctx.stroke();
  }
  for (const o of snap.oxbows) {
    ctx.strokeStyle = o.depth > 0.6 ? '#3d6f7a' : '#5f7f4a'; ctx.lineWidth = o.width * sx;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < o.x.length; i++) ctx.lineTo(o.x[i] * sx, o.y[i] * sy);
    ctx.stroke();
  }
  const c = snap.centreline;
  ctx.strokeStyle = snap.flood > 0 ? '#7a6a3c' : '#5aa6b8'; ctx.lineWidth = c.width * sx;
  ctx.beginPath();
  for (let i = 0; i < c.x.length; i++) ctx.lineTo(c.x[i] * sx, c.y[i] * sy);
  ctx.stroke();
  info.textContent = `Year ${snap.year.toFixed(0)} · ${c.x.length} points · ${snap.oxbows.length} oxbows · flood ${snap.flood.toFixed(2)}`;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) {
    acc += (yearsPerSecond * dt) / DT;
    let steps = Math.min(200, Math.floor(acc)); acc -= steps;
    while (steps-- > 0) engine.tick();
  }
  draw();
  requestAnimationFrame(frame);
}
document.getElementById('play').onclick = (e) => { playing = !playing; e.target.textContent = playing ? 'Pause' : 'Play'; };
document.getElementById('step').onclick = () => { for (let i = 0; i < 10 / DT; i++) engine.tick(); };
document.getElementById('reset').onclick = () => { engine = new Engine(settings); };
speedEl.oninput = () => { yearsPerSecond = Number(speedEl.value); speedVal.textContent = yearsPerSecond; };
requestAnimationFrame(frame);
