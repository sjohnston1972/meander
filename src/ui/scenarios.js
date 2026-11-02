// Guided scenarios: each sets up a river, points the camera and plays it,
// with captions that move on as the years pass or as things happen (a
// cutoff, a landslide). Some steps also do something: switch on labels,
// trigger a landslide, build a weir. Captions can be stepped through by hand.

// What each step can wait for: `year` (the river reaches that year) or
// `event` (an engine event of that type, after `after` years). `labels`,
// `graphs` and `sediment` switch views on; `landslide` triggers one;
// `build` places a work at the sharpest bend in the middle of the river;
// `camera` flies to 'overview', 'oblique', 'bend', 'topdown' or 'end'.
export const SCENARIOS = [
  {
    id: 'oxbow', title: 'Watch an oxbow lake form',
    settings: { seed: 4, channelWidth: 45, channelDepth: 2.5, meanDischarge: 80, valleySlope: 0.0004, erodibility: 0.9, bankHeight: 4.5, patchiness: 0.8, vegGrowth: 1.4, rootStrength: 0.6, cutoffDistance: 0.8, gamma: 3, yearsPerSecond: 15 },
    steps: [
      { year: 0, camera: 'oblique', text: 'A river with soft clay banks. Its bends grow: water is fastest on the outside of each bend, so the outer bank wears away while sand builds up on the inside.' },
      { year: 80, labels: true, text: 'Explain mode is on. Look for a cut bank (outside) and a point bar (inside) on each bend. The bends also creep down the valley.' },
      { year: 200, text: 'As loops grow, two bends can grow towards each other until only a narrow neck of land is left between them.' },
      { event: 'neck', after: 0, camera: 'bend', text: 'The river has broken through a neck and taken the short cut. The abandoned loop is now an oxbow lake. Watch it slowly fill with silt and turn to marsh.' },
      { year: 0, delay: 40, text: 'That is the whole cycle: bends grow, necks are cut, oxbows are left behind. Over centuries the floodplain fills with old loops and scars.' },
    ],
  },
  {
    id: 'gorge', title: 'A gorge and its terraces',
    settings: { seed: 3, incisionRate: 12, alluviumDepth: 6, valleySlope: 0.001, erodibility: 1.5, bankHeight: 3.5, floodFrequency: 5, yearsPerSecond: 60 },
    steps: [
      { year: 0, camera: 'oblique', text: 'This river is cutting down, 12 m every thousand years, as if the land were rising. It keeps winding as it cuts.' },
      { year: 300, labels: true, text: 'The old floodplain is left standing as a terrace. Its edge is too tall for the river to wear back quickly, so the river is hemmed in.' },
      { year: 900, text: 'Below 6 m of river gravel lies bedrock. Where the river cuts into it, it slows down, and the walls show hard and soft layers.' },
      { year: 2000, text: 'Tall walls slump, rock falls onto scree, and gullies eat back into the plateau. Loops cut off up here are left hanging above the river.' },
      { year: 2600, landslide: true, text: 'A wall gives way. Debris that reaches the river can dam it into a lake.' },
    ],
  },
  {
    id: 'landslide', title: 'A landslide lake fills up',
    settings: { seed: 5, incisionRate: 20, alluviumDepth: 4, valleySlope: 0.001, yearsPerSecond: 80 },
    steps: [
      { year: 0, camera: 'oblique', text: 'A fast-cutting river. It will take a couple of thousand years to cut a deep enough gorge for the walls to fail.' },
      { year: 2400, sediment: true, labels: true, text: 'The walls are tall now. Watch the readout: sediment from the walls joins the load the river carries.' },
      { year: 2500, landslide: true, text: 'A landslide. If its debris dams the river, a lake backs up behind it.' },
      { year: 0, delay: 30, text: 'Sand and gravel the river brings drop where it meets the lake, building a delta out into it. The dam wears down as the water pours over, unless it bursts first.' },
    ],
  },
  {
    id: 'delta', title: 'A delta builds into a lake',
    settings: { seed: 1, valleyEnd: 'lake', sedimentSupply: 1.5, yearsPerSecond: 20 },
    steps: [
      { year: 0, camera: 'end', text: 'This valley ends in a lake. Everything the river carries settles where it meets still water.' },
      { year: 40, sediment: true, text: 'The readout shows how much sediment goes into the lake each year. Pale sand shows through the water where the delta is shallow.' },
      { year: 150, labels: true, text: 'The river has built land out into the lake and runs on across it. Distributaries carry some of its load to other parts of the front.' },
      { event: 'avulsion', after: 0, text: 'The distributaries have switched to new courses: an avulsion. The old ones silt up into wet hollows.' },
      { event: 'deltaAcross', after: 0, text: 'The delta has reached the far end of the lake. The river now runs on out of the valley; the bays either side are left as lakes.' },
    ],
  },
  {
    id: 'tributary', title: 'A tributary joins',
    settings: { seed: 2, tributary: 0.5, yearsPerSecond: 15 },
    steps: [
      { year: 0, camera: 'overview', text: 'A side river comes in from the valley wall. It winds and cuts off loops of its own.' },
      { year: 60, labels: true, text: 'Where it leaves the hills it drops much of its gravel in a fan. At the junction its gravel builds a bar that pushes the main river aside.' },
      { year: 250, sediment: true, text: 'Below the junction the main river carries more water, so it migrates faster, and more sediment, so its bed builds up a little.' },
    ],
  },
  {
    id: 'climate', title: 'Climate swings: braiding and meandering',
    settings: { seed: 11, climateSwing: 1, pattern: 'auto', valleySlope: 0.0028, yearsPerSecond: 40 },
    steps: [
      { year: 0, camera: 'overview', graphs: true, text: 'Wet and dry periods come and go over the centuries. The graphs show the climate, the flow and how braided the river is.' },
      { event: 'wetPeriod', after: 0, text: 'A wet period: more water, more floods, more sediment. On a slope this steep the river can no longer hold one channel, and it braids.' },
      { event: 'dryPeriod', after: 0, text: 'A dry period: less water and sediment. The threads close up into a single winding channel again.' },
    ],
  },
  {
    id: 'channelised', title: 'Straighten a river, and watch it fight back',
    settings: { seed: 1, yearsPerSecond: 15 },
    steps: [
      { year: 0, camera: 'oblique', text: 'An ordinary meandering river. In a hundred and fifty years, engineers will straighten part of it.' },
      { year: 150, build: 'straighten', labels: true, text: 'Done: 1.2 km of river has been cut straight and its banks lined with stone. The old bends are left as a lake.' },
      { year: 200, text: 'The lined reach cannot move, but the bends above and below it keep growing, and come at it ever more sharply.' },
      { year: 300, build: 'weir', sediment: true, text: 'Now a weir. Sediment fills the pool behind it; the river below runs clearer and scours its bed.' },
      { year: 450, build: 'remove', text: 'All the works are taken away. The river frees itself: the lined reach starts to wander again, and the sediment the weir held is carried off.' },
    ],
  },
  {
    id: 'wood', title: 'Beavers and log jams',
    settings: { seed: 1, channelWidth: 22, logJams: true, beavers: true, tributary: 0.2, yearsPerSecond: 10 },
    steps: [
      { year: 0, camera: 'oblique', text: 'A small wooded river. Trees fall in where the banks erode, and beavers live here.' },
      { event: 'beaverdam', after: 0, labels: true, text: 'Beavers have built a dam. The water backs up into a pond and drowns the trees. When the colony leaves, the pond silts into a wet meadow.' },
      { year: 200, text: 'Log jams back the water up, push the river against the other bank and wet the ground above them, until they rot or a flood flushes them away.' },
    ],
  },
];

const KEEP = ['quality', 'timeOfDay', 'fog', 'vegDensity', 'waterOpacity', 'exaggeration', 'showParticles', 'crossSectionOnClick'];

// `app` provides: defaults, settings, apply(settings) (reset with them),
// setView(key, on), landslide(), build(kind), camera(name), refreshControls().
export function createScenarios(app) {
  const panel = document.createElement('div');
  panel.id = 'scenario';
  panel.innerHTML = '<div class="sc-head"><span class="sc-title"></span><span class="sc-count"></span><button class="sc-close" aria-label="Close">×</button></div><p class="sc-text"></p><div class="sc-foot"><button class="sc-next">Next ›</button></div>';
  document.body.appendChild(panel);
  const titleEl = panel.querySelector('.sc-title'), countEl = panel.querySelector('.sc-count'), textEl = panel.querySelector('.sc-text');
  let current = null, index = -1, since = 0, seen = new Set();

  function show(i, year) {
    index = i;
    const step = current.steps[i];
    since = year;
    titleEl.textContent = current.title;
    countEl.textContent = `${i + 1} / ${current.steps.length}`;
    textEl.textContent = step.text;
    panel.querySelector('.sc-next').textContent = i < current.steps.length - 1 ? 'Next ›' : 'Finish';
    if (step.labels) app.setView('showLabels', true);
    if (step.graphs) app.setView('showGraphs', true);
    if (step.sediment) app.setView('showSediment', true);
    if (step.camera) app.camera(step.camera);
    if (step.landslide) app.landslide();
    if (step.build) app.build(step.build);
  }

  function start(id) {
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!sc) return;
    const next = { ...app.defaults };
    for (const k of KEEP) next[k] = app.settings[k];
    Object.assign(next, sc.settings);
    current = sc;
    seen = new Set();
    app.apply(next);
    panel.classList.add('show');
    show(0, 0);
  }

  function stop() {
    current = null;
    panel.classList.remove('show');
  }

  // Each snapshot: move on when the next step's year has come or its event has happened.
  function update(snap) {
    if (!current) return;
    for (const ev of snap.events) seen.add(ev.type);
    const next = current.steps[index + 1];
    if (!next) return;
    const due = next.event ? seen.has(next.event) && snap.year >= since + (next.after || 0)
      : next.delay ? snap.year >= since + next.delay
        : snap.year >= next.year;
    if (due) { seen.delete(next.event); show(index + 1, snap.year); }
  }

  panel.querySelector('.sc-close').onclick = stop;
  panel.querySelector('.sc-next').onclick = () => {
    if (!current) return;
    if (index < current.steps.length - 1) show(index + 1, since); else stop();
  };

  return { start, stop, update, get running() { return !!current; } };
}
