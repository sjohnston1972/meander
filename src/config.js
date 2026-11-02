// Every tunable number in Meander lives here, with a note on what it does.
// Units are metres and simulated years unless stated otherwise.
//
// `defaults` is the flat settings object that flows into the engine and the
// renderer. Anything a visitor can change from the control panel is in here.
// The constants below `defaults` are internal and are not exposed as controls.

export const defaults = {
  // --- Simulation ---
  seed: 1,                 // seed for all randomness; same seed + settings = same river
  startShape: 'wiggle',    // 'straight' | 'wiggle' | 'sine' initial centreline
  yearsPerSecond: 10,      // playback speed; changes steps per second, never the step size

  // --- Flow ---
  meanDischarge: 100,      // mean flow, cubic metres per second (scales migration speed)
  floodFrequency: 4,       // average number of floods per 100 years
  floodSize: 3,            // flood peak as a multiple of mean discharge

  // --- Channel ---
  channelWidth: 50,        // bank-to-bank width in metres
  channelDepth: 2.5,         // mean channel depth in metres
  valleySlope: 0.0005,     // fall per metre down the valley (0.0005 = 50 cm per km)
  incisionRate: 0,         // metres per 1000 years the river cuts down (0 = none; leaves terraces when on)
  sedimentSupply: 1,       // how quickly bars and levees build (1 = normal)
  pattern: 'meandering',   // 'meandering' | 'braided' | 'auto' (auto picks from slope, flow and sediment)
  valleyEnd: 'open',       // 'open' | 'lake': the river runs on out of the valley, or into a lake where it builds a delta
  tributary: 0,            // flow of a side river joining from one valley wall, as a share of the main river's (0 = none)
  climateSwing: 0,         // how strongly wet and dry periods come and go over the centuries (0 = a steady climate)

  // --- Banks ---
  erodibility: 1,          // bank erodibility multiplier (1 = soft lowland soil)
  bankHeight: 4,           // floodplain height above the channel bed in metres
  patchiness: 0.5,         // how varied the ground is (0 = uniform, 1 = very patchy)
  alluviumDepth: 12,       // metres of soft river sediment over bedrock; an incising river reaches rock below this
  hardRock: false,         // scatter hard rock patches that the river cannot easily erode
  paintRock: false,        // when on, click-drag on the ground paints hard rock

  // --- Vegetation ---
  vegGrowth: 1,            // how fast plants colonise stable land (1 = full cover in ~80 years)
  rootStrength: 0.6,       // how much full vegetation protects banks (0 = none, 1 = immune)
  vegDensity: 1,           // visual density of trees and grass (does not affect physics)

  // --- Cutoffs ---
  cutoffDistance: 1.0,     // neck cutoff when two reaches come within this many channel widths
  chuteChance: 0.3,        // chance per flood-year that a tight bend gets a chute cutoff
  infillRate: 1,           // how fast oxbow lakes silt up (1 = marsh in ~150 years)

  // --- Model (advanced) ---
  omega: -1,               // Howard & Knutson local curvature weight (their value: -1)
  gamma: 2.5,              // Howard & Knutson upstream influence weight (their value: 2.5)
  alpha: 0.02,             // 1/m, how fast upstream influence fades (2·Cf/D; larger = shorter, tighter bends)

  // --- Show ---
  showParticles: true,     // helical flow particles
  showThalweg: false,      // line of deepest flow
  showTrails: false,       // where the channel was 50, 100 and 200 years ago
  showLabels: false,       // Explain mode
  showSediment: false,     // colour the river by its sediment load and show the sediment budget
  showGraphs: false,       // small charts of the river's history (sinuosity, sediment, cutting down, flow)
  crossSectionOnClick: true,
  waterOpacity: 0.85,      // 0 = invisible, 1 = opaque
  exaggeration: 2,         // vertical exaggeration of the landscape

  // --- Scene ---
  timeOfDay: 15,           // hour of day, 6 (sunrise) to 18 (sunset)
  fog: 0.5,                // 0 = clear, 1 = thick haze
  quality: 'medium',       // 'low' | 'medium' | 'high'
};

// Settings that need a full reset to take effect (the panel says so).
export const RESET_KEYS = ['seed', 'startShape', 'quality', 'hardRock', 'valleyEnd'];

// Slider ranges [min, max, step] for every numeric setting. The control panel
// and the share-link decoder both use these, so a link can never smuggle in a
// value the sliders would not allow.
export const RANGES = {
  seed: [1, 99999, 1],
  yearsPerSecond: [0.5, 100, 0.5],
  meanDischarge: [10, 1000, 5],
  floodFrequency: [0, 20, 0.5],
  floodSize: [1.2, 8, 0.1],
  channelWidth: [20, 150, 1],
  channelDepth: [1, 8, 0.1],
  valleySlope: [0.0001, 0.01, 0.00005],
  incisionRate: [0, 20, 0.5],
  sedimentSupply: [0.2, 3, 0.1],
  tributary: [0, 1, 0.05],
  climateSwing: [0, 1, 0.05],
  erodibility: [0.1, 3, 0.05],
  bankHeight: [1.5, 8, 0.1],
  alluviumDepth: [4, 40, 0.5],
  patchiness: [0, 1, 0.05],
  vegGrowth: [0, 3, 0.1],
  rootStrength: [0, 1, 0.05],
  vegDensity: [0, 2, 0.1],
  cutoffDistance: [0.5, 3, 0.1],
  chuteChance: [0, 1, 0.05],
  infillRate: [0.1, 5, 0.1],
  omega: [-3, 1, 0.1],
  gamma: [0, 5, 0.1],
  alpha: [0.002, 0.06, 0.001],
  waterOpacity: [0.2, 1, 0.05],
  exaggeration: [1, 6, 0.1],
  timeOfDay: [6, 18, 0.1],
  fog: [0, 1, 0.05],
};

// Allowed values for the string settings.
export const CHOICES = {
  startShape: ['wiggle', 'straight', 'sine'],
  quality: ['low', 'medium', 'high'],
  pattern: ['meandering', 'braided', 'auto'],
  valleyEnd: ['open', 'lake'],
};

// --- Valley geometry ---
export const VALLEY = {
  length: 6000,            // metres, upstream to downstream (engine x axis)
  width: 3000,             // metres across the valley (engine y axis)
};

// --- Time ---
export const DT = 0.25;              // simulated years per engine step (fixed)
export const MAX_STEPS_PER_FRAME = 40; // cap on catch-up steps per worker timer tick
export const SNAPSHOT_HZ = 20;       // max snapshots per second sent to the renderer

// --- Centreline ---
export const CENTRELINE = {
  spacingFactor: 0.5,      // point spacing as a fraction of channel width
  wiggleAmplitude: 1.0,    // initial random wiggle, in channel widths
  wiggleWavelength: 10,    // initial wiggle wavelength, in channel widths
  sineAmplitude: 1.5,      // 'sine' start shape amplitude, in channel widths
  sineWavelength: 12,      // 'sine' start shape wavelength, in channel widths
  smoothingPasses: 0,      // light centreline smoothing per step
  curvatureSmoothing: 4,   // smoothing passes applied to curvature
  migrationScale: 4,      // m/yr per unit (curvature × width); scaled by erodibility
  dischargeExponent: 0.5,  // migration ∝ (Q / meanQ)^this
  maxRate: 12,             // m/yr cap on migration at any point (keeps the model stable)
  bankNoise: 0.05,         // random lateral wobble per step as a fraction of the migration scale
  minSeparationWidths: 4,  // neck cutoff only between reaches this far apart along the river
  depthBelowBank: 0.5,     // the channel is never deeper than bank height minus this (metres)
  knickCelerity: 5,        // m/yr a knickpoint (the step left by a base-level drop) travels upstream at mean flow
  knickLength: 250,        // metres of river over which a knickpoint's step is spread
  bedrockBankFactor: 0.5,  // erodibility of the part of a bank that is bedrock, relative to alluvium (with tall banks, never below gorgeBankFloor)
  baseLevelDrop: 2,        // metres per press of the "Drop base level" button
  minBankFactor: 0.4,      // erodibility floor for very tall banks (terrace edges); lower and an incising river freezes in a slot
  gorgeBankFloor: 0.7,     // tall and rocky banks together slow migration to no less than this; lower and loops stop growing in a gorge
  bankHeightExponent: 0.25, // tall banks slow retreat as (normal/actual)^this; higher and an incising river straightens
  endProtection: 6,        // points at each end that never migrate or cut off
  inletWander: 3,          // channel widths the river's entry point swings either side, as bends pass just upstream of the valley
  inflowYears: 150,        // years for the entry point to swing from one side to the other, roughly
  wallMarginWidths: 8,     // erodibility fades to zero this many widths from the valley walls
  outletFadeFraction: 0.12, // fraction of valley length before the outlet where migration fades out
  chuteMinWidths: 6,       // chute cutoff must short-cut at least this many widths of river
  chuteMaxWidths: 14,      // ... and at most this many
  chuteChordFraction: 0.4, // the shortcut must be no longer than this fraction of the river path it replaces
  chuteMinCurvature: 0.6,  // curvature × width above which a bend counts as "tight"
  trailInterval: 10,       // years between stored history centrelines
  trailAges: [50, 100, 200], // history trails to show, years ago
};

// --- Floodplain grid ---
export const QUALITY = {
  low:    { cols: 256, rows: 128, shadowMap: 1024, trees: 3000,  grass: 6000,  particles: 1500 },
  medium: { cols: 512, rows: 256, shadowMap: 2048, trees: 8000,  grass: 16000, particles: 3000 },
  high:   { cols: 1024, rows: 512, shadowMap: 4096, trees: 16000, grass: 32000, particles: 5000 }, // 5.9 m cells, ~8 per channel width
};

export const SURFACE = { GRASS: 0, SAND: 1, EARTH: 2, WETLAND: 3, ROCK: 4, WATER: 5, MARSH: 6, GRAVEL: 7, SCREE: 8 };

export const FLOODPLAIN = {
  baseNoise: 0.4,          // metres of gentle random relief on the initial floodplain
  reliefScale: 300,        // metres, size of the initial relief blobs
  barAboveWater: 0.3,      // metres a fresh point bar stands above the water surface
  scrollAmplitude: 0.35,   // metres, height of scroll bar ridges
  scrollPeriod: 15,        // years between scroll ridges
  innerRampWidths: 0.5,    // inner bank slopes down to the water over this many channel widths
  cutBankBandWidths: 0.3,  // outer bank cells within this band show bare earth when eroding fast
  edgeDepth: 0.2,          // metres of water at the very edge of the channel
  aggradeRate: 0.012,      // m/yr that low ground (bars, scars) rises back towards floodplain level
  leveeMaxHeight: 1.5,     // metres a levee can stand above the floodplain
  landEveryTicks: 4,       // vegetation and aggradation run every N engine steps
  leveeWidthWidths: 1.0,   // levee band width in channel widths from the bank
  leveeRate: 0.08,         // metres per flood-year added at the levee crest (× sediment supply)
  overbankRate: 0.004,     // metres per flood-year added to the far floodplain
  overbankMax: 1.0,        // metres of silt the far floodplain can gain above its base
  cutBankRate: 2,          // m/yr migration above which the outer bank shows bare earth
  oxbowInfillYears: 150,   // years for an oxbow to fill to marsh at infillRate 1
  oxbowMarshDepth: 0.6,    // metres of water below which an oxbow reads as marsh
  scarDepth: 0.4,          // metres, hollow left by a fully infilled oxbow
  vegFullYears: 80,        // years for bare land to reach full vegetation at vegGrowth 1
  vegTreeThreshold: 0.6,   // vegetation value above which trees appear
  rockPatches: 6,          // number of hard rock patches when hardRock is on
  rockRadiusWidths: 2.5,   // radius of each rock patch, in channel widths
  rockErodibility: 0.03,   // erodibility multiplier inside rock
  noiseScaleWidths: 6,     // size of erodibility noise blobs in channel widths
  bedrockNoise: 2.5,       // metres the bedrock surface rises and falls about its mean depth
  bedrockScale: 500,       // metres, size of the bedrock highs and lows
  scarpSlope: 0.6,         // steepest stable slope (rise over run, about 31 degrees) of a terrace scarp in alluvium
  scarpPasses: 2,          // slumping passes per land update while the river is cutting down
};

// --- Valley walls (only while the river is cutting down) ---
export const HILLS = {
  softRockSlope: 0.8,      // steepest stable slope of soft bedrock layers (about 39 degrees)
  hardRockSlope: 2.2,      // steepest stable slope of hard bedrock layers (about 65 degrees): they stand as cliffs
  layerThickness: 18,      // metres from one hard layer to the next
  hardFraction: 0.45,      // fraction of each layer that is hard rock
  creep: 0.5,              // m^2/yr soil creep that rounds rims (about 20x real, so it shows within a few thousand years)
  creepMinSlope: 0.05,     // gentler ground does not creep, so levees and scroll bars keep their shape
  rockfall: 0.003,         // metres a year that rock faces steeper than soft rock shed onto the scree below
  screeVegFactor: 0.3,     // plants colonise scree this fraction as fast as other ground
  slideMinHeight: 10,      // metres: walls lower than this do not fail in landslides
  slideSamples: 16,        // random ground cells checked for a failure each year
  slideChance: 0.002,      // chance a checked cell on a wall slideMinHeight tall fails that year (taller walls fail more often)
  slideFloodFactor: 3,     // landslides are this many times likelier during a flood
  slideWidth: 0.8,         // half-width of the scar, in wall heights (clamped to 1.5 to 6 cells)
  slideBack: 0.5,          // the scar reaches this many wall heights back behind the rim
  slideRunout: 2,          // the debris runs out this many wall heights beyond the foot of the wall
  slideKeep: 0.95,         // fraction of the failed mass left as debris (the rest is fines carried away)
  slidePush: 3,            // m/yr the river is pushed away from debris that reaches it, fading over slidePushYears
  slidePushYears: 30,
  slideMarks: 8,           // recent landslide scars remembered for Explain labels
  damMinHeight: 1.5,       // metres above the water debris must stand to dam the river
  damHeightFraction: 0.4,  // a dam stands at most this fraction of the failed wall's height above the water
  damErosion: 0.05,        // m/yr overtopping water lowers a dam's crest
  damFloodErosion: 4,      // ... this many times faster at a flood peak
  damFailChance: 0.004,    // chance per year that a dam damMinHeight tall bursts (taller dams are likelier to)
  damSpacing: 500,         // metres: no new dam this close to an existing one
  lakeInfill: 0.02,        // m/yr silt settles on a landslide lake's floor
  gullyChance: 0.0005,     // chance a checked cell on a wall slideMinHeight tall starts a gully that year
  maxGullies: 24,
  gullySpacing: 300,       // metres between gully mouths
  gullyRate: 0.15,         // m/yr a gully head cuts back into the plateau (faster in floods)
  gullyMinLength: 200,     // metres a gully grows to, at least ...
  gullyMaxLength: 700,     // ... and at most
  gullyGradient: 0.08,     // rise over run of a gully floor from its mouth
  fanRadius: 0.3,          // a gully's fan spreads this fraction of its length from the mouth
  fanFraction: 0.7,        // fraction of what a gully washes out that stays in its fan
  drainDrop: 1.5,          // metres the river must cut below an oxbow before the oxbow drains, left hanging
  drainYears: 20,          // years a hanging loop's lake takes to seep away
  hangingKeep: 6,          // hanging loops remembered for Explain labels
  slideLabelYears: 300,    // Explain mode labels a landslide scar for this long
};

// --- Sediment (bed material carried down the river) ---
export const SEDIMENT = {
  transport: 6.7e5,        // m^3/yr the river can carry per (m^3/s of flow x unit slope): about 20 000 m^3/yr for the default river
  porosity: 0.4,           // fraction of a deposit that is pore space
  supplyCoupling: 0.25,    // inflow from upstream = (1 + this x (sediment supply - 1)) x what the river can carry
  maxAggrade: 4,           // metres the bed can build up above its reference level
  maxScour: 6,             // metres it can be scoured below it (less where bedrock is nearer)
  wallBedFraction: 0.5,    // fraction of terrace and gorge wall material that is sand and gravel; the rest is fines
  slideBedFraction: 0.7,   // ... of landslide debris
  washRef: 20000,          // m^3/yr of fines at mean flow that make the water noticeably cloudier (and levees grow twice as fast)
  floodplainWidths: 3,     // an aggrading bed lifts the floodplain this many channel widths either side of the river
  floodplainEveryLand: 5,  // ... checked every this many land updates (years)
  maxWash: 4,              // levees and silt grow at most this many times faster in muddy water
  maxLoadExcess: 3,        // Auto braiding counts a load at most this many times what comes in from upstream
};

// --- Grain sorting (sand and gravel in the bed) ---
export const GRAIN = {
  start: 0.5,              // fraction of gravel in the bed surface to begin with, and in the ground beneath
  inflow: 0.5,             // ... in what comes in from upstream
  walls: 0.4,              // ... in what terrace and gorge walls shed
  slides: 0.6,             // ... in landslide debris
  gullies: 0.5,            // ... in what gullies wash out
  tributary: 0.65,         // ... in what the tributary brings
  sorting: 1,              // where the bed builds up, gravel drops first: deposit = p + this x p x (1 - p)
  armour: 0.6,             // where it is scoured, sand goes first: eroded fraction = g x (1 - this x (1 - g))
  activeLayer: 0.5,        // metres of bed surface that mixes with what arrives and leaves
  hiding: 0.8,             // a bed of gravel fraction g carries (1 + this x (start - g)) times as much
  gravelBars: 0.6,         // bars left behind on a bed with more gravel than this are gravel, else sand
};

// --- Lake at the valley's end (valleyEnd: 'lake') ---
export const LAKE = {
  length: 1600,            // metres of valley at the downstream end under the lake, on average
  bay: 700,                // metres further down the valley the shore lies at the valley walls than in the middle
  shoreWobble: 150,        // metres the shore wanders either side of that
  shoreScale: 700,         // metres along the shore from one bay to the next point
  shoreDepth: 3,           // metres of water just off the shore
  depth: 14,               // metres of water at the far end
  plain: 0.8,              // metres above the water the delta plain slowly builds up to
  topset: 0.2,             // metres above the water fresh delta deposits reach
  shallows: 1.5,           // deposits within this depth of the surface show as sand through the water
  reach: 140,              // metres: deposits thin out over about this distance in front of a mouth
  mouthSwing: 55,          // degrees either side the water leaving a mouth swings to, as bars come and go
  mouthSwingYears: 40,     // years, roughly, for it to swing from one side to the other
  spread: 260,             // metres around a mouth searched for open water first (further if none is left)
  finesTrap: 0.5,          // fraction of the fines reaching the lake that settle in it
  distMinLength: 250,      // metres the delta must reach out into the lake before distributaries form
  distCount: 2,            // distributaries besides the main river
  distWidth: 0.35,         // distributary width, in channel widths
  distDepth: 0.8,          // metres
  distAngle: [18, 42],     // degrees either side of the river they set off at
  distShare: 0.25,         // share of the load each distributary carries to its own mouth
  avulsionYears: 180,      // years between switches of the distributaries, on average
};

// --- Tributary (a side river joining the main river) ---
export const TRIB = {
  place: [0.3, 0.55],      // where along the valley it comes in (fraction of the valley length), picked from the seed
  widthExponent: 0.5,      // its width = main width x (its share of the flow)^this
  minWidth: 12,            // metres
  depthFraction: 0.7,      // its depth as a fraction of the main river's
  load: 1.6,               // it brings this many times what its own flow can carry at the main river's slope
  fall: 2.5,               // its fall per metre of its own length, relative to the valley slope (it comes down off the hills)
  fanWidths: 6,            // main channel widths its fan spreads out from the valley wall
  fanRate: 0.06,           // m/yr the fan builds up (times the tributary's share of the flow)
  fanHeight: 3,            // metres above the floodplain the fan reaches at its apex, against the wall
  push: 2,                 // m/yr the fan pushes the main river away from the junction, times the tributary's share
  pushWidths: 4,           // main channel widths below the junction it pushes over
  migration: 1,            // its migration per unit curvature, relative to the main river's
  wallWidths: 4,           // its own widths from the valley wall over which its migration fades out
  entryWander: 3,          // its own widths its entry point swings either side, as bends pass in its own valley
  entryYears: 120,         // years, roughly, for the entry point to swing from one side to the other
};

// --- Climate swings (climateSwing) ---
export const CLIMATE = {
  years: 1200,             // years, roughly, from one wet period to the next
  flow: 0.45,              // mean flow rises and falls by up to this fraction at full swing
  floods: 0.9,             // flood frequency, likewise
  sediment: 0.6,           // sediment supply, likewise
  label: 0.33,             // wetness beyond this (either way) is named a wet or a dry period
};

// --- History for the graphs ---
export const STATS = {
  everyYears: 5,           // years between rows
  maxRows: 1500,           // when full, every other row is dropped (and rows are kept twice as far apart)
};

// --- Braided rivers ---
export const BRAID = {
  autoThreshold: 0.03,     // 'auto' braids when slope x sqrt(mean discharge) x sediment supply is above this
  autoHysteresis: 0.15,    // ... with this fraction of slack either side, so it does not flicker
  rampYears: 30,           // years for the threads to spread out (or close up) when the pattern changes
  beltWidths: 4,           // half-width of the braidplain in channel widths, times sqrt(sediment supply)
  threadsMin: 3,           // number of threads: 2 + 1.5 x sediment supply, clamped to these
  threadsMax: 6,
  threadWidthFraction: 0.45, // each thread's width as a fraction of the channel width
  threadDepthFraction: 0.55, // each thread's depth as a fraction of the channel depth
  wavelengthWidths: 9,     // along-river length scale of the threads' wandering, in channel widths
  shiftYears: 25,          // years for the threads to wander about one wavelength's worth
  floodShift: 4,           // threads move this many times faster at a flood peak
  spread: 0.55,            // how evenly the threads are spread across the belt (0 = all wander freely)
  widthVariation: 0.6,     // threads range from (1 - this) to (1 + this) times the mean thread width, drifting over time
  taperFraction: 0.08,     // fraction of the river at each end over which the threads converge
  migrationFactor: 0.2,    // the braidplain axis migrates at this fraction of the meandering rate
  barLow: 0.15,            // metres above water of bar edges next to a thread
  barHigh: 0.75,           // metres above water of bar tops furthest from the threads
  barRiseWidths: 1.5,      // channel widths over which a bar rises from its edge to its top
  planeRate: 0.05,         // m/yr older, higher ground inside the belt is planed down to bar level
  vegScour: 0.5,           // fraction of braidplain vegetation a flood-year strips
};

// --- Thalweg and pools (channel cross-section shape) ---
export const THALWEG = {
  poolFactor: 0.8,         // pools at bends are up to this fraction deeper than the mean depth
  shiftFraction: 0.3,      // thalweg shifts this fraction of the half-width towards the outer bank
  curvatureScale: 4,       // curvature × width × this saturates the pool and shift effects
};

// --- Floods and banks ---
export const FLOODS = {
  duration: 2.0,           // years a flood lasts in the model
  dischargeVariation: 0.25, // lognormal sigma of year-to-year discharge
  floodMigrationBoost: 1,  // migration multiplier during a flood is 1 + boost·(size−1)·0.5
  collapseRateThreshold: 6, // m/yr migration above which a bank may collapse
  collapseChance: 0.15,    // chance per year that such a bank collapses
  collapseSlump: 6,        // metres of extra lateral movement when it does
  collapseVegStripRadius: 1.5, // channel widths of vegetation stripped by a collapse
};

// --- Renderer ---
export const RENDER = {
  waterLevelOffset: 0.0,   // metres above bed+depth the water surface sits
  rippleSpeed: 0.05,       // normal-map scroll speed (tiles per second)
  rippleMetres: 14,        // size of one tile of the water ripple pattern, metres
  detailMetres: 9,         // size of one tile of the ground's fine detail texture, metres
  poolColour: 0x153f52,    // deep water
  riffleColour: 0x5aa6b8,  // shallow water
  floodColour: 0x7a6a3c,   // muddy flood water
  lakeColour: 0x3f7a78,    // fresh oxbow lake (stiller, a touch greener than the river)
  marshColour: 0x5f7f4a,   // infilled oxbow
  bedrockColour: 0x857d72, // bedrock exposed in terrace walls
  rockHardColour: 0xb7a184, // hard rock layers: pale buff cliffs
  rockSoftColour: 0x8a6a55, // soft rock layers: red-brown slopes
  pondColour: 0x3a6e78,    // landslide lake
  endLakeColour: 0x3b7483, // the lake at the valley's end
  siltColour: 0x8c7650,    // water clouded with fine sediment
  clearColour: 0x8fd3e8,   // Sediment view: carrying less than comes in from upstream
  loadedColour: 0x7a5530,  // Sediment view: carrying more
  foamColour: 0xdfeef0,    // white water over a knickpoint
  surfaceColours: {
    0: 0x5d8a3a,           // GRASS
    1: 0xd2b97d,           // SAND
    2: 0x6f5a44,           // EARTH (cut bank)
    3: 0x4f7a4e,           // WETLAND
    4: 0x6e6a66,           // ROCK
    5: 0x2b4f5a,           // WATER (channel and lake bed, seen through the water)
    6: 0x6f8a4a,           // MARSH
    7: 0xa49b89,           // GRAVEL (braid bars)
    8: 0x9a8c78,           // SCREE (rock debris at the foot of walls)
  },
  treeColour: 0x2f5d2a,
  trunkColour: 0x5a4030,
  grassColour: 0x7fae4f,
  maxLabels: 12,           // Explain mode labels shown at once
  particleSize: 3.2,       // world units, helical flow particle sprite size
  particleSpeed: 25,       // metres per real second the particles travel downstream (visual)
  helixRate: 3.0,          // radians per second of corkscrew at a full bend
  terrainHz: { low: 15, medium: 10, high: 4 }, // terrain mesh rebuilds per second by quality
  vegetationHz: 2,         // tree and grass placement refreshes per second
  featureEveryTicks: 8,    // engine recomputes Explain-mode features every N steps
  floodRiseFraction: 0.9,  // flood water reaches this fraction of the bank height above normal level
  floodRiseSeconds: 0.4,   // real seconds for flood water to rise on screen
  floodFallSeconds: 3.0,   // real seconds for flood water to drain on screen (so fast runs still show it)
  cameraMinDistance: 40,
  cameraMaxDistance: 4500,
  cameraMaxPolar: 1.48,    // radians, keeps the camera above the ground
  cameraTween: 1.0,        // seconds for preset camera moves
};

// --- Camera presets (positions in renderer space: x downstream, z across, y up) ---
export const CAMERAS = {
  overview:  { pos: [-600, 2600, 3400], target: [0, 0, 0] },
  oblique:   { pos: [-3600, 320, 1500], target: [-600, 0, 0] },
  bend:      { pos: [-300, 260, 700],   target: [-300, 0, 0] },
  topdown:   { pos: [0, 4200, 1],       target: [0, 0, 0] },
};

export const PRESETS = {
  'Lowland Scottish river': {
    channelWidth: 40, channelDepth: 2.5, meanDischarge: 60, valleySlope: 0.0008,
    erodibility: 0.8, bankHeight: 3, vegGrowth: 1.2, rootStrength: 0.7, floodFrequency: 6,
  },
  'Big lazy lowland river': {
    channelWidth: 110, channelDepth: 5, meanDischarge: 400, valleySlope: 0.0002,
    erodibility: 0.6, bankHeight: 5, vegGrowth: 1, rootStrength: 0.5, floodFrequency: 3,
  },
  'Tight-bend clay river': {
    channelWidth: 45, channelDepth: 2.5, meanDischarge: 80, valleySlope: 0.0004,
    erodibility: 0.5, bankHeight: 4.5, patchiness: 0.8, vegGrowth: 1.4, rootStrength: 0.8,
    cutoffDistance: 0.8, gamma: 3,
  },
  'Incising upland river': {
    channelWidth: 45, channelDepth: 2.5, meanDischarge: 90, valleySlope: 0.001, incisionRate: 4,
    erodibility: 1.5, bankHeight: 3.5, patchiness: 0.5, vegGrowth: 0.8, rootStrength: 0.5, floodFrequency: 5,
  },
  'Braided gravel river': {
    pattern: 'braided', channelWidth: 40, channelDepth: 1.5, meanDischarge: 150, valleySlope: 0.004,
    sedimentSupply: 2.5, erodibility: 2, bankHeight: 2.5, patchiness: 0.3, vegGrowth: 0.6, rootStrength: 0.3,
    floodFrequency: 10,
  },
  'Fast-migrating sandy river': {
    channelWidth: 70, channelDepth: 2.5, meanDischarge: 150, valleySlope: 0.0007,
    erodibility: 1.8, bankHeight: 3, patchiness: 0.3, vegGrowth: 0.5, rootStrength: 0.3,
    floodFrequency: 8, chuteChance: 0.6,
  },
};

// One-line hover help for every control, keyed by settings name or action name.
export const HELP = {
  play: 'Run or pause the simulation (Space)',
  step: 'Advance one simulated year',
  yearsPerSecond: 'Playback speed. Only changes how many steps run per second; the result is the same at any speed',
  reset: 'Start again from the initial channel with the current seed and settings (R)',
  seed: 'Seed for all randomness. Same seed and settings always give the same river. Needs a reset',
  startShape: 'Shape of the initial channel. Needs a reset',
  year: 'Simulated years since the start',
  preset: 'Load a set of settings for a type of river (resets the simulation)',
  meanDischarge: 'Average flow in cubic metres per second. More water, faster migration',
  floodFrequency: 'Average number of floods per 100 years',
  floodSize: 'Flood peak as a multiple of the mean flow. Bigger floods leave more silt and cause more chute cutoffs',
  flood: 'Start a flood now (F)',
  channelWidth: 'Bank to bank width in metres',
  channelDepth: 'Mean channel depth in metres',
  valleySlope: 'Fall of the valley floor per metre. Shown as metres per kilometre',
  incisionRate: 'How fast the river cuts down, in metres per 1000 years. The old floodplain is left standing as terraces',
  dropBase: 'Lower the base level by 2 m now, as if the sea or the trunk river fell. A step (knickpoint) forms at the outlet and works its way upstream, leaving a terrace behind it',
  alluviumDepth: 'Depth of soft river sediment over bedrock. A river that cuts deeper than this meets rock, which erodes more slowly and shows in the terrace walls',
  sedimentSupply: 'How much sand and gravel comes into the valley from upstream (1 = as much as the river can carry), and how quickly bars and levees build. More than the river can carry builds its bed and floodplain up and makes it likelier to braid; less and it scours its bed',
  valleyEnd: 'Open: the river runs on out of the valley. Lake: the valley ends in a lake, and the river builds a delta out into it with everything it carries. Needs a reset',
  tributary: 'A side river joins from one of the valley walls. Its flow as a share of the main river\'s (0 = none). It builds a fan where it comes out of the hills, and its gravel builds a bar where it joins that pushes the main river aside',
  climateSwing: 'Wet and dry periods come and go over the centuries: in wet ones the river carries more water, floods more often and brings more sediment. 0 = a steady climate',
  pattern: 'Meandering: one winding channel. Braided: many shallow threads splitting and rejoining across a wide gravel bed. Auto: braids when the valley is steep, the flow strong and the sediment plentiful',
  erodibility: 'How easily banks erode. 1 is soft lowland soil',
  bankHeight: 'Height of the floodplain above the channel bed in metres',
  patchiness: 'How varied the ground is. Patchy ground makes irregular bends',
  hardRock: 'Scatter patches of hard rock that deflect the river',
  paintRock: 'When on, click and drag on the ground to paint hard rock',
  vegGrowth: 'How fast plants colonise bare ground',
  rootStrength: 'How much full plant cover slows bank erosion',
  vegDensity: 'How many trees and grass clumps are drawn. Visual only',
  cutoffDistance: 'Two reaches closer than this many channel widths join and cut off the loop',
  chuteChance: 'Chance per flood year that a tight bend is short-cut across its point bar',
  infillRate: 'How fast oxbow lakes fill with silt and plants',
  omega: 'Weight on local curvature in the Howard and Knutson model (their value: -1)',
  gamma: 'Weight on upstream curvature (their value: 2.5). Makes bends lean downstream',
  alpha: 'How quickly upstream influence fades, per metre',
  showParticles: 'Animated particles corkscrewing through bends (visual, not real fluid dynamics)',
  showThalweg: 'Draw the line of deepest, fastest flow',
  showTrails: 'Show where the channel was 50, 100 and 200 years ago',
  showLabels: 'Explain mode: label features and say how they formed',
  showGraphs: 'Small charts of the river\'s history: how winding it is, sediment leaving, how far it has cut down, flow and climate',
  showSediment: 'Colour the river by how much sand and gravel it carries (clear blue: less than comes in from upstream; brown: more), and show how much leaves the valley',
  crossSectionOnClick: 'Click a point on the river to see the channel cross-section there',
  waterOpacity: 'How see-through the water is',
  exaggeration: 'Stretch heights so small features are easier to see',
  timeOfDay: 'Hour of day. Low sun gives warm light and long shadows',
  fog: 'Distance haze',
  quality: 'Trades detail for speed. Changing it resets the simulation',
  copyLink: 'Copy a link that reopens this exact river and settings',
  screenshot: 'Save a PNG of the current view',
  record: 'Record the view as a video, with the year in the corner. Play the river fast and move the camera as you like; press again to stop and save (3 minutes at most)',
  saveFile: 'Download the whole river, landscape and history as a .meander file you can open again later',
  openFile: 'Open a .meander file saved earlier and carry on from where it was',
  landslide: 'Make the tallest valley wall give way now. Walls only get tall enough once the river has cut well down (turn up incision)',
  restorePrevious: 'Bring back the river you had before the current one (kept when it ran at least 100 years). Your river is also saved in this browser automatically'
};

// Explain-mode text: two lines each.
export const EXPLANATIONS = {
  cutbank: {
    title: 'Cut bank',
    text: 'Fast water on the outside of the bend undercuts the bank, so it collapses and retreats. The steep bare face is the river eating into the floodplain.',
  },
  pointbar: {
    title: 'Point bar',
    text: 'Slow water on the inside of the bend drops sand and gravel. The bar grows as the bend migrates away from it.',
  },
  oxbow: {
    title: 'Oxbow lake',
    text: 'A loop abandoned when the river cut through its neck. Sealed off by silt at both ends, it slowly fills in and turns to marsh.',
  },
  marsh: {
    title: 'Infilled oxbow',
    text: 'An old oxbow lake that has filled with silt and plants. Eventually only a faint curved scar in the floodplain remains.',
  },
  levee: {
    title: 'Natural levee',
    text: 'When floods spill over the bank the water slows and drops its coarsest silt first, building a low ridge along the channel.',
  },
  scrollbar: {
    title: 'Scroll bars',
    text: 'Each flood leaves a new ridge on the point bar as the bend migrates. The curved ridges and hollows record where the inner bank used to be.',
  },
  neck: {
    title: 'Meander neck',
    text: 'Two outer banks are eroding towards each other. When they meet the river takes the short route and the loop becomes an oxbow.',
  },
  helical: {
    title: 'Helical flow',
    text: 'Water piles up on the outer bank and corkscrews across the bed to the inner bank. In this app the spiral is drawn from curvature, not computed from fluid dynamics.',
  },
  thalweg: {
    title: 'Thalweg',
    text: 'The line of deepest, fastest flow. It swings to the outside of each bend, which is why pools form there.',
  },
  pool: {
    title: 'Pool',
    text: 'Deep water scoured out on the outside of the bend by the fast thalweg.',
  },
  riffle: {
    title: 'Riffle',
    text: 'Shallow, faster water over gravel between bends, where the thalweg crosses from one side to the other.',
  },
  knickpoint: {
    title: 'Knickpoint',
    text: 'A steep step in the river bed left by a fall in base level. The water speeds up over it and erodes it, so the step works its way upstream, cutting a lower valley behind it.',
  },
  terrace: {
    title: 'River terrace',
    text: 'The old floodplain, left high and dry when the river cut down to a lower level. Its tall edge erodes slowly, so it hems the river in.',
  },
  braidbar: {
    title: 'Braid bar',
    text: 'A gravel island between the threads of a braided river. The river carries more gravel than it can move, drops it in bars, and splits around them.',
  },
  braidchannel: {
    title: 'Braided channel',
    text: 'One of many shallow threads that split and rejoin across the gravel. Floods shift them about, so the pattern is never the same twice.',
  },
  landslide: {
    title: 'Landslide',
    text: 'Part of the valley wall gave way. The river undercut it, or a flood soaked it, until it was too steep to stand. The bare scar is where it broke off; the debris lies below.',
  },
  landslidedam: {
    title: 'Landslide dam',
    text: 'Landslide debris blocked the river. Water spills over the top and wears it down, but a dam like this can also burst and send a flood down the valley.',
  },
  landslidelake: {
    title: 'Landslide lake',
    text: 'The river backed up behind a landslide dam and drowned the valley floor. Silt settles on the bottom, and when the dam goes the lake drains away.',
  },
  gully: {
    title: 'Gully',
    text: 'A side valley cut by rain running off the plateau. It eats back into the land at its head, and floods carry what it washes out down to its mouth.',
  },
  fan: {
    title: 'Alluvial fan',
    text: 'Where a gully meets the valley floor its water spreads out and slows, dropping its gravel in a low cone.',
  },
  scree: {
    title: 'Scree',
    text: 'Broken rock that has fallen from the cliffs above and piled up at their foot. Plants take a long time to take hold on it.',
  },
  rockledge: {
    title: 'Rock ledges',
    text: 'Hard rock layers stand as cliffs and the softer layers between them wear back into slopes, so the valley wall rises in steps.',
  },
  hangingloop: {
    title: 'Abandoned meander',
    text: 'A loop the river cut off while it was cutting down. The river is now below it, so its water drained away, leaving a dry curved valley high on the side.',
  },
  aggrading: {
    title: 'Aggrading reach',
    text: 'More sand and gravel arrives here than the river can carry on, so it drops the rest: the bed and the floodplain beside it build up, and the water stands higher.',
  },
  scoured: {
    title: 'Scoured reach',
    text: 'The river can carry more than reaches it here, so it picks up the difference from its own bed and cuts down, until it reaches bedrock.',
  },
  armoured: {
    title: 'Armoured bed',
    text: 'The river has carried off the sand here and left the gravel behind, a coarse armour that is hard to move. It happens where the river is starved of sediment, such as below a dam.',
  },
  sandybed: {
    title: 'Sandy bed',
    text: 'Gravel drops out first wherever the river slows and builds its bed up, so further down, and in lakes and deltas, the bed and the bars are sand.',
  },
  lakedelta: {
    title: 'Lake delta',
    text: 'Where the river runs into still water it slows and drops its sand and gravel, building a delta that grows out into the lake until the lake is full.',
  },
  delta: {
    title: 'Delta',
    text: 'Where the river runs into the lake it slows and drops everything it carries. The deposits build out into the water, so the shore advances and the river grows longer over its own delta.',
  },
  distributary: {
    title: 'Distributary',
    text: 'On a delta the river splits into branches that carry water and sediment to different parts of the front. Now and then a branch is abandoned for a new course (an avulsion).',
  },
  deltalake: {
    title: 'Lake',
    text: 'The valley ends in a lake. Everything the river carries settles here, and the delta slowly fills it in.',
  },
  tributary: {
    title: 'Tributary',
    text: 'A side river coming down off the hills. It winds and cuts off its own loops like the main river, only smaller.',
  },
  confluence: {
    title: 'Confluence',
    text: 'Where the tributary joins. It brings more gravel than its own water can carry, so a bar builds at the junction and pushes the main river away. Below it the main river has more water, so it migrates faster.',
  },
  tributaryfan: {
    title: 'Tributary fan',
    text: 'Where the tributary comes out of the hills onto the valley floor it slows and drops much of its gravel, building a low cone out from the valley wall.',
  },
  flood: {
    title: 'Flood',
    text: 'The river has overtopped its banks. Brown silty water spreads over the floodplain and leaves a layer of mud behind.',
  },
};
