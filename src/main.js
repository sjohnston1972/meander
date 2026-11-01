// Boot: capability check, scene, controls panel, animation loop.
import GUI from 'lil-gui';
import { defaults } from './config.js';
import { createScene } from './render/scene.js';

function supported() {
  if (window.innerWidth < 1024) return false;
  const probe = document.createElement('canvas');
  return !!probe.getContext('webgl2');
}

function start() {
  const settings = { ...defaults };
  const canvas = document.getElementById('view');
  const view = createScene(canvas, settings);
  const gui = new GUI({ title: 'Meander' });
  gui.domElement.title = '';

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    view.render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { settings, view, gui };
}

if (supported()) {
  start();
} else {
  document.getElementById('desktop-only').classList.add('show');
  document.getElementById('app').style.display = 'none';
}
