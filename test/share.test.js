import { describe, it, expect } from 'vitest';
import { encodeSettings, decodeSettings } from '../src/ui/share.js';
import { defaults } from '../src/config.js';

describe('share links', () => {
  it('round-trips changed settings and the seed', () => {
    const s = { ...defaults, seed: 4242, channelWidth: 75, hardRock: true, startShape: 'sine', showTrails: true };
    const hash = encodeSettings(s, defaults);
    expect(hash).toContain('seed=4242');
    expect(hash).not.toContain('channelDepth'); // unchanged keys are left out
    expect(decodeSettings('#' + hash, defaults)).toEqual(s);
  });

  it('encodes only the seed when nothing else changed', () => {
    expect(encodeSettings({ ...defaults }, defaults)).toBe(`seed=${defaults.seed}`);
  });

  it('falls back to defaults on garbage, unknown keys and bad values', () => {
    expect(decodeSettings('#garbage', defaults)).toEqual(defaults);
    expect(decodeSettings('', defaults)).toEqual(defaults);
    expect(decodeSettings('#nope=1&channelWidth=abc&hardRock=maybe&seed=7', defaults)).toEqual({ ...defaults, seed: 7 });
  });
});
