import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine/engine.js';
import { defaults } from '../src/config.js';
import { packRiver, unpackRiver } from '../src/ui/files.js';
import { encodeSave } from '../src/engine/savefile.js';

describe('.meander files', () => {
  it('pack compresses and unpack restores', async () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    for (let i = 0; i < 100; i++) e.tick();
    const st = e.serialize();
    const packed = await packRiver(st);
    expect(packed[0]).toBe(0x1f);
    expect(packed.length).toBeLessThan(encodeSave(st).length);
    const back = await unpackRiver(packed);
    expect(back.year).toBe(st.year);
    expect(Array.from(back.y)).toEqual(Array.from(st.y));
  });

  it('opens an uncompressed save too', async () => {
    const e = new Engine({ ...defaults, quality: 'low' });
    const back = await unpackRiver(encodeSave(e.serialize()));
    expect(back.grid.cols).toBe(256);
  });

  it('rejects a corrupt gzip file', async () => {
    await expect(unpackRiver(new Uint8Array([0x1f, 0x8b, 1, 2, 3]))).rejects.toThrow();
  });
});
