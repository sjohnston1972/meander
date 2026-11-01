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

function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.35, 0.5, 3, 5);
  trunk.translate(0, 1.5, 0);
  const canopy = new THREE.ConeGeometry(2.6, 7, 6);
  canopy.translate(0, 6.2, 0);
  const canopy2 = new THREE.ConeGeometry(2.0, 5, 6);
  canopy2.translate(0, 8.8, 0);
  const paint = (g, hex) => {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const col = new THREE.Color(hex);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  return mergeGeometries([paint(trunk, RENDER.trunkColour), paint(canopy, 0xffffff), paint(canopy2, 0xffffff)]);
}

function tuftGeometry() {
  const g = new THREE.ConeGeometry(1.4, 1.8, 4);
  g.translate(0, 0.9, 0);
  return g;
}

export function createVegetation(maxTrees, maxGrass) {
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const trees = new THREE.InstancedMesh(treeGeometry(), treeMat, maxTrees);
  trees.castShadow = true;
  trees.receiveShadow = true;
  trees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trees.frustumCulled = false;
  const grassMat = new THREE.MeshStandardMaterial({ color: RENDER.grassColour, roughness: 1 });
  const grass = new THREE.InstancedMesh(tuftGeometry(), grassMat, maxGrass);
  grass.receiveShadow = true;
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.frustumCulled = false;
  const group = new THREE.Group();
  group.add(trees, grass);

  const canopyA = new THREE.Color(RENDER.treeColour);
  const canopyB = new THREE.Color(0x6f9a3c);

  // `limits` caps the counts for the current quality setting (buffers are sized for High).
  function update(snapshot, density, exaggeration, limits = { trees: maxTrees, grass: maxGrass }) {
    const g = snapshot.grid;
    const { cols, rows, cell, height, surface, veg } = g;
    const treeCap = Math.min(maxTrees, limits.trees), grassCap = Math.min(maxGrass, limits.grass);
    const cellsPerTree = Math.max(1, Math.floor((cols * rows) / (treeCap * 1.5)));
    let t = 0, gr = 0;
    const treeProb = 0.7 * density;
    const grassProb = 0.5 * density;
    for (let i = 0; i < cols * rows; i += 1) {
      const s = surface[i];
      if (s === SURFACE.WATER || s === SURFACE.ROCK || s === SURFACE.WETLAND) continue;
      const v = veg[i] / 255;
      const h1 = hash(i, 1);
      const cx = i % cols, cy = (i / cols) | 0;
      const wx = (cx + 0.5 + (hash(i, 2) - 0.5)) * cell - VALLEY.length / 2;
      const wz = (cy + 0.5 + (hash(i, 3) - 0.5)) * cell - VALLEY.width / 2;
      const wy = height[i] * exaggeration;
      const clump = clumpNoise(cx, cy, cols / 18);
      const woodland = Math.max(0, (clump - 0.42) * 2.4); // 0 in open grassland, ~1 in the heart of a wood
      if (t < treeCap && i % cellsPerTree === 0 && v > FLOODPLAIN.vegTreeThreshold && h1 < (v - FLOODPLAIN.vegTreeThreshold) * 2.5 * treeProb * (0.08 + woodland)) {
        const sc = 0.8 + hash(i, 4) * 0.7;
        dummy.position.set(wx, wy, wz);
        dummy.scale.set(sc, sc * (0.9 + hash(i, 5) * 0.4), sc);
        dummy.rotation.set(0, hash(i, 6) * 6.28, 0);
        dummy.updateMatrix();
        trees.setMatrixAt(t, dummy.matrix);
        colour.copy(canopyA).lerp(canopyB, hash(i, 7));
        trees.setColorAt(t, colour);
        t++;
      } else if (gr < grassCap && v > 0.15 && v < 0.75 && hash(i, 8) < grassProb * (s === SURFACE.SAND ? 0.6 : 0.3)) {
        const sc = 0.8 + hash(i, 9) * 0.8;
        dummy.position.set(wx, wy, wz);
        dummy.scale.set(sc, sc, sc);
        dummy.rotation.set(0, hash(i, 10) * 6.28, 0);
        dummy.updateMatrix();
        grass.setMatrixAt(gr, dummy.matrix);
        gr++;
      }
    }
    trees.count = t;
    trees.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
    grass.count = gr;
    grass.instanceMatrix.needsUpdate = true;
  }

  return { group, update };
}
