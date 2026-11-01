// Instanced trees and grass tufts placed on stable, vegetated ground.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VALLEY, SURFACE, RENDER, FLOODPLAIN } from '../config.js';

const dummy = new THREE.Object3D();
const colour = new THREE.Color();

function hash(i, salt) {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Cheap smooth value noise on the cell grid, so woodland comes in clumps.
const corner = (i, j) => hash(i * 7919 + j * 104729, 99);
function clumpNoise(cx, cy, scale) {
  const x = cx / scale, y = cy / scale;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = corner(x0, y0), b = corner(x0 + 1, y0), c = corner(x0, y0 + 1), d = corner(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

const paint = (g, hex) => {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
};

// Conifer: a trunk and two stacked cones.
function coniferGeometry() {
  const trunk = new THREE.CylinderGeometry(0.35, 0.5, 4, 5);
  trunk.translate(0, 2, 0);
  const canopy = new THREE.ConeGeometry(2.6, 7, 6);
  canopy.translate(0, 6.8, 0);
  const canopy2 = new THREE.ConeGeometry(2.0, 5, 6);
  canopy2.translate(0, 9.4, 0);
  return mergeGeometries([paint(trunk, RENDER.trunkColour), paint(canopy, 0xffffff), paint(canopy2, 0xffffff)]);
}

// Broadleaf: a taller trunk and three overlapping lumps.
function broadleafGeometry() {
  const trunk = new THREE.CylinderGeometry(0.4, 0.6, 5, 5).toNonIndexed(); // icosahedra are non-indexed
  trunk.translate(0, 2.5, 0);
  const a = new THREE.IcosahedronGeometry(3.2, 1); a.translate(0, 7.4, 0);
  const b = new THREE.IcosahedronGeometry(2.5, 1); b.translate(1.6, 8.6, 0.8);
  const c = new THREE.IcosahedronGeometry(2.3, 1); c.translate(-1.5, 8.9, -0.9);
  return mergeGeometries([paint(trunk, RENDER.trunkColour), paint(a, 0xffffff), paint(b, 0xffffff), paint(c, 0xffffff)]);
}

function tuftGeometry() {
  const g = new THREE.ConeGeometry(1.4, 1.8, 4);
  g.translate(0, 0.9, 0);
  return g;
}

export function createVegetation(maxTrees, maxGrass) {
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const makeTrees = (geometry) => {
    const m = new THREE.InstancedMesh(geometry, treeMat, maxTrees);
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    return m;
  };
  const trees = makeTrees(coniferGeometry());
  const broad = makeTrees(broadleafGeometry());
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const grass = new THREE.InstancedMesh(tuftGeometry(), grassMat, maxGrass);
  grass.receiveShadow = true;
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.frustumCulled = false;
  const group = new THREE.Group();
  group.add(trees, broad, grass);

  const canopyA = new THREE.Color(RENDER.treeColour);
  const canopyB = new THREE.Color(0x7fa83f);
  const canopyC = new THREE.Color(0x2c4f27);
  const broadA = new THREE.Color(0x4f8a34), broadB = new THREE.Color(0x8fae45);
  const tuftGreen = new THREE.Color(RENDER.grassColour), tuftSand = new THREE.Color(0xb9b06a);

  // `limits` caps the counts for the current quality setting (buffers are sized for High).
  function update(snapshot, density, exaggeration, limits = { trees: maxTrees, grass: maxGrass }) {
    const g = snapshot.grid;
    const { cols, rows, cell, height, surface, veg } = g;
    const treeCap = Math.min(maxTrees, limits.trees), grassCap = Math.min(maxGrass, limits.grass);
    const cellsPerTree = Math.max(1, Math.floor((cols * rows) / (treeCap * 1.5)));
    let t = 0, b = 0, gr = 0;
    const treeProb = 0.7 * density;
    const grassProb = 0.5 * density;
    for (let i = 0; i < cols * rows; i += 1) {
      const s = surface[i];
      if (s === SURFACE.WATER || s === SURFACE.ROCK || s === SURFACE.WETLAND || s === SURFACE.EARTH) continue;
      const v = veg[i] / 255;
      const h1 = hash(i, 1);
      const cx = i % cols, cy = (i / cols) | 0;
      const wx = (cx + 0.5 + (hash(i, 2) - 0.5)) * cell - VALLEY.length / 2;
      const wz = (cy + 0.5 + (hash(i, 3) - 0.5)) * cell - VALLEY.width / 2;
      const wy = height[i] * exaggeration;
      const clump = clumpNoise(cx, cy, cols / 18);
      const woodland = Math.max(0, (clump - 0.42) * 2.4); // 0 in open grassland, ~1 in the heart of a wood
      if (t + b < treeCap && i % cellsPerTree === 0 && v > FLOODPLAIN.vegTreeThreshold && h1 < (v - FLOODPLAIN.vegTreeThreshold) * 2.5 * treeProb * (0.08 + woodland)) {
        const sc = 0.8 + hash(i, 4) * 0.7;
        dummy.position.set(wx, wy, wz);
        dummy.scale.set(sc, sc * (0.9 + hash(i, 5) * 0.4), sc);
        dummy.rotation.set(0, hash(i, 6) * 6.28, 0);
        dummy.updateMatrix();
        // Broadleaf in the damper, lusher ground; conifers elsewhere. Mixed where it is in between.
        const broadChance = 0.25 + 0.5 * clumpNoise(cx + 1000, cy + 777, cols / 9);
        if (hash(i, 11) < broadChance) {
          broad.setMatrixAt(b, dummy.matrix);
          colour.copy(broadA).lerp(broadB, hash(i, 7));
          broad.setColorAt(b, colour);
          b++;
        } else {
          trees.setMatrixAt(t, dummy.matrix);
          colour.copy(canopyA).lerp(canopyB, hash(i, 7)).lerp(canopyC, hash(i, 12) * 0.5);
          trees.setColorAt(t, colour);
          t++;
        }
      } else if (gr < grassCap && v > 0.15 && v < 0.75 && hash(i, 8) < grassProb * (s === SURFACE.SAND ? 0.6 : 0.3)) {
        const sc = 0.8 + hash(i, 9) * 0.8;
        dummy.position.set(wx, wy, wz);
        dummy.scale.set(sc, sc, sc);
        dummy.rotation.set(0, hash(i, 10) * 6.28, 0);
        dummy.updateMatrix();
        grass.setMatrixAt(gr, dummy.matrix);
        colour.copy(tuftGreen).lerp(tuftSand, s === SURFACE.SAND ? 0.6 + hash(i, 13) * 0.3 : hash(i, 13) * 0.25);
        grass.setColorAt(gr, colour);
        gr++;
      }
    }
    trees.count = t;
    trees.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
    broad.count = b;
    broad.instanceMatrix.needsUpdate = true;
    if (broad.instanceColor) broad.instanceColor.needsUpdate = true;
    grass.count = gr;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  }

  return { group, update };
}
