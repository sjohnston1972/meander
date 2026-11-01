// 2D side view of the channel at a clicked point: banks, water level, thalweg
// and helical flow arrows. Pure presentation of values in the snapshot.
import { THALWEG } from '../config.js';

export function createCrossSection() {
  const panel = document.getElementById('section');
  const canvas = document.getElementById('section-canvas');
  const text = document.getElementById('section-text');
  const title = document.getElementById('section-title');
  const ctx = canvas.getContext('2d');
  document.getElementById('section-close').onclick = () => hide();
  let current = null;
  let phase = 0;

  function hide() { panel.classList.remove('show'); current = null; }

  function show(snapshot, index) {
    const c = snapshot.centreline;
    current = { snapshot, index, x: c.x[index], y: c.y[index] };
    draw(0);
    panel.classList.add('show');
  }

  // Follow the latest snapshot: the river moves and is re-spaced under the
  // panel, so find the point nearest the spot that was clicked each time.
  function refresh(snapshot) {
    if (!current) return;
    const c = snapshot.centreline;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < c.x.length; i++) {
      const d = (c.x[i] - current.x) ** 2 + (c.y[i] - current.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (Math.sqrt(bestD) > c.width * 1.5) { hide(); return; } // the river has left this spot
    current.snapshot = snapshot;
    current.index = best;
  }

  function draw(dt) {
    if (!current) return;
    phase += dt * 1.5;
    const { snapshot, index } = current;
    const c = snapshot.centreline;
    const s = snapshot.settings;
    const W = c.width, D = c.depth[index], thal = c.thalweg[index], curv = c.curvature[index];
    const bank = s.bankHeight;
    const bend = Math.min(1, Math.abs(curv) * W * THALWEG.curvatureScale);
    const outerRight = curv > 0; // outer bank on the right when turning left
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Scales: horizontal covers 2.4 W, vertical covers bank + depth with exaggeration.
    const span = W * 2.4;
    const px = (u) => w / 2 + (u / span) * w;
    const vscale = (h * 0.7) / (bank + D * 0.3);
    const groundY = h * 0.3;
    const py = (z) => groundY - z * vscale; // z relative to floodplain top

    // Ground profile.
    const hw = W / 2;
    const shift = (outerRight ? 1 : -1) * THALWEG.shiftFraction * hw * bend;
    const profile = (u) => {
      // Height relative to floodplain top (0). Water level is at -(bank - D_mean).
      const waterZ = -(bank - s.channelDepth);
      if (Math.abs(u) <= hw) {
        const q = (u - shift) / (hw + Math.abs(shift));
        const depth = 0.2 + (D - 0.2) * Math.max(0, 1 - q * q);
        return waterZ - depth;
      }
      const isOuter = (u > 0) === outerRight;
      const f = Math.abs(u) - hw;
      if (isOuter) return f < W * 0.08 ? waterZ + (bank - s.channelDepth) * Math.min(1, f / (W * 0.08)) : 0;
      const ramp = W * 0.5;
      const k = Math.min(1, f / ramp);
      const sm = k * k * (3 - 2 * k);
      const barZ = waterZ + 0.3;
      return barZ + (0 - barZ) * sm;
    };
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 200; i++) {
      const u = -span / 2 + (i / 200) * span;
      ctx.lineTo(px(u), py(profile(u)));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = '#6b5a45';
    ctx.fill();
    // Grass cap.
    ctx.strokeStyle = '#5d8a3a'; ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const u = -span / 2 + (i / 200) * span;
      const z = profile(u);
      if (z > -0.05) ctx.lineTo(px(u), py(z)); else ctx.moveTo(px(u), py(z));
    }
    ctx.stroke();

    // Water.
    const waterZ = -(bank - s.channelDepth) + snapshot.flood * (bank - s.channelDepth + 0.6);
    ctx.beginPath();
    ctx.moveTo(px(-span / 2), py(waterZ));
    for (let i = 0; i <= 200; i++) {
      const u = -span / 2 + (i / 200) * span;
      ctx.lineTo(px(u), py(Math.min(waterZ, profile(u))));
    }
    ctx.lineTo(px(span / 2), py(waterZ));
    ctx.closePath();
    ctx.fillStyle = snapshot.flood > 0 ? 'rgba(122,106,60,0.75)' : 'rgba(70,150,180,0.65)';
    ctx.fill();

    // Thalweg marker.
    ctx.fillStyle = '#ffd27f';
    ctx.beginPath(); ctx.arc(px(shift), py(profile(shift)) - 6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '12px system-ui'; ctx.fillStyle = '#e8eef0'; ctx.textAlign = 'center';
    ctx.fillText('thalweg', px(shift), py(profile(shift)) + 16);

    // Helical flow arrows: an ellipse of circulation, surface towards the outer bank.
    if (bend > 0.1) {
      const cx = px(shift * 0.5), cy = (py(waterZ) + py(profile(shift))) / 2;
      const rx = hw / span * w * 0.55, ry = (py(profile(shift)) - py(waterZ)) * 0.35;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      const dir = outerRight ? 1 : -1;
      for (let k = 0; k < 6; k++) {
        const a = phase * dir + (k / 6) * Math.PI * 2;
        const x0 = cx + Math.cos(a) * rx, y0 = cy - Math.sin(a) * ry;
        const a1 = a + 0.35 * dir;
        const x1 = cx + Math.cos(a1) * rx, y1 = cy - Math.sin(a1) * ry;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const ang = Math.atan2(y1 - y0, x1 - x0);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - 6 * Math.cos(ang - 0.5), y1 - 6 * Math.sin(ang - 0.5));
        ctx.lineTo(x1 - 6 * Math.cos(ang + 0.5), y1 - 6 * Math.sin(ang + 0.5));
        ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      }
    }

    // Bank labels.
    ctx.fillStyle = '#e8eef0'; ctx.font = '13px system-ui';
    ctx.textAlign = outerRight ? 'right' : 'left';
    ctx.fillText(bend > 0.15 ? 'cut bank (outer)' : 'bank', outerRight ? w - 10 : 10, groundY - 10);
    ctx.textAlign = outerRight ? 'left' : 'right';
    ctx.fillText(bend > 0.15 ? 'point bar (inner)' : 'bank', outerRight ? 10 : w - 10, groundY - 10);

    title.textContent = `Cross-section (year ${Math.floor(snapshot.year)})`;
    text.textContent = bend > 0.15
      ? `Bend: deepest water (the thalweg) sits towards the ${outerRight ? 'right' : 'left'} outer bank, ${D.toFixed(1)} m deep. Width ${W} m. Arrows show the helical flow: surface water pushed to the outer bank, bed water returning inside.`
      : `Straight reach between bends: a shallow riffle, ${D.toFixed(1)} m deep and ${W} m wide, with little cross-channel circulation.`;
  }

  return { show, hide, refresh, draw, get open() { return !!current; } };
}
