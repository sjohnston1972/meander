// Regressions found by the v1.5/v1.6 review: each test pins one fix.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, CENTRELINE } from '../src/config.js';
import { cellIndex } from '../src/engine/floodplain.js';
import { encodeSave, decodeSave } from '../src/engine/savefile.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years * 4; i++) e.tick(); return e; };
const bends = (e, count) => {
  const idx = [];
  for (let i = 10; i < e.x.length - 10; i++) idx.push(i);
  idx.sort((a, b) => Math.abs(e.curv[b]) - Math.abs(e.curv[a]));
  const out = [];
  for (const i of idx) if (out.length < count && out.every((j) => Math.abs(j - i) > 40)) out.push(i);
  return out;
};

describe('review fixes', () => {
  it('bridges do not stop the river cutting off its other loops (it never runs into itself)', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 300);
    for (const i of bends(e, 5)) e.build('bridge', e.x[i], e.y[i]);
    const W = e.settings.channelWidth;
    const minSep = Math.round(CENTRELINE.minSeparationWidths / CENTRELINE.spacingFactor);
    let worst = Infinity;
    for (let y = 0; y < 1500; y += 50) {
      run(e, 50);
      for (let i = 0; i < e.x.length; i += 2) for (let j = i + minSep; j < e.x.length; j += 2) {
        const d = Math.hypot(e.x[i] - e.x[j], e.y[i] - e.y[j]);
        if (d < worst) worst = d;
      }
    }
    expect(worst).toBeGreaterThan(0.3 * W);
  });

  it('a weir pool fills with what arrives, not with gravel made from nothing', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 300);
    const j = Math.floor(e.x.length * 0.5);
    e.build('weir', e.x[j], e.y[j]);
    run(e, 100);
    // Fed half gravel, no deposit can be coarser than gravel-first sorting
    // makes it (0.75); before the fix the pool reached 0.83.
    let most = 0;
    for (let i = 0; i < e.active; i++) most = Math.max(most, e.grain[i]);
    expect(most).toBeLessThan(0.76);
  });

  it('restores bars to match the bed exactly (the channel segments are saved)', { timeout: LONG }, () => {
    const a = run(new Engine({ ...defaults, quality: 'low', sedimentSupply: 0.2 }), 400);
    const b = Engine.fromState(decodeSave(encodeSave(a.serialize())));
    a.tick(); b.tick();
    expect(Array.from(b.grid.surface)).toEqual(Array.from(a.grid.surface));
  });

  it('a log jam backs the water up over the bed, without raising the bed', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', channelWidth: 22, logJams: true });
    for (let y = 0; y < 800 && !e.jams.length; y += 10) run(e, 10);
    expect(e.jams.length).toBeGreaterThan(0);
    e.tick();
    const jm = e.jams[0];
    const j = e.nearestPoint(jm.x, jm.y);
    const i = Math.max(1, j - 3);
    expect(e.backwater[i]).toBeGreaterThan(0.1);
    const c = cellIndex(e.grid, e.x[i], e.y[i]);
    const normal = e.refLevel[i] + e.aggr[i];
    expect(e.grid.height[c]).toBeLessThan(normal - 0.2); // carved below the normal water, not the backed-up water
    expect(e.grid.chanLevel[c]).toBeLessThan(e.level[i] - 0.05);
  });

  it('a weir the river has left (a straightening round it) goes', { timeout: LONG }, () => {
    const e = run(new Engine({ ...defaults, quality: 'low' }), 300);
    const [i] = bends(e, 1);
    e.build('weir', e.x[i], e.y[i]);
    e.build('straighten', e.x[i], e.y[i]);
    run(e, 5);
    expect(e.dams.some((d) => d.kind === 'weir')).toBe(false);
    expect(e.works.some((w) => w.kind === 'weir')).toBe(false);
  });

  it('beaver dams on the tributary go when beavers are switched off', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', beavers: true, tributary: 0.2 });
    for (let y = 0; y < 600 && !(e.trib.dams || []).length; y += 10) run(e, 10);
    expect(e.trib.dams.length).toBeGreaterThan(0);
    e.applySettings({ beavers: false });
    run(e, 3);
    expect(e.trib.dams.length).toBe(0);
  });

  it('beaver ponds do not freeze long reaches of river', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', channelWidth: 22, beavers: true });
    let frozen = 0, samples = 0;
    for (let y = 0; y < 400; y += 5) {
      run(e, 5);
      if (!e.dams.some((d) => d.kind === 'beaver')) continue;
      samples++;
      const pool = e.pooledPoints();
      let still = 0;
      for (let i = 0; i < pool.length; i++) if (pool[i] && Math.abs(e.rate[i] || 0) < 1e-9) still++;
      frozen += still / e.x.length;
    }
    expect(samples).toBeGreaterThan(0);
    expect(frozen / samples).toBeLessThan(0.06);
  });
});
