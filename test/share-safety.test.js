import { describe, it, expect } from 'vitest';
import { decodeSettings } from '../src/ui/share.js';
import { defaults, RANGES } from '../src/config.js';

describe('share link safety', () => {
  it('survives bad percent-encoding', () => {
    expect(() => decodeSettings('#seed=%&channelWidth=%zz', defaults)).not.toThrow();
    expect(decodeSettings('#seed=%&channelWidth=70', defaults).channelWidth).toBe(70);
  });

  it('clamps numbers to the control ranges', () => {
    const d = decodeSettings('#channelWidth=0&meanDischarge=-5&alpha=-1&yearsPerSecond=1e9', defaults);
    expect(d.channelWidth).toBe(RANGES.channelWidth[0]);
    expect(d.meanDischarge).toBe(RANGES.meanDischarge[0]);
    expect(d.alpha).toBe(RANGES.alpha[0]);
    expect(d.yearsPerSecond).toBe(RANGES.yearsPerSecond[1]);
  });

  it('rejects unknown choices for start shape and quality', () => {
    const d = decodeSettings('#startShape=banana&quality=ultra', defaults);
    expect(d.startShape).toBe(defaults.startShape);
    expect(d.quality).toBe(defaults.quality);
  });

  it('every numeric default sits inside its range', () => {
    for (const [k, [lo, hi]] of Object.entries(RANGES)) {
      expect(defaults[k]).toBeGreaterThanOrEqual(lo);
      expect(defaults[k]).toBeLessThanOrEqual(hi);
    }
  });
});
