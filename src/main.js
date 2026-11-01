// Boot: capability check, worker, renderer, controls, animation loop.
import * as THREE from 'three';
import { defaults, CAMERAS, PRESETS, VALLEY, QUALITY, RENDER, FLOODPLAIN, CENTRELINE } from './config.js';
import { createScene } from './render/scene.js';
import { createTerrain } from './render/terrain.js';
import { createWater } from './render/water.js';
import { createTrails } from './render/trails.js';
import { createParticles } from './render/particles.js';
import { createVegetation } from './render/vegetation.js';
import { createEffects } from './render/effects.js';
import { createLabels } from './render/labels.js';
import { createSim } from './sim.js';
import { createControls } from './ui/controls.js';
import { createCrossSection } from './ui/crosssection.js';
import { toast } from './ui/toast.js';
import { decodeSettings, copyLink, saveScreenshot } from './ui/share.js';

function supported() {
  if (window.innerWidth < 1024) return false;
  const probe = document.createElement('canvas');
  return !!probe.getContext('webgl2');
}

function start() {
  const settings = decodeSettings(location.hash, defaults);
  const fromLink = location.hash.length > 1;
  const canvas = document.getElementById('view');
  const view = createScene(canvas, settings);
  const quality = () => QUALITY[settings.quality] || QUALITY.medium;

  const terrain = createTerrain();
  const water = createWater();
  const trails = createTrails(terrain);
  const particles = createParticles(QUALITY.high.particles);
  const vegetation = createVegetation(QUALITY.high.trees, QUALITY.high.grass);
  const effects = createEffects();
  const labels = createLabels(document.getElementById('labels'), document.getElementById('card'));
  const section = createCrossSection();
  view.scene.add(terrain.group, water.group, trails.group, particles.points, vegetation.group, effects.group);

  let snapshot = null;
  let lastTerrainAt = 0, lastVegAt = 0;
  let floodVisual = 0; // eased flood level shown on screen
  const pendingReset = new Set();
  const sim = createSim(settings);

  const hudYear = document.getElementById('year');
  const hudFlood = document.getElementById('flood-hud');
  const groundHeight = (x, y) => (snapshot ? terrain.heightAt(snapshot, x, y, settings.exaggeration) : 0);
  view.setGroundProbe((wx, wz) => groundHeight(wx + VALLEY.length / 2, wz + VALLEY.width / 2));

  function refreshTerrain(force = false) {
    if (!snapshot) return;
    const now = performance.now();
    const hz = RENDER.terrainHz[settings.quality] || 10;
    if (force || now - lastTerrainAt >= 1000 / hz) {
      terrain.update(snapshot, settings.exaggeration);
      lastTerrainAt = now;
    }
    if (force || now - lastVegAt >= 1000 / RENDER.vegetationHz) {
      vegetation.update(snapshot, settings.vegDensity, settings.exaggeration, quality());
      lastVegAt = now;
    }
  }

  sim.onSnapshot((snap) => {
    const first = !snapshot;
    snapshot = snap;
    refreshTerrain(first);
    water.update(snap, settings.exaggeration, settings.waterOpacity, floodVisual);
    trails.update(snap, settings.exaggeration, settings.showTrails, settings.showThalweg);
    particles.setSnapshot(snap, quality().particles);
    section.refresh(snap);
    hudYear.textContent = `Year ${Math.floor(snap.year).toLocaleString()}`;
    controls.setYear(snap.year, snap.flood);
    for (const ev of snap.events) {
      const yr = Math.floor(ev.year);
      if (ev.type === 'neck') { toast(`Neck cutoff in year ${yr}`); effects.spawn('neck', ev.x, ev.y, groundHeight(ev.x, ev.y)); }
      else if (ev.type === 'chute') { toast(`Chute cutoff in year ${yr}`); effects.spawn('chute', ev.x, ev.y, groundHeight(ev.x, ev.y)); }
      else if (ev.type === 'flood') toast(`Flood in year ${yr}`);
      else if (ev.type === 'collapse') { toast(`Bank collapse in year ${yr}`); effects.spawn('collapse', ev.x, ev.y, groundHeight(ev.x, ev.y)); }
    }
  });

  function reset() {
    pendingReset.clear();
    controls.showResetNote('');
    snapshot = null;
    view.setQuality(settings.quality);
    sim.reset(settings);
    section.hide();
    toast('Reset');
  }

  const actions = {
    togglePlay() { sim.toggle(); controls.setPlaying(sim.playing); },
    step(years) { sim.step(years); },
    reset,
    flood() { sim.triggerFlood(); },
    dropBase() { sim.dropBaseLevel(CENTRELINE.baseLevelDrop); toast(`Base level dropped ${CENTRELINE.baseLevelDrop} m`); },
    needsReset(key) {
      pendingReset.add(key);
      controls.showResetNote('Press Reset to apply: ' + [...pendingReset].join(', '));
    },
    onSimSetting(partial) {
      if (partial.yearsPerSecond !== undefined) sim.setSpeed(partial.yearsPerSecond);
      sim.applySettings(partial);
      if (partial.hardRock !== undefined) actions.needsReset('hardRock');
    },
    onRenderSetting(key) {
      if (key === 'timeOfDay') view.setTimeOfDay(settings.timeOfDay);
      else if (key === 'fog') view.setFog(settings.fog);
      else if (key === 'paintRock') { view.controls.enabled = !settings.paintRock; canvas.style.cursor = settings.paintRock ? 'crosshair' : ''; }
      else if (snapshot) {
        refreshTerrain(true);
        water.update(snapshot, settings.exaggeration, settings.waterOpacity, floodVisual);
        trails.update(snapshot, settings.exaggeration, settings.showTrails, settings.showThalweg);
      }
    },
    applyPreset(name) {
      // Presets are absolute: restore the defaults for every key any preset touches first.
      for (const p of Object.values(PRESETS)) for (const k of Object.keys(p)) settings[k] = defaults[k];
      Object.assign(settings, PRESETS[name]);
      controls.refresh(name);
      sim.applySettings(settings);
      reset();
    },
    async copyLink() {
      const ok = await copyLink(settings, defaults);
      toast(ok ? 'Link copied to the clipboard' : 'Link is in the address bar (clipboard blocked)');
    },
    screenshot() {
      saveScreenshot(view.renderer, view.scene, view.camera, snapshot?.year ?? 0);
      toast('Screenshot saved');
    },
  };
  const controls = createControls(settings, actions);
  if (fromLink) { controls.refresh('Custom'); toast('Loaded river from link'); }

  // Keyboard.
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); actions.togglePlay(); }
    else if (e.key === 'f' || e.key === 'F') actions.flood();
    else if (e.key === 'r' || e.key === 'R') reset();
    else if (e.key === '1') view.flyTo(CAMERAS.overview.pos, CAMERAS.overview.target);
    else if (e.key === '2') view.flyTo(CAMERAS.oblique.pos, CAMERAS.oblique.target);
    else if (e.key === '3') flyToBend();
    else if (e.key === '4') view.flyTo(CAMERAS.topdown.pos, CAMERAS.topdown.target);
    else if (e.key === '?') document.getElementById('help').classList.toggle('show');
    else if (e.key === 'Escape') { section.hide(); document.getElementById('card').classList.remove('show'); }
  });
  document.getElementById('help-btn').onclick = () => document.getElementById('help').classList.toggle('show');
  document.getElementById('help-close').onclick = () => document.getElementById('help').classList.remove('show');

  // Camera preset 3: close on the sharpest bend currently in the river.
  function flyToBend() {
    if (!snapshot) return view.flyTo(CAMERAS.bend.pos, CAMERAS.bend.target);
    const c = snapshot.centreline;
    const n = c.x.length, prot = Math.floor(n * 0.08);
    let best = prot;
    for (let i = prot; i < n - prot; i++) if (Math.abs(c.curvature[i]) > Math.abs(c.curvature[best])) best = i;
    const tx = c.x[best] - VALLEY.length / 2, tz = c.y[best] - VALLEY.width / 2, ty = c.level[best] * settings.exaggeration;
    view.flyTo([tx - 420, ty + 230, tz + 520], [tx, ty, tz]);
  }

  // Mouse picking: cross-section on the river, rock painting on the ground.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(e, objects) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, view.camera);
    return raycaster.intersectObjects(objects, false)[0];
  }
  let downAt = null, painting = false;
  canvas.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    if (settings.paintRock && e.button === 0) { painting = true; paintAt(e); }
  });
  canvas.addEventListener('pointermove', (e) => { if (painting) paintAt(e); });
  window.addEventListener('pointerup', () => { painting = false; });
  canvas.addEventListener('click', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return; // it was a drag
    if (settings.paintRock) return;
    if (!settings.crossSectionOnClick || !snapshot) return;
    const hit = pick(e, [water.river, terrain.mesh]);
    if (!hit) return;
    const idx = water.nearestIndex(hit.point.x, hit.point.z);
    if (idx >= 0) section.show(snapshot, idx);
  });
  // Ground point under the mouse without raycasting the whole terrain mesh:
  // intersect a horizontal plane, then once more at the ground height found there.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const planeHit = new THREE.Vector3();
  function pickGround(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, view.camera);
    plane.constant = 0;
    if (!raycaster.ray.intersectPlane(plane, planeHit)) return null;
    plane.constant = -groundHeight(planeHit.x + VALLEY.length / 2, planeHit.z + VALLEY.width / 2);
    if (!raycaster.ray.intersectPlane(plane, planeHit)) return null;
    return planeHit;
  }
  function paintAt(e) {
    const hit = pickGround(e);
    if (!hit) return;
    const x = hit.x + VALLEY.length / 2, y = hit.z + VALLEY.width / 2;
    sim.paint(x, y, settings.channelWidth * FLOODPLAIN.rockRadiusWidths * 0.5, !e.shiftKey);
  }
  canvas.addEventListener('dblclick', (e) => {
    const hit = pick(e, [terrain.mesh]);
    if (hit) view.focusOn(hit.point);
  });

  // Share links pasted into this open tab, and windows that shrink below the desktop size.
  window.addEventListener('hashchange', () => {
    const next = decodeSettings(location.hash, defaults);
    if (JSON.stringify(next) === JSON.stringify(settings)) return;
    Object.assign(settings, next);
    controls.refresh('Custom');
    view.setTimeOfDay(settings.timeOfDay);
    view.setFog(settings.fog);
    reset();
    toast('Loaded river from link');
  });
  window.addEventListener('resize', () => {
    document.getElementById('desktop-only').classList.toggle('show', window.innerWidth < 1024);
  });

  // Start playing once the worker is ready (unless the URL says ?autoplay=0).
  if (new URLSearchParams(location.search).get('autoplay') !== '0') {
    setTimeout(() => { sim.play(); controls.setPlaying(true); }, 300);
  }

  let last = performance.now();
  let time = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    water.animate(time);
    if (snapshot) {
      const target = snapshot.flood;
      const rate = target > floodVisual ? dt / RENDER.floodRiseSeconds : dt / RENDER.floodFallSeconds;
      const next = target > floodVisual ? Math.min(target, floodVisual + rate) : Math.max(target, floodVisual - rate);
      if (Math.abs(next - floodVisual) > 1e-4) {
        floodVisual = next;
        water.update(snapshot, settings.exaggeration, settings.waterOpacity, floodVisual);
        hudFlood.textContent = floodVisual > 0.02 ? 'Flood' : '';
      }
    }
    particles.update(dt, settings.exaggeration, settings.showParticles);
    effects.update(dt);
    labels.update(snapshot, view.camera, settings.exaggeration, settings.showLabels, groundHeight, settings.showParticles);
    if (section.open) section.draw(dt);
    view.render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { settings, view, sim, controls, terrain, water, get snapshot() { return snapshot; } };
}

if (supported()) {
  window.meander = start();
} else {
  document.getElementById('desktop-only').classList.add('show');
  document.getElementById('app').style.display = 'none';
}
