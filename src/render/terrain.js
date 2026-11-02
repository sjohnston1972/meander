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
const GV = rgb(palette[SURFACE.GRAVEL]), GVW = rgb(new THREE.Color(0x837c6d)); // braid gravel, dry and wet
const PAL = {};
for (const [k, c] of Object.entries(palette)) PAL[k] = rgb(c);
const BR = rgb(new THREE.Color(RENDER.bedrockColour));

// Fine ground detail for close views: a grey grain texture multiplied into
// the vertex colours, and matching bumps. Both tile every few metres in world
// space and are mipmapped, so from afar they average out to a flat tint.
function makeDetailTextures(size = 256) {
  const grain = new Uint8Array(size * size * 4);
  const bump = new Float32Array(size * size);
  const h = (x, y, f, s) => Math.sin(x * f + Math.sin(y * f * 0.7 + s) * 1.7) * Math.cos(y * f * 1.1 - Math.sin(x * f * 0.5 + s) * 1.3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Periodic octaves (frequencies are whole multiples of 2*pi/size) so the tile repeats seamlessly.
    const w = (2 * Math.PI) / size;
    const v = 0.5 * h(x, y, w * 3, 0.3) + 0.3 * h(x, y, w * 7, 1.9) + 0.2 * h(x, y, w * 17, 4.1);
    const r = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const speck = (r - Math.floor(r)) - 0.5;
    bump[y * size + x] = v * 0.7 + speck * 0.3;
    const g = Math.max(0, Math.min(255, Math.round((0.9 + v * 0.06 + speck * 0.07) * 255)));
    const i = (y * size + x) * 4;
    grain[i] = grain[i + 1] = grain[i + 2] = g; grain[i + 3] = 255;
  }
  const normals = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (a, b) => bump[((b + size) % size) * size + ((a + size) % size)];
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
    const nx = -dx * 1.4, ny = -dy * 1.4;
    const l = Math.hypot(nx, ny, 1);
    const i = (y * size + x) * 4;
    normals[i] = (nx / l * 0.5 + 0.5) * 255; normals[i + 1] = (ny / l * 0.5 + 0.5) * 255; normals[i + 2] = (1 / l * 0.5 + 0.5) * 255; normals[i + 3] = 255;
  }
  const tex = (data, colour) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: tex(grain, true), normalMap: tex(normals, false) };
}

export function createTerrain() {
  let cols = 0, rows = 0, cell = 0;
  let geometry = null, skirtGeometry = null;
  let jitter = null, meadow = null, edge = null, disp = null;
  let adaptive = false; // quads split along their flatter diagonal (only while cutting)
  let bedrock = null; // top of the bedrock per cell, sent only when it moves
  const edgeList = [];
  const detail = makeDetailTextures();
  // The grain averages to about 0.9 (in sRGB); the colour factor brings the
  // overall tone back to what the vertex colours say.
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
    map: detail.map, normalMap: detail.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
    color: new THREE.Color(1.24, 1.24, 1.24),
  });
  const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1, side: THREE.DoubleSide }); // seen from outside the valley too
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  const skirt = new THREE.Mesh(new THREE.BufferGeometry(), skirtMaterial);
  const group = new THREE.Group();
  group.add(mesh, skirt);

  function build(c, r, cs) {
    cols = c; rows = r; cell = cs;
    const n = cols * rows;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uvs = new Float32Array(n * 2);
    jitter = new Float32Array(n);
    meadow = new Float32Array(n);
    edge = new Float32Array(n * 3);
    disp = new Float32Array(n);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      meadow[i] = patchNoise(cx, cy, cols / 14) * 0.6 + patchNoise(cx, cy, cols / 60) * 0.4;
      pos[i * 3] = (cx + 0.5) * cell - VALLEY.length / 2;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = (cy + 0.5) * cell - VALLEY.width / 2;
      uvs[i * 2] = ((cx + 0.5) * cell) / RENDER.detailMetres;
      uvs[i * 2 + 1] = ((cy + 0.5) * cell) / RENDER.detailMetres;
      nor[i * 3 + 1] = 1;
      // Small deterministic per-vertex tint variation so flat colours do not look plastic.
      const h = Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453;
      jitter[i] = 0.92 + (h - Math.floor(h)) * 0.16;
    }
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    splitQuads(idx, null);
    adaptive = false;
    geometry?.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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

  // Two triangles per grid quad. With `h`, each quad is split along the
  // diagonal whose corners differ least in height, so a diagonal cliff is not
  // drawn as saw teeth; without it, every quad splits the same way.
  function splitQuads(idx, h) {
    let k = 0;
    for (let cy = 0; cy < rows - 1; cy++) for (let cx = 0; cx < cols - 1; cx++) {
      const a = cy * cols + cx, b = a + 1, c = a + cols, d = c + 1;
      if (h && Math.abs(h[a] - h[d]) < Math.abs(h[b] - h[c])) {
        idx[k++] = a; idx[k++] = c; idx[k++] = d;
        idx[k++] = a; idx[k++] = d; idx[k++] = b;
      } else {
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
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
    const incision = st.incision || 0;
    for (let cx = 0; cx < cols; cx++) baseCol[cx] = st.valleySlope * (VALLEY.length - (cx + 0.5) * cell) + st.bankHeight - incision;
    // Display heights: steep dry ground is softened a little, so grid-stepped
    // terrace scarps read as slopes, not saw teeth. Only dry neighbours count,
    // so a bank never sinks towards the riverbed under the water ribbon.
    const W = SURFACE.WATER;
    const steep = cell * 0.8;
    const cutting = !!st.cutting; // only an incising river has tall scarps or exposed rock
    let sum = 0, cnt = 0, lo = 0, hi = 0;
    const take = (j) => {
      if (surface[j] === W) return;
      const hj = height[j];
      sum += hj; cnt++;
      if (hj < lo) lo = hj; else if (hj > hi) hi = hj;
    };
    if (!cutting) disp.set(height);
    else for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        let h = height[i];
        if (cx > 0 && cx < cols - 1 && cy > 0 && cy < rows - 1 && surface[i] !== W) {
          sum = 0; cnt = 0; lo = h; hi = h;
          take(i - 1); take(i + 1); take(i - cols); take(i + cols);
          if (cnt > 0 && hi - lo > steep) h = 0.5 * h + 0.5 * (sum / cnt);
        }
        disp[i] = h;
      }
    }
    let minY = Infinity;
    for (let cy = 0; cy < rows; cy++) {
      const y0 = cy > 0 ? cy - 1 : cy, y1 = cy < rows - 1 ? cy + 1 : cy;
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        pos[i * 3 + 1] = disp[i] * ex + waterLevelBias;
        if (pos[i * 3 + 1] < minY) minY = pos[i * 3 + 1];
        const x0 = cx > 0 ? cx - 1 : cx, x1 = cx < cols - 1 ? cx + 1 : cx;
        const dhx = (disp[cy * cols + x1] - disp[cy * cols + x0]) * inv * (x1 - x0 === 2 ? 1 : 2);
        const dhz = (disp[y1 * cols + cx] - disp[y0 * cols + cx]) * inv * (y1 - y0 === 2 ? 1 : 2);
        const len = Math.sqrt(dhx * dhx + 1 + dhz * dhz);
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
        } else if (s === SURFACE.GRAVEL) {
          // Braid bars: damp grey-brown at the water's edge, paler on the tops, greening as plants take hold.
          let k = damp * 0.7 + (rel < -0.8 ? 0.3 : 0);
          if (k > 1) k = 1;
          const m = meadow[i] * 0.12;
          r = GV[0] + (GVW[0] - GV[0]) * k + m * 0.1; g = GV[1] + (GVW[1] - GV[1]) * k + m * 0.08; b = GV[2] + (GVW[2] - GV[2]) * k;
          k = v * 1.3 > 1 ? 1 : v * 1.3;
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
        const cos = 1 / len;
        // Bedrock shows in steep walls cut below its top, in faint strata.
        // Judge the face around this vertex (its neighbours' heights), since
        // a wall one cell wide has no vertex part-way up it.
        if (cutting && bedrock) {
          const h0 = height[i], ha = height[cy * cols + x0], hb = height[cy * cols + x1], hc = height[y0 * cols + cx], hd = height[y1 * cols + cx];
          const lo = Math.min(h0, ha, hb, hc, hd), hi = Math.max(h0, ha, hb, hc, hd);
          const span = hi - lo;
          if (s === W && hi - h0 > st.bankHeight + 2) {
            // The river's edge at the foot of a bluff: the face above the water is bare.
            r = PAL[2][0]; g = PAL[2][1]; b = PAL[2][2];
          }
          if (span > 1.5 && lo < bedrock[i]) {
            const frac = Math.min(1, (Math.min(bedrock[i], hi) - lo) / span);
            const k = frac * Math.min(1, Math.max(0, (span / cell - 0.3) * 2));
            if (k > 0 && (s !== W || hi - h0 > st.bankHeight + 2)) {
              const band = 0.84 + 0.16 * Math.sin(h0 * 3.7 + meadow[i] * 3);
              r += (BR[0] * band - r) * k; g += (BR[1] * band - g) * k; b += (BR[2] * band - b) * k;
            }
          }
        }
        // Slope darkening gives banks and ridges definition; bare earth faces darkest.
        const shade = s === SURFACE.EARTH ? 0.55 + 0.45 * cos : 0.7 + 0.3 * cos;
        const j = jitter[i] * shade;
        col[i * 3] = r * j; col[i * 3 + 1] = g * j; col[i * 3 + 2] = b * j;
      }
    }
    // Soften the grid-stepped bank line: cells touching water take the 3x3
    // average of their neighbours' colours (colour only; heights stay put).
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
    if (cutting || adaptive) {
      splitQuads(geometry.index.array, cutting ? disp : null);
      geometry.index.needsUpdate = true;
      adaptive = cutting;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeBoundingSphere();

    // The skirt reaches below the far ground plane and below the deepest
    // terrain, so an incised channel leaving the valley does not show a gap.
    const skirtBottom = Math.min(-40, minY - 10);
    const sp = skirtGeometry.attributes.position.array;
    const perim = 2 * cols + 2 * rows;
    for (let e = 0; e < perim; e++) {
      const i = perimeterIndex(e);
      sp[e * 6] = pos[i * 3]; sp[e * 6 + 1] = pos[i * 3 + 1]; sp[e * 6 + 2] = pos[i * 3 + 2];
      sp[e * 6 + 3] = pos[i * 3]; sp[e * 6 + 4] = skirtBottom; sp[e * 6 + 5] = pos[i * 3 + 2];
    }
    skirtGeometry.attributes.position.needsUpdate = true;
    skirtGeometry.computeBoundingSphere();
  }

  // The bedrock surface arrives only when it moves; keep the latest copy.
  function setBedrock(b) { bedrock = b; }

  // Height (world y) at an engine position, for placing things on the ground.
  function heightAt(snapshot, x, y, exaggeration) {
    const g = snapshot.grid;
    const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell)));
    const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell)));
    return g.height[cy * g.cols + cx] * exaggeration;
  }

  return { group, mesh, update, heightAt, setBedrock };
}
