// Graphs over time (Show → Graphs over time): small charts of the river's
// history, one measure each on its own scale, stacked so they share the year
// axis. Hovering shows every chart's value at that year. "CSV" downloads the
// table behind them.
const NS = 'http://www.w3.org/2000/svg';
const W = 272, H = 40, PAD = 2;

// Each chart: its title, how to read its value, and when to show it.
const CHARTS = [
  { key: 'sinuosity', title: 'Sinuosity (river length ÷ valley length)', fmt: (v) => v.toFixed(2) },
  { key: 'sediment', title: 'Sediment leaving (m³ a year)', lakeTitle: 'Sediment into the lake (m³ a year)', fmt: (v) => Math.round(v).toLocaleString() },
  { key: 'bed', title: 'Bed level since the start (m)', fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`, zero: true },
  { key: 'oxbows', title: 'Oxbow lakes', fmt: (v) => String(Math.round(v)) },
  { key: 'flow', title: 'Flow (m³/s, averaged)', fmt: (v) => Math.round(v).toLocaleString() },
  { key: 'wet', title: 'Climate (wetter above the line, drier below)', fmt: (v) => (v > 0.33 ? 'wet' : v < -0.33 ? 'dry' : 'average'), zero: true, when: (s) => s.wet.some((v) => v !== 0), fixed: [-1, 1] },
  { key: 'braid', title: 'Braided (%)', fmt: (v) => `${Math.round(v * 100)}%`, when: (s) => s.braid.some((v) => v > 0), fixed: [0, 1] },
];

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function createGraphs() {
  const panel = document.createElement('div');
  panel.id = 'graphs';
  panel.setAttribute('role', 'figure');
  panel.setAttribute('aria-label', 'Graphs of the river over time');
  const head = document.createElement('div');
  head.className = 'g-head';
  const yearEl = document.createElement('span');
  yearEl.className = 'g-year';
  const csv = document.createElement('button');
  csv.className = 'g-csv';
  csv.textContent = 'CSV';
  csv.title = 'Download the numbers behind these graphs';
  head.append(yearEl, csv);
  panel.appendChild(head);
  document.body.appendChild(panel);

  let stats = null;
  let lake = false;
  let hover = -1;
  const rows = CHARTS.map((c) => {
    const box = document.createElement('div');
    box.className = 'g-chart';
    const label = document.createElement('div');
    label.className = 'g-label';
    const name = document.createElement('span');
    name.className = 'g-name';
    const value = document.createElement('span');
    value.className = 'g-value';
    label.append(name, value);
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const zero = el('line', { class: 'g-zero', x1: 0, x2: W }, svg);
    const area = el('polyline', { class: 'g-line', fill: 'none' }, svg);
    const cross = el('line', { class: 'g-cross', y1: 0, y2: H }, svg);
    const dot = el('circle', { class: 'g-dot', r: 3.5 }, svg);
    const lo = document.createElement('span'); lo.className = 'g-lo';
    const hi = document.createElement('span'); hi.className = 'g-hi';
    const plot = document.createElement('div');
    plot.className = 'g-plot';
    plot.append(svg, hi, lo);
    box.append(label, plot);
    panel.appendChild(box);
    return { c, box, name, value, svg, zero, area, cross, dot, lo, hi, range: [0, 1] };
  });

  const xOf = (i, n) => (n > 1 ? PAD + (i / (n - 1)) * (W - 2 * PAD) : W / 2);

  function draw() {
    if (!stats || !stats.year.length) { for (const r of rows) r.box.style.display = 'none'; yearEl.textContent = 'Graphs fill in as the river runs'; return; }
    const n = stats.year.length;
    for (const r of rows) {
      const show = !r.c.when || r.c.when(stats);
      r.box.style.display = show ? '' : 'none';
      if (!show) continue;
      const v = stats[r.c.key];
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) { if (v[i] < min) min = v[i]; if (v[i] > max) max = v[i]; }
      if (r.c.fixed) [min, max] = r.c.fixed;
      if (r.c.zero) { min = Math.min(min, 0); max = Math.max(max, 0); }
      if (max - min < 1e-9) { max += 0.5; min -= 0.5; }
      r.range = [min, max];
      const yOf = (val) => PAD + (1 - (val - min) / (max - min)) * (H - 2 * PAD);
      // At most one point per pixel column: the panel is narrow.
      const step = Math.max(1, Math.floor(n / W));
      const pts = [];
      for (let i = 0; i < n; i += step) pts.push(`${xOf(i, n).toFixed(1)},${yOf(v[i]).toFixed(1)}`);
      if ((n - 1) % step) pts.push(`${xOf(n - 1, n).toFixed(1)},${yOf(v[n - 1]).toFixed(1)}`);
      r.area.setAttribute('points', pts.join(' '));
      const z = yOf(0);
      r.zero.setAttribute('y1', z); r.zero.setAttribute('y2', z);
      r.zero.style.display = r.c.zero && min < 0 && max > 0 ? '' : 'none';
      r.name.textContent = lake && r.c.lakeTitle ? r.c.lakeTitle : r.c.title;
      r.hi.textContent = r.c.fixed ? '' : r.c.fmt(max);
      r.lo.textContent = r.c.fixed ? '' : r.c.fmt(min);
    }
    readout();
  }

  // The values at the hovered year (or the latest).
  function readout() {
    if (!stats || !stats.year.length) return;
    const n = stats.year.length;
    const i = hover >= 0 ? Math.min(hover, n - 1) : n - 1;
    yearEl.textContent = `${hover >= 0 ? 'Year' : 'Now, year'} ${Math.floor(stats.year[i]).toLocaleString()}`;
    for (const r of rows) {
      if (r.box.style.display === 'none') continue;
      const v = stats[r.c.key][i];
      r.value.textContent = r.c.fmt(v);
      const [min, max] = r.range;
      const x = xOf(i, n), y = PAD + (1 - (v - min) / (max - min)) * (H - 2 * PAD);
      r.dot.setAttribute('cx', x); r.dot.setAttribute('cy', y);
      r.cross.setAttribute('x1', x); r.cross.setAttribute('x2', x);
      r.cross.style.display = hover >= 0 ? '' : 'none';
    }
  }

  panel.addEventListener('pointermove', (e) => {
    if (!stats || !stats.year.length) return;
    const svg = rows.find((r) => r.box.style.display !== 'none')?.svg;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - rect.left - PAD) / (rect.width - 2 * PAD)));
    hover = Math.round(t * (stats.year.length - 1));
    readout();
  });
  panel.addEventListener('pointerleave', () => { hover = -1; readout(); });

  csv.onclick = () => {
    if (!stats) return;
    const keys = ['year', ...CHARTS.map((c) => c.key)];
    const lines = [keys.join(',')];
    for (let i = 0; i < stats.year.length; i++) lines.push(keys.map((k) => +stats[k][i].toFixed(4)).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'meander-history.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return {
    // New rows arrive with a snapshot only when the table has changed.
    update(snap) {
      lake = !!snap.lake;
      if (snap.stats) { stats = snap.stats; if (panel.classList.contains('show')) draw(); }
    },
    show(on) {
      panel.classList.toggle('show', !!on);
      if (on) draw();
    },
    reset() { stats = null; hover = -1; draw(); },
  };
}
