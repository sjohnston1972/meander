// Rivers in gorges: an incising river keeps winding and cutting off loops
// (more slowly than on an open floodplain), and the floor of its gorge is
// planed rock under fresh alluvium.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, DT, VALLEY } from '../src/config.js';

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
});
