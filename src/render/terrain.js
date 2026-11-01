// Landscape mesh built from the floodplain height grid, coloured by surface type.
import * as THREE from 'three';
import { VALLEY, SURFACE, RENDER } from '../config.js';

const palette = {};
for (const [k, v] of Object.entries(RENDER.surfaceColours)) palette[k] = new THREE.Color(v);
const grassDry = new THREE.Color(0x9aa552);
const grassLush = new THREE.Color(0x4c7d2f);
const tmp = new THREE.Color();

export function createTerrain() {
  let cols = 0, rows = 0, cell = 0;
  let geometry = null, skirtGeometry = null;
  let jitter = null;
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
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
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
        if (s === SURFACE.GRASS) tmp.copy(grassDry).lerp(grassLush, v);
        else if (s === SURFACE.WATER) tmp.copy(palette[SURFACE.WATER]);
        else if (s === SURFACE.ROCK) tmp.copy(palette[SURFACE.ROCK]);
        else tmp.copy(palette[s]).lerp(grassLush, Math.min(1, v * 1.2));
        // Slope darkening gives banks and ridges definition.
        const shade = 0.85 + 0.15 * (1 / len);
        const j = jitter[i] * shade;
        col[i * 3] = tmp.r * j; col[i * 3 + 1] = tmp.g * j; col[i * 3 + 2] = tmp.b * j;
      }
    }
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
