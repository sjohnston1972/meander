// Short, subtle effects: a muddy plume for cutoffs and bank collapses.
import * as THREE from 'three';
import { VALLEY } from '../config.js';

function plumeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(140,110,70,0.9)');
  g.addColorStop(0.5, 'rgba(130,100,65,0.5)');
  g.addColorStop(1, 'rgba(120,95,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createEffects() {
  const group = new THREE.Group();
  const texture = plumeTexture();
  const pool = [];
  const live = [];

  function spawn(type, x, y, worldY) {
    let sprite = pool.pop();
    if (!sprite) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      group.add(sprite);
    }
    const big = type === 'neck' || type === 'chute';
    sprite.position.set(x - VALLEY.length / 2, worldY + 0.5, y - VALLEY.width / 2);
    sprite.material.opacity = 0.9;
    sprite.visible = true;
    live.push({ sprite, t: 0, life: big ? 4 : 2.5, from: big ? 30 : 15, to: big ? 160 : 60 });
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      const size = e.from + (e.to - e.from) * Math.sqrt(k);
      e.sprite.scale.set(size, size * 0.7, 1);
      e.sprite.material.opacity = 0.9 * (1 - k) * (1 - k);
      if (k >= 1) {
        e.sprite.visible = false;
        pool.push(e.sprite);
        live.splice(i, 1);
      }
    }
  }

  return { group, spawn, update };
}
