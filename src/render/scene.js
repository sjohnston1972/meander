// Renderer, camera, lights, sky and fog. Nothing in here knows about river maths.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VALLEY, RENDER, CAMERAS, QUALITY } from '../config.js';

export function createScene(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc5e8);
  scene.fog = new THREE.FogExp2(0xbfd6e8, 0.00007);

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
  const q = QUALITY[settings.quality] || QUALITY.medium;
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  const half = Math.max(VALLEY.length, VALLEY.width) * 0.55;
  sun.shadow.camera.left = -half; sun.shadow.camera.right = half;
  sun.shadow.camera.top = half; sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 9000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  // Distant ground so the valley does not float in the sky.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(VALLEY.length * 6, VALLEY.width * 10),
    new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -6;
  ground.receiveShadow = true;
  scene.add(ground);

  const skyColours = { day: new THREE.Color(0x9fc5e8), dusk: new THREE.Color(0xe8a76a), night: new THREE.Color(0x263a55) };
  const fogColours = { day: new THREE.Color(0xbfd6e8), dusk: new THREE.Color(0xe8c39a), night: new THREE.Color(0x30465f) };
  const sunColours = { day: new THREE.Color(0xfff2dc), dusk: new THREE.Color(0xffb070) };

  function setTimeOfDay(hour) {
    // 6 = sunrise in the east (upstream), 12 = overhead-ish, 18 = sunset in the west.
    const t = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
    const az = Math.PI * (1 - t);                 // east to west
    const elev = Math.sin(Math.PI * t) * 1.1 + 0.08; // peak ~ 68 degrees
    const r = 6000;
    sun.position.set(Math.cos(az) * Math.cos(elev) * r, Math.sin(elev) * r, Math.sin(az) * Math.cos(elev) * r * 0.5);
    sun.target.position.set(0, 0, 0);
    const low = 1 - Math.min(1, Math.sin(Math.PI * t) * 2.2); // 1 near sunrise/sunset
    sun.color.copy(sunColours.day).lerp(sunColours.dusk, low);
    sun.intensity = 1.2 + 1.4 * Math.sin(Math.PI * t);
    hemi.intensity = 0.5 + 0.5 * Math.sin(Math.PI * t);
    scene.background.copy(skyColours.day).lerp(skyColours.dusk, low * 0.9);
    scene.fog.color.copy(fogColours.day).lerp(fogColours.dusk, low * 0.9);
  }
  setTimeOfDay(settings.timeOfDay);

  function setFog(amount) {
    scene.fog.density = 0.00001 + amount * 0.00012;
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

  return { renderer, scene, camera, controls, sun, ground, render, setTimeOfDay, setFog, flyTo, focusOn, setGroundProbe };
}

// Engine coordinates (x downstream 0..L, y across 0..W, z height) to renderer space.
export function toWorld(x, y, z, exaggeration = 1) {
  return [x - VALLEY.length / 2, z * exaggeration, y - VALLEY.width / 2];
}
