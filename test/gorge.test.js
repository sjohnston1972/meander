// Rivers in gorges: an incising river keeps winding and cutting off loops
// (more slowly than on an open floodplain), and the floor of its gorge is
// planed rock under fresh alluvium.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY, FLOODPLAIN } from '../src/config.js';

const LONG = 300000;
const run = (e, years) => { for (let i = 0; i < years / DT; i++) e.tick(); };
const sinuosity = (e) => (e.x.length * e.ds) / VALLEY.length;

describe('rivers in gorges', () => {
  it('keep cutting off loops while incising at 4 m per 1000 years', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 4 });
    run(e, 3000);
    const before = e.oxbowCount;
    run(e, 4000);
    expect(e.incision).toBeGreaterThan(25);
    expect(e.oxbowCount - before).toBeGreaterThanOrEqual(3);
  });

  it('still wind when incising fast (15 m per 1000 years)', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 15 });
    run(e, 6000);
    expect(sinuosity(e)).toBeGreaterThan(1.3);
  });

  it('plane the bedrock to the bed under the river', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 10, alluviumDepth: 4 });
    run(e, 1500);
    const g = e.grid;
    let over = 0;
    for (const i of g.chanList) if (g.bedrock[i] > g.height[i] + 0.01) over++;
    expect(g.chanList.length).toBeGreaterThan(50);
    expect(over).toBe(0);
  });

  it('leave loops cut off while incising hanging, dry, above the river', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low', incisionRate: 15, infillRate: 0.2 });
    run(e, 200);
    const n = e.x.length;
    e.cutoff(Math.floor(n / 2) - 30, Math.floor(n / 2) + 30, 'neck');
    const o = e.oxbows[e.oxbows.length - 1];
    const id = o.id;
    run(e, 300); // the river cuts 4.5 m lower
    expect(e.oxbows.some((v) => v.id === id)).toBe(false);
    expect(e.hangingLoops.length).toBe(1);
    let above = 0;
    const j = e.nearestPoint(o.x[0], o.y[0]);
    for (const i of o.cells) if (e.grid.height[i] > e.level[j] + 2) above++;
    expect(above / o.cells.length).toBeGreaterThan(0.6);
    expect(e.findFeatures().some((f) => f.type === 'hangingloop')).toBe(true);
  });

  it('start their swinging inlet without a jump, new or loaded from an older save', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = new Engine({ ...defaults, quality: 'low', seed });
      const y0 = e.y[0];
      e.tick();
      expect(Math.abs(e.y[0] - y0)).toBeLessThan(1);
    }
    const e = new Engine({ ...defaults, quality: 'low', seed: 2 });
    run(e, 300);
    const st = e.serialize();
    delete st.inletY;
    const c = Engine.fromState(st);
    const y0 = c.y[0];
    c.tick();
    expect(Math.abs(c.y[0] - y0)).toBeLessThan(1);
  });

  it('let an oxbow on a river that is not cutting down silt up as usual', { timeout: LONG }, () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    run(e, 200);
    const n = e.x.length;
    e.cutoff(Math.floor(n / 2) - 30, Math.floor(n / 2) + 30, 'neck');
    run(e, 40);
    expect(e.oxbows.length).toBeGreaterThan(0);
    expect(e.hangingLoops.length).toBe(0);
  });
});
