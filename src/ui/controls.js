// The lil-gui control panel. Every control gets a hover explanation from
// config.HELP, and settings are routed to the engine or the renderer.
import GUI from 'lil-gui';
import { HELP, PRESETS, RESET_KEYS, RANGES } from '../config.js';

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

  const add = (folder, key, ...args) => {
    const r = args.length === 0 && RANGES[key] ? RANGES[key] : args;
    return help(folder.add(settings, key, ...r).onChange(onChange(key)), key);
  };

  // --- Simulation ---
  const sim = gui.addFolder('Simulation');
  const playCtrl = help(sim.add({ play: () => actions.togglePlay() }, 'play').name('▶ Play (Space)'), 'play');
  help(sim.add({ step: () => actions.step(1) }, 'step').name('Step one year'), 'step');
  add(sim, 'yearsPerSecond').name('Speed (years/s)');
  help(sim.add({ reset: () => actions.reset() }, 'reset').name('Reset (R)'), 'reset');
  add(sim, 'seed').name('Seed');
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
  add(flow, 'meanDischarge').name('Mean discharge (m³/s)');
  add(flow, 'floodFrequency').name('Floods per 100 yr');
  add(flow, 'floodSize').name('Flood size (× mean)');
  help(flow.add({ flood: () => actions.flood() }, 'flood').name('Trigger flood (F)'), 'flood');

  // --- Channel ---
  const channel = gui.addFolder('Channel');
  add(channel, 'channelWidth').name('Width (m)');
  add(channel, 'channelDepth').name('Depth (m)');
  add(channel, 'valleySlope').name('Valley slope (m/m)');
  add(channel, 'incisionRate').name('Incision (m per 1000 yr)');
  help(channel.add({ drop: () => actions.dropBase() }, 'drop').name('Drop base level 2 m'), 'dropBase');
  add(channel, 'sedimentSupply').name('Sediment supply');

  // --- Banks ---
  const banks = gui.addFolder('Banks');
  add(banks, 'erodibility').name('Erodibility');
  add(banks, 'bankHeight').name('Bank height (m)');
  add(banks, 'alluviumDepth').name('Alluvium over bedrock (m)');
  add(banks, 'patchiness').name('Patchiness');
  add(banks, 'hardRock').name('Hard rock patches (reset)');
  add(banks, 'paintRock').name('Paint rock with mouse');

  // --- Vegetation ---
  const veg = gui.addFolder('Vegetation');
  add(veg, 'vegGrowth').name('Growth rate');
  add(veg, 'rootStrength').name('Root strength');
  add(veg, 'vegDensity').name('Density (visual)');

  // --- Cutoffs ---
  const cut = gui.addFolder('Cutoffs');
  add(cut, 'cutoffDistance').name('Cutoff distance (widths)');
  add(cut, 'chuteChance').name('Chute chance per flood yr');
  add(cut, 'infillRate').name('Oxbow infill speed');

  // --- Model (advanced) ---
  const model = gui.addFolder('Model (advanced)');
  add(model, 'omega').name('Omega Ω');
  add(model, 'gamma').name('Gamma Γ');
  add(model, 'alpha').name('Alpha α (1/m)');
  model.close();

  // --- Show ---
  const show = gui.addFolder('Show');
  add(show, 'showParticles').name('Helical flow particles');
  add(show, 'showThalweg').name('Thalweg line');
  add(show, 'showTrails').name('History trails');
  add(show, 'showLabels').name('Labels (Explain mode)');
  add(show, 'crossSectionOnClick').name('Cross-section on click');
  add(show, 'waterOpacity').name('Water opacity');
  add(show, 'exaggeration').name('Vertical exaggeration');

  // --- Scene ---
  const scene = gui.addFolder('Scene');
  add(scene, 'timeOfDay').name('Time of day (h)');
  add(scene, 'fog').name('Fog');
  add(scene, 'quality', { Low: 'low', Medium: 'medium', High: 'high' }).name('Quality (reset)');

  // --- Save and share ---
  const share = gui.addFolder('Save and share');
  help(share.add({ copy: () => actions.copyLink() }, 'copy').name('Copy link'), 'copyLink');
  help(share.add({ shot: () => actions.screenshot() }, 'shot').name('Save screenshot'), 'screenshot');
  help(share.add({ save: () => actions.saveFile() }, 'save').name('Save river to file'), 'saveFile');
  help(share.add({ open: () => actions.openFile() }, 'open').name('Open river file'), 'openFile');
  help(share.add({ prev: () => actions.restorePrevious() }, 'prev').name('Restore earlier river'), 'restorePrevious');

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
