// The lil-gui control panel. Every control gets a hover explanation from
// config.HELP, and settings are routed to the engine or the renderer.
import GUI from 'lil-gui';
import { HELP, PRESETS, RESET_KEYS } from '../config.js';

// Which settings the renderer owns (everything else goes to the engine).
const RENDER_KEYS = new Set([
  'showParticles', 'showThalweg', 'showTrails', 'showLabels', 'crossSectionOnClick',
  'waterOpacity', 'exaggeration', 'timeOfDay', 'fog', 'vegDensity', 'paintRock',
]);

function help(ctrl, key) {
  const text = HELP[key];
  if (text && ctrl?.domElement) ctrl.domElement.title = text;
  return ctrl;
}

export function createControls(settings, actions) {
  const gui = new GUI({ title: 'Meander', width: 300 });
  const state = { preset: 'Custom', year: 'Year 0', playing: false, resetNote: '' };
  let suppress = false;

  const onChange = (key) => (value) => {
    if (suppress) return;
    if (RESET_KEYS.includes(key)) {
      actions.needsReset(key);
    } else if (RENDER_KEYS.has(key)) {
      actions.onRenderSetting(key, value);
    } else {
      actions.onSimSetting({ [key]: value });
    }
    state.preset = 'Custom';
    presetCtrl.updateDisplay();
  };

  const add = (folder, key, ...args) => help(folder.add(settings, key, ...args).onChange(onChange(key)), key);

  // --- Simulation ---
  const sim = gui.addFolder('Simulation');
  const playCtrl = help(sim.add({ play: () => actions.togglePlay() }, 'play').name('▶ Play (Space)'), 'play');
  help(sim.add({ step: () => actions.step(1) }, 'step').name('Step one year'), 'step');
  add(sim, 'yearsPerSecond', 0.5, 100, 0.5).name('Speed (years/s)');
  help(sim.add({ reset: () => actions.reset() }, 'reset').name('Reset (R)'), 'reset');
  add(sim, 'seed', 1, 99999, 1).name('Seed');
  add(sim, 'startShape', { 'Nearly straight': 'wiggle', 'Dead straight': 'straight', 'Sine wave': 'sine' }).name('Start shape');
  const yearCtrl = help(sim.add(state, 'year').name('Year').disable(), 'year');
  const noteCtrl = sim.add(state, 'resetNote').name('').disable();
  noteCtrl.domElement.style.display = 'none';

  // --- Presets ---
  const presets = gui.addFolder('Presets');
  const presetCtrl = help(presets.add(state, 'preset', ['Custom', ...Object.keys(PRESETS)]).name('River type').onChange((name) => {
    if (name === 'Custom' || suppress) return;
    actions.applyPreset(name);
  }), 'preset');

  // --- Flow ---
  const flow = gui.addFolder('Flow');
  add(flow, 'meanDischarge', 10, 1000, 5).name('Mean discharge (m³/s)');
  add(flow, 'floodFrequency', 0, 20, 0.5).name('Floods per 100 yr');
  add(flow, 'floodSize', 1.2, 8, 0.1).name('Flood size (× mean)');
  help(flow.add({ flood: () => actions.flood() }, 'flood').name('Trigger flood (F)'), 'flood');

  // --- Channel ---
  const channel = gui.addFolder('Channel');
  add(channel, 'channelWidth', 20, 150, 1).name('Width (m)');
  add(channel, 'channelDepth', 1, 8, 0.1).name('Depth (m)');
  add(channel, 'valleySlope', 0.0001, 0.002, 0.00005).name('Valley slope (m/m)');
  add(channel, 'sedimentSupply', 0.2, 3, 0.1).name('Sediment supply');

  // --- Banks ---
  const banks = gui.addFolder('Banks');
  add(banks, 'erodibility', 0.1, 3, 0.05).name('Erodibility');
  add(banks, 'bankHeight', 1.5, 8, 0.1).name('Bank height (m)');
  add(banks, 'patchiness', 0, 1, 0.05).name('Patchiness');
  add(banks, 'hardRock').name('Hard rock patches (reset)');
  add(banks, 'paintRock').name('Paint rock with mouse');

  // --- Vegetation ---
  const veg = gui.addFolder('Vegetation');
  add(veg, 'vegGrowth', 0, 3, 0.1).name('Growth rate');
  add(veg, 'rootStrength', 0, 1, 0.05).name('Root strength');
  add(veg, 'vegDensity', 0, 2, 0.1).name('Density (visual)');

  // --- Cutoffs ---
  const cut = gui.addFolder('Cutoffs');
  add(cut, 'cutoffDistance', 0.5, 3, 0.1).name('Cutoff distance (widths)');
  add(cut, 'chuteChance', 0, 1, 0.05).name('Chute chance per flood yr');
  add(cut, 'infillRate', 0.1, 5, 0.1).name('Oxbow infill speed');

  // --- Model (advanced) ---
  const model = gui.addFolder('Model (advanced)');
  add(model, 'omega', -3, 1, 0.1).name('Omega Ω');
  add(model, 'gamma', 0, 5, 0.1).name('Gamma Γ');
  add(model, 'alpha', 0.002, 0.06, 0.001).name('Alpha α (1/m)');
  model.close();

  // --- Show ---
  const show = gui.addFolder('Show');
  add(show, 'showParticles').name('Helical flow particles');
  add(show, 'showThalweg').name('Thalweg line');
  add(show, 'showTrails').name('History trails');
  add(show, 'showLabels').name('Labels (Explain mode)');
  add(show, 'crossSectionOnClick').name('Cross-section on click');
  add(show, 'waterOpacity', 0.2, 1, 0.05).name('Water opacity');
  add(show, 'exaggeration', 1, 6, 0.1).name('Vertical exaggeration');

  // --- Scene ---
  const scene = gui.addFolder('Scene');
  add(scene, 'timeOfDay', 6, 18, 0.1).name('Time of day (h)');
  add(scene, 'fog', 0, 1, 0.05).name('Fog');
  add(scene, 'quality', { Low: 'low', Medium: 'medium', High: 'high' }).name('Quality (reset)');

  // --- Share ---
  const share = gui.addFolder('Share');
  help(share.add({ copy: () => actions.copyLink() }, 'copy').name('Copy link'), 'copyLink');
  help(share.add({ shot: () => actions.screenshot() }, 'shot').name('Save screenshot'), 'screenshot');

  for (const f of [flow, channel, banks, veg, cut, scene, share]) f.close();

  return {
    gui,
    setYear(year, flood) {
      state.year = `Year ${Math.floor(year).toLocaleString()}${flood > 0 ? '  ·  FLOOD' : ''}`;
      yearCtrl.updateDisplay();
    },
    setPlaying(playing) {
      state.playing = playing;
      playCtrl.name(playing ? '❚❚ Pause (Space)' : '▶ Play (Space)');
    },
    showResetNote(text) {
      state.resetNote = text;
      noteCtrl.domElement.style.display = text ? '' : 'none';
      noteCtrl.updateDisplay();
    },
    // Refresh every control from the settings object (after a preset or share link).
    refresh(presetName = 'Custom') {
      suppress = true;
      state.preset = presetName;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      suppress = false;
    },
  };
}
