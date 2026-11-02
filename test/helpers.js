// Shared test helpers.

function fnv(h, bytes) {
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
// A short hash of the river and the ground, for exact-equality checks.
export function fingerprint(e) {
  let h = 2166136261;
  h = fnv(h, new Uint8Array(Float64Array.from(e.x).buffer));
  h = fnv(h, new Uint8Array(Float64Array.from(e.y).buffer));
  h = fnv(h, new Uint8Array(e.grid.height.buffer.slice(0)));
  h = fnv(h, e.grid.surface);
  return `${h.toString(16)}:${e.x.length}:${e.oxbows.length}`;
}

