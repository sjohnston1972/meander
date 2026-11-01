// River ribbon, oxbow lakes and the flood sheet. Only draws what the snapshot says.
import * as THREE from 'three';
import { VALLEY, RENDER, FLOODPLAIN } from '../config.js';

const ACROSS = 7;          // vertices across the ribbon
const MAX_POINTS = 6000;   // ribbon capacity (river or all oxbows together)
const EDGE_OVERLAP = 0.16; // ribbon extends this fraction of W past the bank to hide the terrain seam

const poolColour = new THREE.Color(RENDER.poolColour);
const riffleColour = new THREE.Color(RENDER.riffleColour);
const floodColour = new THREE.Color(RENDER.floodColour);
const lakeColour = new THREE.Color(RENDER.lakeColour);
const marshColour = new THREE.Color(RENDER.marshColour);
const rimColour = new THREE.Color(0xa9d3dc);
const tmp = new THREE.Color();

// Procedural ripple normal map: a few overlapping sine waves.
function makeNormalMap(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const h = (x, y) => (
    Math.sin(x * 0.11 + y * 0.07) * 0.5 + Math.sin(x * 0.23 - y * 0.19 + 1.3) * 0.3 +
    Math.sin(x * 0.05 + y * 0.31 + 2.1) * 0.4 + Math.sin(x * 0.41 + y * 0.02 + 0.4) * 0.2
  );
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const nx = -dx * 2.5, ny = -dy * 2.5, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    data[i] = (nx / l * 0.5 + 0.5) * 255; data[i + 1] = (ny / l * 0.5 + 0.5) * 255; data[i + 2] = (nz / l * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeRibbon(material) {
  const n = MAX_POINTS * ACROSS;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const idx = new Uint32Array((MAX_POINTS - 1) * (ACROSS - 1) * 6);
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  const nor = geometry.attributes.normal.array;
  for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}

// Write one polyline as a ribbon into `mesh` starting at point offset `start`.
// colourFn(i, u01) fills tmp with the colour for point i at cross position u01 (0..1).
// Returns the next free point index.
function writeRibbon(mesh, start, x, y, level, width, exaggeration, colourFn, arcOffset = 0, lift = 0, capacity = MAX_POINTS) {
  const n = x.length;
  if (n < 2 || start + n > capacity) return start;
  const pos = mesh.geometry.attributes.position.array;
  const col = mesh.geometry.attributes.color.array;
  const uv = mesh.geometry.attributes.uv.array;
  const idx = mesh.geometry.index.array;
  const hw = width * (0.5 + EDGE_OVERLAP);
  let s = arcOffset;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const tx = x[i1] - x[i0], ty = y[i1] - y[i0];
    const l = Math.hypot(tx, ty) || 1;
    const nx = ty / l, ny = -tx / l; // right-hand normal
    if (i > 0) s += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    const wy = level[i] * exaggeration + lift;
    for (let a = 0; a < ACROSS; a++) {
      const u01 = a / (ACROSS - 1);
      const u = (u01 * 2 - 1) * hw;
      const v = (start + i) * ACROSS + a;
      pos[v * 3] = x[i] + nx * u - VALLEY.length / 2;
      pos[v * 3 + 1] = wy;
      pos[v * 3 + 2] = y[i] + ny * u - VALLEY.width / 2;
      colourFn(i, u01);
      col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
      uv[v * 2] = s / (width * 2);
      uv[v * 2 + 1] = u01 * 1.2;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let a = 0; a < ACROSS - 1; a++) {
      const k = ((start + i) * (ACROSS - 1) + a) * 6;
      const p = (start + i) * ACROSS + a, q = p + ACROSS;
      idx[k] = p; idx[k + 1] = q; idx[k + 2] = p + 1;
      idx[k + 3] = p + 1; idx[k + 4] = q; idx[k + 5] = q + 1;
    }
  }
  return start + n;
}

function finishRibbon(mesh, points, segmentsUsed) {
  const g = mesh.geometry;
  g.setDrawRange(0, segmentsUsed * (ACROSS - 1) * 6);
  const verts = points * ACROSS;
  for (const [name, size] of [['position', 3], ['color', 3], ['uv', 2]]) {
    const a = g.attributes[name];
    a.clearUpdateRanges();
    a.addUpdateRange(0, verts * size);
    a.needsUpdate = true;
  }
  if (mesh.userData.indexedPoints !== points) {
    g.index.needsUpdate = true;
    mesh.userData.indexedPoints = points;
  }
  mesh.visible = points > 1;
}

export function createWater() {
  const normalMap = makeNormalMap();
  const riverMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.85, roughness: 0.12, metalness: 0.05,
    normalMap, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false,
  });
  const lakeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.05,
    normalMap, normalScale: new THREE.Vector2(0.07, 0.07), depthWrite: false,
  });
  const floodMaterial = new THREE.MeshStandardMaterial({
    color: RENDER.floodColour, transparent: true, opacity: 0, roughness: 0.3, metalness: 0,
    normalMap, normalScale: new THREE.Vector2(0.2, 0.2), depthWrite: false,
  });

  const river = makeRibbon(riverMaterial);
  river.renderOrder = 2;
  const lakes = new Map();

  // A fixed ribbon for one oxbow loop, with its own material for tinting.
  function buildLake(o, exaggeration) {
    const n = o.x.length;
    const geometry = new THREE.BufferGeometry();
    const verts = n * ACROSS;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array((n - 1) * (ACROSS - 1) * 6), 1));
    const nor = geometry.attributes.normal.array;
    for (let i = 0; i < verts; i++) nor[i * 3 + 1] = 1;
    const mesh = new THREE.Mesh(geometry, lakeMaterial.clone());
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const lvl = new Float32Array(n).fill(o.level);
    const used = writeRibbon(mesh, 0, o.x, o.y, lvl, o.width, exaggeration, () => { tmp.set(0xffffff); }, 0, 0, n);
    finishRibbon(mesh, used, used - 1);
    return { mesh, exaggeration };
  }

  // Flood sheet: follows the valley slope, flat across the valley.
  const FX = 64;
  const floodGeom = new THREE.PlaneGeometry(VALLEY.length, VALLEY.width, FX, 1);
  floodGeom.rotateX(-Math.PI / 2);
  const flood = new THREE.Mesh(floodGeom, floodMaterial);
  flood.renderOrder = 0;
  flood.visible = false;
  flood.receiveShadow = true;
  const fuv = floodGeom.attributes.uv.array;
  for (let i = 0; i < fuv.length; i += 2) { fuv[i] *= 60; fuv[i + 1] *= 30; }

  const group = new THREE.Group();
  group.add(river, flood);

  // Per-point cross-section for the cross-section panel and picking.
  let lastSnapshot = null;

  function update(snapshot, exaggeration, opacity, floodLevel = snapshot.flood) {
    lastSnapshot = snapshot;
    const c = snapshot.centreline;
    const W = c.width;
    const f = floodLevel;
    const floodLift = f * (snapshot.settings.bankHeight - snapshot.settings.channelDepth + 0.6) * exaggeration;
    // Colour: pools dark at bends (towards the thalweg side), riffles lighter on straights.
    const colourFn = (i, u01) => {
      const depth = c.depth[i], mean = c.meanDepth;
      const bend = Math.min(1, (depth / mean - 1) / 0.8);
      const side = (u01 * 2 - 1); // -1 left .. +1 right
      const thal = c.thalweg[i] / (W / 2); // signed, -0.3..0.3
      const nearThalweg = 1 - Math.min(1, Math.abs(side - thal * 1.5) * 0.8);
      const deep = Math.max(0, bend * 0.6 + nearThalweg * 0.5 - 0.1) * (1 - Math.pow(Math.abs(side), 4));
      tmp.copy(riffleColour).lerp(poolColour, Math.min(1, deep));
      // Faint lighter rim where the water meets the bank.
      if (u01 === 0 || u01 === 1) tmp.lerp(rimColour, 0.35);
      tmp.lerp(floodColour, f * 0.85);
    };
    const used = writeRibbon(river, 0, c.x, c.y, c.level, W * (1 + f * 0.3), exaggeration, colourFn, 0, 0.06 + floodLift);
    finishRibbon(river, used, Math.max(0, used - 1));
    riverMaterial.opacity = opacity;

    // Oxbows never change shape, so each lake ribbon is built once (keyed by
    // the oxbow id) and only its tint and height change after.
    const seen = new Set();
    for (const o of snapshot.oxbows) {
      const key = o.id;
      seen.add(key);
      let lake = lakes.get(key);
      if (!lake) {
        lake = buildLake(o, exaggeration);
        lakes.set(key, lake);
        group.add(lake.mesh);
      }
      const t = Math.min(1, o.depth / snapshot.settings.channelDepth);
      const marsh = o.depth < FLOODPLAIN.oxbowMarshDepth ? 1 - o.depth / FLOODPLAIN.oxbowMarshDepth : 0;
      lake.mesh.material.color.copy(lakeColour).lerp(marshColour, (1 - t) * 0.5 + marsh * 0.5);
      lake.mesh.material.opacity = opacity * (0.95 - marsh * 0.35);
      lake.mesh.position.y = (exaggeration - lake.exaggeration) * o.level + 0.04 + floodLift * 0.5;
      lake.mesh.visible = true;
    }
    for (const [key, lake] of lakes) {
      if (seen.has(key)) continue;
      group.remove(lake.mesh);
      lake.mesh.geometry.dispose();
      lake.mesh.material.dispose();
      lakes.delete(key);
    }

    // Flood sheet.
    if (f > 0) {
      const s = snapshot.settings;
      const pos = floodGeom.attributes.position.array;
      // Water surface relative to the channel bed: over the bank top at the peak, levees stay dry.
      const lift = s.bankHeight + 0.3 + 0.6 * f;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i] + VALLEY.length / 2;
        pos[i + 1] = (s.valleySlope * (VALLEY.length - x) - (s.incision || 0) + lift * Math.min(1, f * 1.4) - 0.15) * exaggeration + 0.05;
      }
      floodGeom.attributes.position.needsUpdate = true;
      floodMaterial.opacity = Math.min(0.8, f * 1.1) * opacity;
      flood.visible = true;
    } else {
      flood.visible = false;
    }
  }

  function animate(time) {
    normalMap.offset.x = -time * RENDER.rippleSpeed;
    normalMap.offset.y = time * RENDER.rippleSpeed * 0.1;
  }

  // Nearest centreline index to a world-space point, for the cross-section panel.
  function nearestIndex(worldX, worldZ) {
    if (!lastSnapshot) return -1;
    const c = lastSnapshot.centreline;
    const ex = worldX + VALLEY.length / 2, ey = worldZ + VALLEY.width / 2;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < c.x.length; i++) {
      const d = (c.x[i] - ex) ** 2 + (c.y[i] - ey) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return Math.sqrt(bestD) < c.width * 1.5 ? best : -1;
  }

  return { group, river, flood, update, animate, nearestIndex, get lakeCount() { return lakes.size; } };
}
