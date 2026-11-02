// Landslide lakes: the ground a dammed river floods. Starting from the river
// just above the dam, fill every cell lower than the dam crest. River cells
// whose water is below the crest are the river below the dam: the lake does
// not spread into them. If the lake reaches that river anywhere but at the dam
// itself (more than `radius` from it), the water has a way round the debris
// and there is no lake: returns null. Otherwise returns the flooded dry
// cells (river and oxbow cells are left to their own water).
export function fillPond(grid, seed, crest, damX, damY, radius) {
  const { cols, rows, cell, height, channel, chanLevel } = grid;
  const n = height.length;
  const below = (j) => (channel[j] === 1 || channel[j] === 3) && chanLevel[j] < crest - 0.05;
  if (height[seed] >= crest || below(seed)) return new Int32Array(0);
  const id = ++grid.stampId;
  const stamp = grid.stamp;
  const queue = new Int32Array(n);
  const out = [];
  let head = 0, tail = 0;
  queue[tail++] = seed;
  stamp[seed] = id;
  const r2 = radius * radius;
  while (head < tail) {
    const i = queue[head++];
    if (!channel[i]) out.push(i);
    if (out.length > n / 4) return null; // spilling down the whole valley
    const cx = i % cols, cy = (i - cx) / cols;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = cy + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (stamp[j] === id || height[j] >= crest) continue;
      if (below(j)) {
        const dx = (nx + 0.5) * cell - damX, dy = (ny + 0.5) * cell - damY;
        if (dx * dx + dy * dy > r2) return null; // round the side of the dam
        continue;
      }
      stamp[j] = id;
      queue[tail++] = j;
    }
  }
  return Int32Array.from(out);
}
