// Saving a river to a .meander file and opening one again. Files are gzip
// compressed when the browser can (CompressionStream); plain files open too.
import { encodeSave, decodeSave } from '../engine/savefile.js';

const MAX_BYTES = 256 * 1024 * 1024; // a High-quality save is about 20 MB

async function pipe(bytes, stream) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { reader.cancel(); throw new Error('file is too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function packRiver(state) {
  const raw = encodeSave(state);
  if (typeof CompressionStream === 'undefined') return raw;
  return pipe(raw, new CompressionStream('gzip'));
}

export async function unpackRiver(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error('file is too large');
  let raw = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot open compressed saves');
    raw = await pipe(bytes, new DecompressionStream('gzip'));
  }
  return decodeSave(raw);
}

export function download(bytes, name, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Ask the visitor for a file; resolves to its bytes, or null if cancelled.
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? new Uint8Array(await f.arrayBuffer()) : null);
    };
    input.click();
  });
}
