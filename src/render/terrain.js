// Landscape mesh built from the floodplain height grid, coloured by surface type.
import * as THREE from 'three';
import { VALLEY, SURFACE, RENDER } from '../config.js';

// Smooth value noise on the cell grid for broad meadow/lush patches.
function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function patchNoise(cx, cy, scale) {
  const x = cx / scale, y = cy / scale;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

const palette = {};
for (const [k, v] of Object.entries(RENDER.surfaceColours)) palette[k] = new THREE.Color(v);
const grassDry = new THREE.Color(0x9aa552);
const grassLush = new THREE.Color(0x4c7d2f);
const grassWet = new THREE.Color(0x3f6a2c);   // low, damp ground
const grassMeadow = new THREE.Color(0x86a34a); // broad open patches
const sandWet = new THREE.Color(0xb9a46e);     // bar surface near the water
const rgb = (c) => [c.r, c.g, c.b];
const GD = rgb(grassDry), GL = rgb(grassLush), GW = rgb(grassWet), GM = rgb(grassMeadow);
const SA = rgb(palette[SURFACE.SAND]), SW = rgb(sandWet);
const PAL = {};
for (const [k, c] of Object.entries(palette)) PAL[k] = rgb(c);

export function createTerrain() {
  let cols = 0, rows = 0, cell = 0;
  let geometry = null, skirtGeometry = null;
  let jitter = null, meadow = null, edge = null;
  const edgeList = [];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1 });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  const skirt = new THREE.Mesh(new THREE.BufferGeometry(), skirtMaterial);
  const group = new THREE.Group();
  group.add(mesh, skirt);

  function build(c, r, cs) {
    cols = c; rows = r; cell = cs;
    const n = cols * rows;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    jitter = new Float32Array(n);
    meadow = new Float32Array(n);
    edge = new Float32Array(n * 3);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      meadow[i] = patchNoise(cx, cy, cols / 14) * 0.6 + patchNoise(cx, cy, cols / 60) * 0.4;
      pos[i * 3] = (cx + 0.5) * cell - VALLEY.length / 2;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = (cy + 0.5) * cell - VALLEY.width / 2;
      nor[i * 3 + 1] = 1;
      // Small deterministic per-vertex tint variation so flat colours do not look plastic.
      const h = Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453;
      jitter[i] = 0.92 + (h - Math.floor(h)) * 0.16;
    }
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let k = 0;
    for (let cy = 0; cy < rows - 1; cy++) for (let cx = 0; cx < cols - 1; cx++) {
      const a = cy * cols + cx, b = a + 1, c = a + cols, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    geometry?.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    mesh.geometry = geometry;

    // Skirt: a wall around the valley edge down to below the ground plane.
    const perim = 2 * cols + 2 * rows;
    const sp = new Float32Array(perim * 2 * 3);
    const si = new Uint32Array(perim * 6);
    let m = 0;
    for (let e = 0; e < perim; e++) {
      const a = e * 2, b = a + 1, c = ((e + 1) % perim) * 2, d = c + 1;
      si[m++] = a; si[m++] = b; si[m++] = c;
      si[m++] = b; si[m++] = d; si[m++] = c;
    }
    skirtGeometry?.dispose();
    skirtGeometry = new THREE.BufferGeometry();
    skirtGeometry.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    skirtGeometry.setIndex(new THREE.BufferAttribute(si, 1));
    skirt.geometry = skirtGeometry;
  }

  // Perimeter cell indices in order (top row, right column, bottom row reversed, left column reversed).
  function perimeterIndex(e) {
    if (e < cols) return e;                                   // top row, cy = 0
    e -= cols;
    if (e < rows) return e * cols + (cols - 1);               // right column
    e -= rows;
    if (e < cols) return (rows - 1) * cols + (cols - 1 - e);  // bottom row
    e -= cols;
    return (rows - 1 - e) * cols;                             // left column
  }

  function update(snapshot, exaggeration) {
    const g = snapshot.grid;
    if (g.cols !== cols || g.rows !== rows) build(g.cols, g.rows, g.cell);
    const { height, surface, veg } = g;
    const pos = geometry.attributes.position.array;
    const nor = geometry.attributes.normal.array;
    const col = geometry.attributes.color.array;
    const ex = exaggeration;
    const inv = ex / (2 * cell);
    const waterLevelBias = 0;
    const st = snapshot.settings;
    // Reference floodplain height without the relief noise: low ground is damper, ridges drier.
    const baseCol = new Float32Array(cols);
    for (let cx = 0; cx < cols; cx++) baseCol[cx] = st.valleySlope * (VALLEY.length - (cx + 0.5) * cell) + st.bankHeight;
    for (let cy = 0; cy < rows; cy++) {
      const y0 = cy > 0 ? cy - 1 : cy, y1 = cy < rows - 1 ? cy + 1 : cy;
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        pos[i * 3 + 1] = height[i] * ex + waterLevelBias;
        const x0 = cx > 0 ? cx - 1 : cx, x1 = cx < cols - 1 ? cx + 1 : cx;
        const dhx = (height[cy * cols + x1] - height[cy * cols + x0]) * inv * (x1 - x0 === 2 ? 1 : 2);
        const dhz = (height[y1 * cols + cx] - height[y0 * cols + cx]) * inv * (y1 - y0 === 2 ? 1 : 2);
        const len = Math.hypot(dhx, 1, dhz);
        nor[i * 3] = -dhx / len; nor[i * 3 + 1] = 1 / len; nor[i * 3 + 2] = -dhz / len;

        const s = surface[i];
        const v = veg[i] / 255;
        const rel = height[i] - baseCol[cx]; // metres above (+) or below (-) the floodplain
        const damp = rel < 0 ? (rel < -1.5 ? 1 : -rel / 1.5) : 0; // 1 in hollows, scars and old bars
        const dry = rel > 0 ? (rel > 1 ? 1 : rel) : 0;            // 1 on levee crests
        let r, g, b;
        if (s === SURFACE.GRASS) {
          // dry -> lush by vegetation, then meadow patches, damp hollows, dry crests
          r = GD[0] + (GL[0] - GD[0]) * v; g = GD[1] + (GL[1] - GD[1]) * v; b = GD[2] + (GL[2] - GD[2]) * v;
          let k = meadow[i] * 0.45 * (1 - damp);
          r += (GM[0] - r) * k; g += (GM[1] - g) * k; b += (GM[2] - b) * k;
          k = damp * 0.6;
          r += (GW[0] - r) * k; g += (GW[1] - g) * k; b += (GW[2] - b) * k;
          k = dry * 0.35;
          r += (GD[0] - r) * k; g += (GD[1] - g) * k; b += (GD[2] - b) * k;
        } else if (s === SURFACE.SAND) {
          let k = damp * 0.5;
          r = SA[0] + (SW[0] - SA[0]) * k; g = SA[1] + (SW[1] - SA[1]) * k; b = SA[2] + (SW[2] - SA[2]) * k;
          k = v * 1.2 > 1 ? 1 : v * 1.2;
          r += (GL[0] - r) * k; g += (GL[1] - g) * k; b += (GL[2] - b) * k;
        } else if (s === SURFACE.WATER) {
          r = PAL[5][0]; g = PAL[5][1]; b = PAL[5][2];
        } else if (s === SURFACE.ROCK) {
          const k = meadow[i] * 0.15;
          r = PAL[4][0] + (GD[0] - PAL[4][0]) * k; g = PAL[4][1] + (GD[1] - PAL[4][1]) * k; b = PAL[4][2] + (GD[2] - PAL[4][2]) * k;
        } else {
          const p = PAL[s] || PAL[0];
          const k = v * 1.2 > 1 ? 1 : v * 1.2;
          r = p[0] + (GW[0] - p[0]) * k; g = p[1] + (GW[1] - p[1]) * k; b = p[2] + (GW[2] - p[2]) * k;
        }
        // Slope darkening gives banks and ridges definition; bare earth faces darkest.
        const cos = 1 / len;
        const shade = s === SURFACE.EARTH ? 0.55 + 0.45 * cos : 0.7 + 0.3 * cos;
        const j = jitter[i] * shade;
        col[i * 3] = r * j; col[i * 3 + 1] = g * j; col[i * 3 + 2] = b * j;
      }
    }
    // Soften the grid-stepped bank line: cells touching water take the 3x3
    // average of their neighbours' colours (colour only; heights stay put).
    const W = SURFACE.WATER;
    for (let cy = 1; cy < rows - 1; cy++) {
      for (let cx = 1; cx < cols - 1; cx++) {
        const i = cy * cols + cx;
        if (surface[i] === W) continue;
        if (surface[i - 1] !== W && surface[i + 1] !== W && surface[i - cols] !== W && surface[i + cols] !== W) continue;
        let r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = (i + dy * cols + dx) * 3;
          r += col[k]; g += col[k + 1]; b += col[k + 2];
        }
        edge[i * 3] = r / 9; edge[i * 3 + 1] = g / 9; edge[i * 3 + 2] = b / 9;
        edgeList.push(i);
      }
    }
    for (const i of edgeList) { col[i * 3] = edge[i * 3]; col[i * 3 + 1] = edge[i * 3 + 1]; col[i * 3 + 2] = edge[i * 3 + 2]; }
    edgeList.length = 0;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeBoundingSphere();

    const sp = skirtGeometry.attributes.position.array;
    const perim = 2 * cols + 2 * rows;
    for (let e = 0; e < perim; e++) {
      const i = perimeterIndex(e);
      sp[e * 6] = pos[i * 3]; sp[e * 6 + 1] = pos[i * 3 + 1]; sp[e * 6 + 2] = pos[i * 3 + 2];
      sp[e * 6 + 3] = pos[i * 3]; sp[e * 6 + 4] = -40; sp[e * 6 + 5] = pos[i * 3 + 2];
    }
    skirtGeometry.attributes.position.needsUpdate = true;
    skirtGeometry.computeBoundingSphere();
  }

  // Height (world y) at an engine position, for placing things on the ground.
  function heightAt(snapshot, x, y, exaggeration) {
    const g = snapshot.grid;
    const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell)));
    const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell)));
    return g.height[cy * g.cols + cx] * exaggeration;
  }

  return { group, mesh, update, heightAt };
}
