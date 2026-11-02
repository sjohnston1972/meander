// River ribbon, oxbow lakes, landslide lakes, the lake at the valley's end,
// side channels (distributaries, the tributary) and the flood sheet. Only
// draws what the snapshot says.
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
const siltColour = new THREE.Color(RENDER.siltColour);
const clearColour = new THREE.Color(RENDER.clearColour);
const loadedColour = new THREE.Color(RENDER.loadedColour);
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
  // Mipmaps: far water averages to calm instead of shimmering.
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeRibbon(material, capacity = MAX_POINTS) {
  const n = capacity * ACROSS;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const idx = new Uint32Array((capacity - 1) * (ACROSS - 1) * 6);
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  const nor = geometry.attributes.normal.array;
  for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}

// Write one polyline as a ribbon into `mesh` starting at point offset `start`.
// `width` is a number, or an array with a width per point (braid threads).
// colourFn(i, u01) fills tmp with the colour for point i at cross position u01 (0..1).
// Returns the next free point index.
function writeRibbon(mesh, start, x, y, level, width, exaggeration, colourFn, arcOffset = 0, lift = 0, capacity = MAX_POINTS) {
  const n = x.length;
  if (n < 2 || start + n > capacity) return start;
  const pos = mesh.geometry.attributes.position.array;
  const col = mesh.geometry.attributes.color.array;
  const uv = mesh.geometry.attributes.uv.array;
  const idx = mesh.geometry.index.array;
  const perPoint = typeof width !== 'number';
  let hw = perPoint ? 0 : width * (0.5 + EDGE_OVERLAP);
  const R = RENDER.rippleMetres;
  let s = arcOffset;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const tx = x[i1] - x[i0], ty = y[i1] - y[i0];
    const l = Math.hypot(tx, ty) || 1;
    const nx = ty / l, ny = -tx / l; // right-hand normal
    if (i > 0) s += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    const wy = level[i] * exaggeration + lift;
    if (perPoint) hw = width[i] * (0.5 + EDGE_OVERLAP);
    for (let a = 0; a < ACROSS; a++) {
      const u01 = a / (ACROSS - 1);
      const u = (u01 * 2 - 1) * hw;
      const v = (start + i) * ACROSS + a;
      pos[v * 3] = x[i] + nx * u - VALLEY.length / 2;
      pos[v * 3 + 1] = wy;
      pos[v * 3 + 2] = y[i] + ny * u - VALLEY.width / 2;
      colourFn(i, u01);
      col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
      // Ripple texture in metres, so ripples are the same size on any river.
      uv[v * 2] = s / R;
      uv[v * 2 + 1] = u / R;
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
  // The segment after this polyline's last point would join it to the next
  // polyline in the same mesh: make it degenerate.
  const k0 = (start + n - 1) * (ACROSS - 1) * 6;
  if (k0 + (ACROSS - 1) * 6 <= idx.length) idx.fill(0, k0, k0 + (ACROSS - 1) * 6);
  return start + n;
}

function finishRibbon(mesh, points, segmentsUsed, layout = points) {
  const g = mesh.geometry;
  g.setDrawRange(0, segmentsUsed * (ACROSS - 1) * 6);
  const verts = points * ACROSS;
  for (const [name, size] of [['position', 3], ['color', 3], ['uv', 2]]) {
    const a = g.attributes[name];
    a.clearUpdateRanges();
    a.addUpdateRange(0, verts * size);
    a.needsUpdate = true;
  }
  if (mesh.userData.indexedPoints !== layout) {
    g.index.needsUpdate = true;
    mesh.userData.indexedPoints = layout;
  }
  mesh.visible = points > 1;
}

// One square per flooded cell at height 0 (the mesh is lifted to the lake level).
function pondGeometry(cells, cols, cell) {
  const n = cells.length;
  const pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), uv = new Float32Array(n * 8);
  const idx = new Uint32Array(n * 6);
  const h = cell * 0.5;
  const R = RENDER.rippleMetres;
  for (let k = 0; k < n; k++) {
    const i = cells[k];
    const cx = i % cols, cy = (i - cx) / cols;
    const x = (cx + 0.5) * cell, z = (cy + 0.5) * cell;
    const corners = [[x - h, z - h], [x + h, z - h], [x - h, z + h], [x + h, z + h]];
    for (let c = 0; c < 4; c++) {
      const v = k * 4 + c;
      pos[v * 3] = corners[c][0] - VALLEY.length / 2;
      pos[v * 3 + 2] = corners[c][1] - VALLEY.width / 2;
      nor[v * 3 + 1] = 1;
      uv[v * 2] = corners[c][0] / R;
      uv[v * 2 + 1] = corners[c][1] / R;
    }
    const b = k * 4;
    idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], k * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
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
  // All the threads of a braided reach share one ribbon mesh. Where threads
  // overlap, the stencil lets only the first one draw, so crossings are not
  // darker and merged threads need no trimming.
  const threadMaterial = riverMaterial.clone();
  Object.assign(threadMaterial, {
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp,
  });
  const THREAD_CAPACITY = MAX_POINTS * 6; // up to six threads of a long river
  const threads = makeRibbon(threadMaterial, THREAD_CAPACITY);
  threads.renderOrder = 2;
  threads.visible = false;
  const lakes = new Map();
  const ponds = new Map(); // landslide lakes by dam id: { mesh, key }
  const pondMaterial = new THREE.MeshStandardMaterial({
    color: RENDER.pondColour, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.05,
    normalMap, normalScale: new THREE.Vector2(0.07, 0.07), depthWrite: false,
  });
  // The lake at the valley's end: one sheet over every cell it started on;
  // the delta, built up above the water, hides the parts it has filled.
  const endLakeMaterial = pondMaterial.clone();
  endLakeMaterial.color = new THREE.Color(RENDER.endLakeColour);
  endLakeMaterial.normalScale = new THREE.Vector2(0.12, 0.12);
  const endLake = new THREE.Mesh(new THREE.BufferGeometry(), endLakeMaterial);
  endLake.renderOrder = 1;
  endLake.frustumCulled = false;
  endLake.visible = false;
  let endLakeVersion = -1;
  // Side channels: distributaries on the delta and the tributary.
  const sideMaterial = riverMaterial.clone();
  const side = makeRibbon(sideMaterial, MAX_POINTS);
  side.renderOrder = 2;
  side.visible = false;

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
  group.add(river, threads, flood, endLake, side);

  // Per-point cross-section for the cross-section panel and picking.
  let lastSnapshot = null;
  let showSediment = false;
  let foam = null;
  const foamColour = new THREE.Color(RENDER.foamColour);

  function update(snapshot, exaggeration, opacity, floodLevel = snapshot.flood) {
    lastSnapshot = snapshot;
    const c = snapshot.centreline;
    const W = c.width;
    const f = floodLevel;
    const floodLift = f * (snapshot.settings.bankHeight - snapshot.settings.channelDepth + 0.6) * exaggeration;
    // Colour: pools dark at bends (towards the thalweg side), riffles lighter on straights.
    // White water where the surface steepens well beyond the river's own
    // slope: the step of a knickpoint working upstream.
    const n = c.x.length;
    if (!foam || foam.length < n) foam = new Float32Array(Math.max(n, 64) * 2);
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(c.x[i] - c.x[i - 1], c.y[i] - c.y[i - 1]);
    const mean = Math.max(1e-5, (c.level[0] - c.level[n - 1]) / Math.max(1, len));
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const d = Math.hypot(c.x[b] - c.x[a], c.y[b] - c.y[a]) || 1;
      const ratio = (c.level[a] - c.level[b]) / d / mean;
      foam[i] = ratio > 3 ? Math.min(1, (ratio - 3) / 5) : 0;
    }
    const sed = snapshot.sediment;
    const wash = sed?.wash;
    const load = showSediment ? sed?.load : null;
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
      if (foam[i] > 0) tmp.lerp(foamColour, foam[i] * (0.55 + 0.25 * Math.sin(u01 * 9 + i)));
      // Water clouded by fine sediment from walls, landslides and gullies.
      if (wash && wash[i] > 1) tmp.lerp(siltColour, Math.min(0.65, (wash[i] - 1) * 0.25));
      tmp.lerp(floodColour, f * 0.85);
      if (showSediment) {
        const r = load ? load[i] : 1;
        if (r < 1) tmp.lerp(clearColour, Math.min(0.85, (1 - r) * 1.7));
        else tmp.lerp(loadedColour, Math.min(0.85, (r - 1) * 0.6));
      }
    };
    // A braided reach narrows the single channel away as its threads spread.
    const braid = snapshot.braid;
    const mainW = W * (1 + f * 0.3) * (braid ? 1 - braid.amount : 1);
    if (mainW > 1) {
      const used = writeRibbon(river, 0, c.x, c.y, c.level, mainW, exaggeration, colourFn, 0, 0.06 + floodLift);
      finishRibbon(river, used, Math.max(0, used - 1));
    } else {
      river.visible = false;
    }
    if (braid) {
      // Shallow threads: light riffle colour, a little deeper down the middle.
      const threadColour = (i, u01) => {
        const side = u01 * 2 - 1;
        tmp.copy(riffleColour).lerp(poolColour, 0.3 * (1 - side * side));
        if (u01 === 0 || u01 === 1) tmp.lerp(rimColour, 0.45);
        if (foam[i] > 0) tmp.lerp(foamColour, foam[i] * 0.6);
        tmp.lerp(floodColour, f * 0.85);
      };
      let start = 0;
      for (const t of braid.threads) {
        start = writeRibbon(threads, start, t.x, t.y, c.level, t.width, exaggeration, threadColour, 0, 0.06 + floodLift, THREAD_CAPACITY);
      }
      finishRibbon(threads, start, Math.max(0, start - 1), `${braid.threads.length}x${c.x.length}`);
    } else {
      threads.visible = false;
    }
    riverMaterial.opacity = opacity;
    threadMaterial.opacity = opacity;

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

    // Landslide lakes: a flat sheet over the flooded cells at the dam crest;
    // the ground above the water hides its edges, so the shore follows the
    // terrain. Rebuilt only when the flooded cells change.
    const seenPonds = new Set();
    for (const p of snapshot.ponds || []) {
      if (!p.cells.length) continue;
      seenPonds.add(p.id);
      let pond = ponds.get(p.id);
      if (!pond) {
        pond = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), pondMaterial), key: '' };
        pond.mesh.renderOrder = 2;
        pond.mesh.frustumCulled = false;
        group.add(pond.mesh);
        ponds.set(p.id, pond);
      }
      const n = p.cells.length;
      const key = `${n}:${p.cells[0]}:${p.cells[n >> 1]}:${p.cells[n - 1]}`;
      if (pond.key !== key) {
        pond.mesh.geometry.dispose();
        pond.mesh.geometry = pondGeometry(p.cells, snapshot.grid.cols, snapshot.grid.cell);
        pond.key = key;
      }
      pond.mesh.position.y = p.level * exaggeration + 0.05 + floodLift * 0.5;
    }
    pondMaterial.opacity = opacity * 0.95;

    // The lake at the valley's end (its cells arrive once per river).
    const lake = snapshot.lake;
    if (lake) {
      if (lake.cells) { // sent once per river (and again after a reset or a load)
        endLake.geometry.dispose();
        endLake.geometry = pondGeometry(lake.cells, snapshot.grid.cols, snapshot.grid.cell);
        endLakeVersion = lake.version;
      }
      endLake.position.y = lake.level * exaggeration + 0.04 + floodLift * 0.5;
      endLake.visible = endLakeVersion >= 0;
      endLakeMaterial.opacity = opacity * 0.8;
    } else if (endLakeVersion >= 0) {
      endLake.geometry.dispose();
      endLake.geometry = new THREE.BufferGeometry();
      endLake.visible = false;
      endLakeVersion = -1;
    }

    // Side channels: light, shallow water.
    const channels = snapshot.channels || [];
    if (channels.length) {
      const sideColour = (i, u01) => {
        const s = u01 * 2 - 1;
        tmp.copy(riffleColour).lerp(poolColour, 0.35 * (1 - s * s));
        if (u01 === 0 || u01 === 1) tmp.lerp(rimColour, 0.4);
        tmp.lerp(floodColour, f * 0.85);
      };
      let start = 0;
      for (const ch of channels) start = writeRibbon(side, start, ch.x, ch.y, ch.level, ch.width, exaggeration, sideColour, 0, 0.06 + floodLift);
      finishRibbon(side, start, Math.max(0, start - 1), channels.map((ch) => ch.x.length).join(','));
      sideMaterial.opacity = opacity;
    } else {
      side.visible = false;
    }
    for (const [id, pond] of ponds) {
      if (seenPonds.has(id)) continue;
      group.remove(pond.mesh);
      pond.mesh.geometry.dispose();
      ponds.delete(id);
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
    const reach = lastSnapshot.braid ? lastSnapshot.braid.half + c.width : c.width * 1.5;
    return Math.sqrt(bestD) < reach ? best : -1;
  }

  return {
    group, river, flood, update, animate, nearestIndex,
    setShowSediment(on) { showSediment = !!on; },
    get lakeCount() { return lakes.size; },
  };
}
