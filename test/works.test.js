// Engineering works: straightening, weirs, bridges, embankments.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, WORKS } from '../src/config.js';
import { segmentDistance } from '../src/engine/works.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';
import { fingerprint } from './helpers.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };
const make = () => run(new Engine({ ...defaults, quality: 'low' }), 300);
const mid = (e) => Math.floor(e.x.length * 0.45);
// The sharpest bend in the middle half of the river.
const bend = (e) => {
  let best = Math.floor(e.x.length / 2);
  for (let i = Math.floor(e.x.length / 4); i < Math.floor(e.x.length * 0.75); i++) if (Math.abs(e.curv[i]) > Math.abs(e.curv[best])) best = i;
  return best;
};

describe('engineering works', () => {
  it('straightening cuts a straight lined reach, leaves the old bends as a lake, and holds it there', { timeout: LONG }, () => {
    const e = make();
    const j = bend(e);
    const ox = e.oxbows.length;
    expect(e.build('straighten', e.x[j], e.y[j])).toBe(true);
    const w = e.works[0];
    expect(e.oxbows.length).toBe(ox + 1);
    let on = 0;
    for (let i = 0; i < e.x.length; i++) if (segmentDistance(e.x[i], e.y[i], w.x0, w.y0, w.x1, w.y1) < 1) on++;
    expect(on).toBeGreaterThan(10);
    expect(w.cells.length).toBeGreaterThan(0);
    for (const c of w.cells) expect(e.grid.rock[c]).toBe(1);
    run(e, 200);
    // Still there (re-spacing only rounds its ends a little).
    let still = 0;
    for (let i = 0; i < e.x.length; i++) if (segmentDistance(e.x[i], e.y[i], w.x0, w.y0, w.x1, w.y1) < 0.25 * e.settings.channelWidth) still++;
    expect(still).toBeGreaterThan(on * 0.8);
  });

  it('a weir holds the water up, fills with sediment behind it and starves the river below', { timeout: LONG }, () => {
    const e = make();
    const j = mid(e);
    expect(e.build('weir', e.x[j], e.y[j])).toBe(true);
    const d = e.dams.find((v) => v.kind === 'weir');
    expect(d).toBeTruthy();
    // While its pool fills, the river leaving it carries less than comes in.
    run(e, 1);
    const k0 = e.nearestPoint(d.x, d.y);
    expect(e.loadRatio[Math.min(e.x.length - 1, k0 + 2)]).toBeLessThan(0.8);
    run(e, 300);
    expect(e.dams.includes(d)).toBe(true); // concrete: still there
    const k = e.nearestPoint(d.x, d.y);
    let above = 0;
    for (let i = Math.max(0, k - 30); i < k; i++) above = Math.max(above, e.aggr[i]);
    expect(above).toBeGreaterThan(0.3);
  });

  it('a bridge holds the river in place beneath it', { timeout: LONG }, () => {
    const e = make();
    const j = mid(e);
    const bx = e.x[j], by = e.y[j];
    e.build('bridge', bx, by);
    run(e, 300);
    const k = e.nearestPoint(bx, by);
    expect(Math.hypot(e.x[k] - bx, e.y[k] - by)).toBeLessThan(e.settings.channelWidth * 0.5);
  });

  it('embankments stand above the floodplain beside the river', { timeout: LONG }, () => {
    const e = make();
    const j = mid(e);
    e.build('embankment', e.x[j], e.y[j]);
    const w = e.works[0];
    expect(w.cells.length).toBeGreaterThan(20);
    let raised = 0;
    for (const c of w.cells) if (e.grid.height[c] >= e.grid.base[c] + WORKS.embankHeight - 0.01) raised++;
    expect(raised).toBeGreaterThan(w.cells.length * 0.8);
  });

  it('removing works takes the weir and the lining away', { timeout: LONG }, () => {
    const e = make();
    const j = mid(e);
    e.build('straighten', e.x[j], e.y[j]);
    const lining = e.works[0].cells;
    const k = Math.floor(e.x.length * 0.75);
    e.build('weir', e.x[k], e.y[k]);
    expect(e.build('remove', 0, 0)).toBe(true);
    expect(e.works.length).toBe(0);
    expect(e.dams.some((d) => d.kind === 'weir')).toBe(false);
    for (const c of lining) expect(e.grid.rock[c]).toBe(0);
  });

  it('refuses a work away from the river, and says why', () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    expect(e.build('bridge', 3000, 50)).toBe(false);
    expect(e.events.some((v) => v.type === 'buildFailed')).toBe(true);
  });

  it('carries on exactly after save and restore, and refuses damaged works', { timeout: LONG }, () => {
    const a = make();
    const j = mid(a);
    a.build('straighten', a.x[j], a.y[j]);
    const k = Math.floor(a.x.length * 0.75);
    a.build('weir', a.x[k], a.y[k]);
    a.build('bridge', a.x[30], a.y[30]);
    const b = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    run(a, 50); run(b, 50);
    expect(fingerprint(b)).toBe(fingerprint(a));
    const bad = a.serialize();
    bad.works[0].kind = 'castle';
    expect(() => decodeSave(encodeSave(bad))).toThrow();
  });
});
