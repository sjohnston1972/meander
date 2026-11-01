// Renderer, camera, lights, sky and fog. Nothing in here knows about river maths.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VALLEY, RENDER, CAMERAS, QUALITY } from '../config.js';

export function createScene(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc5e8);
  scene.fog = new THREE.FogExp2(0xd3e0ea, 0.00013);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 20000);
  camera.position.set(...CAMERAS.overview.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomSpeed = 0.8;
  controls.minDistance = RENDER.cameraMinDistance;
  controls.maxDistance = RENDER.cameraMaxDistance;
  controls.maxPolarAngle = RENDER.cameraMaxPolar;
  controls.target.set(...CAMERAS.overview.target);
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.update();

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5a3a, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
  sun.castShadow = true;
  function setQuality(name) {
    const q = QUALITY[name] || QUALITY.medium;
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  setQuality(settings.quality);
  const half = Math.max(VALLEY.length, VALLEY.width) * 0.55;
  sun.shadow.camera.left = -half; sun.shadow.camera.right = half;
  sun.shadow.camera.top = half; sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 9000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  // Distant ground so the valley does not float in the sky.
  // Beyond the valley: a muted plain that fades into the haze within a few km.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(VALLEY.length * 2.2, VALLEY.width * 3.6),
    new THREE.MeshStandardMaterial({ color: 0x6a8c47, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -6;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sky dome: a big inverted sphere with a vertex-coloured gradient, pale at
  // the horizon, deeper overhead, warm around a low sun. Unlit and unfogged.
  const SKY_R = 16000;
  const skyGeom = new THREE.SphereGeometry(SKY_R, 48, 24);
  skyGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeom.attributes.position.count * 3), 3));
  const sky = new THREE.Mesh(skyGeom, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  const horizonDay = new THREE.Color(0xc9dcec), zenithDay = new THREE.Color(0x4a8bcc);
  const horizonDusk = new THREE.Color(0xf2a866), zenithDusk = new THREE.Color(0x6b7fb0);
  const glowDay = new THREE.Color(0xf7f3e6), glowDusk = new THREE.Color(0xffc27a);
  const hcol = new THREE.Color(), zcol = new THREE.Color(), gcol = new THREE.Color(), vcol = new THREE.Color();
  const sunDir = new THREE.Vector3();
  function paintSky(low) {
    hcol.copy(horizonDay).lerp(horizonDusk, low);
    zcol.copy(zenithDay).lerp(zenithDusk, low);
    gcol.copy(glowDay).lerp(glowDusk, low);
    sunDir.copy(sun.position).normalize();
    const pos = skyGeom.attributes.position, col = skyGeom.attributes.color;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const t = Math.max(0, v.y);                         // 0 horizon, 1 zenith
      const k = Math.pow(t, 0.6);                         // pale band near the horizon, blue above
      vcol.copy(hcol).lerp(zcol, k);
      // Warm glow around the sun, strongest when the sun is low.
      const toward = Math.max(0, v.dot(sunDir));
      const glow = Math.pow(toward, 5) * (0.2 + 0.9 * low) * (1 - k * 0.5);
      vcol.lerp(gcol, Math.min(1, glow));
      // Below the horizon fade to the fog colour so the ground plane edge is hidden.
      if (v.y < 0) vcol.copy(hcol).lerp(scene.fog.color, Math.min(1, -v.y * 4));
      col.setXYZ(i, vcol.r, vcol.g, vcol.b);
    }
    col.needsUpdate = true;
  }

  const skyColours = { day: new THREE.Color(0xd6e6f2), dusk: new THREE.Color(0xf0b57a) };
  const fogColours = { day: new THREE.Color(0xd3e0ea), dusk: new THREE.Color(0xe8b98c) };
  const sunColours = { day: new THREE.Color(0xfff2dc), dusk: new THREE.Color(0xffa552) };

  function setTimeOfDay(hour) {
    // 6 = sunrise in the east (upstream), 12 = overhead-ish, 18 = sunset in the west.
    const t = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
    const az = Math.PI * (1 - t);                 // east to west
    const elev = Math.sin(Math.PI * t) * 1.1 + 0.08; // peak ~ 68 degrees
    const r = 6000;
    sun.position.set(Math.cos(az) * Math.cos(elev) * r, Math.sin(elev) * r, Math.sin(az) * Math.cos(elev) * r * 0.5);
    sun.target.position.set(0, 0, 0);
    const low = 1 - Math.min(1, Math.sin(Math.PI * t) * 1.6); // 1 near sunrise/sunset
    sun.color.copy(sunColours.day).lerp(sunColours.dusk, low);
    sun.intensity = 1.5 + 1.1 * Math.sin(Math.PI * t);
    hemi.intensity = 0.55 + 0.45 * Math.sin(Math.PI * t);
    hemi.color.copy(skyColours.day).lerp(skyColours.dusk, low * 0.6);
    scene.background.copy(skyColours.day).lerp(skyColours.dusk, low * 0.9);
    scene.fog.color.copy(fogColours.day).lerp(fogColours.dusk, low * 0.9);
    paintSky(low);
  }
  setTimeOfDay(settings.timeOfDay);

  function setFog(amount) {
    scene.fog.density = 0.00003 + amount * 0.0002;
  }
  setFog(settings.fog);

  // Ground height probe (world x, z) supplied by the terrain, for the camera floor.
  let groundProbe = null;
  function setGroundProbe(fn) { groundProbe = fn; }

  // Smooth camera moves between presets.
  let tween = null;
  function flyTo(pos, target, seconds = RENDER.cameraTween) {
    tween = {
      t: 0, seconds,
      fromPos: camera.position.clone(), toPos: new THREE.Vector3(...pos),
      fromTarget: controls.target.clone(), toTarget: new THREE.Vector3(...target),
    };
  }
  function focusOn(point, seconds = 0.8) {
    const offset = camera.position.clone().sub(controls.target);
    const dist = offset.length();
    const newDist = Math.max(RENDER.cameraMinDistance * 3, dist * 0.45);
    offset.setLength(newDist);
    flyTo(point.clone().add(offset).toArray(), point.toArray(), seconds);
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  function render(dt) {
    sky.position.copy(camera.position); // the dome travels with the camera
    if (tween) {
      tween.t += dt / tween.seconds;
      const k = tween.t >= 1 ? 1 : 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    // Never let the camera dip below the ground.
    const floor = (groundProbe ? groundProbe(camera.position.x, camera.position.z) : 0) + 4;
    if (camera.position.y < floor) camera.position.y = floor;
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, controls, sun, ground, render, setTimeOfDay, setFog, flyTo, focusOn, setGroundProbe, setQuality };
}

// Engine coordinates (x downstream 0..L, y across 0..W, z height) to renderer space.
export function toWorld(x, y, z, exaggeration = 1) {
  return [x - VALLEY.length / 2, z * exaggeration, y - VALLEY.width / 2];
}
