import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults, CENTRELINE } from '../src/config.js';

const fast = { ...defaults, quality: 'low', floodFrequency: 0 };

describe('bedrock under the alluvium', () => {
  it('lies about the alluvium depth below the floodplain', () => {
    const e = new Engine(fast);
    const g = e.grid;
    let sum = 0;
    for (let i = 0; i < g.base.length; i++) sum += g.base[i] - g.bedrock[i];
    expect(sum / g.base.length).toBeCloseTo(defaults.alluviumDepth, 0);
  });

  it('moves when the alluvium depth changes', () => {
    const e = new Engine(fast);
    const before = e.grid.bedrock[5000];
    e.applySettings({ alluviumDepth: defaults.alluviumDepth + 5 });
    expect(e.grid.bedrock[5000]).toBeCloseTo(before - 5, 4);
  });

  it('a bank cut into bedrock erodes more slowly', () => {
    const e = new Engine(fast);
    e.tick();
    const i = Math.floor(e.x.length / 2);
    const k0 = e.localErodibility(i);
    e.grid.bedrock.fill(1e3); // rock right up to the surface
    const k1 = e.localErodibility(i);
    expect(k1).toBeLessThan(k0);
    expect(k1).toBeCloseTo(k0 * CENTRELINE.bedrockBankFactor, 6);
  });

  it('is unreached by a river that is not incising', { timeout: 60000 }, () => {
    const e = new Engine(fast);
    for (let t = 0; t < 2000; t++) e.tick();
    const g = e.grid;
    for (let i = 0; i < g.height.length; i++) expect(g.height[i] > g.bedrock[i]).toBe(true);
  });

  it('is saved and restored', () => {
    const e = new Engine(fast);
    const c = Engine.fromState(structuredClone(e.serialize()));
    expect(c.grid.bedrock[1234]).toBe(e.grid.bedrock[1234]);
  });
});
