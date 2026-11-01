# River Meander Simulator: Build Spec

Nov 1, 2026 · @Steven

## Overview and goals

Build a free, public, desktop-browser web app where visitors watch a river carve meanders, cut off oxbow lakes and build floodplain features in a 3D landscape they can rotate, pan and zoom.

- **Look first:** it must be genuinely nice to look at. Realism of appearance matters more than scientific precision.
- **Behave believably:** the river's movement comes from a recognised, physically inspired model, so the features appear for the right reasons and in the right places.
- **Lots of control:** a grouped control panel lets visitors change flow, slope, bank strength, vegetation, floods and time speed, and see the effect.
- **Teach as it goes:** an optional Explain mode labels features (point bar, cut bank, oxbow) and says how each one formed.
- **Shareable:** the same seed and settings always produce the same river, and a link can carry both.

Out of scope for version 1: mobile and touch support, user accounts, saving to a server, and a scientifically validated research model.

## Tech stack and hosting

A static site with no server: everything runs in the visitor's browser, so Cloudflare Pages hosts it for free with nothing to maintain.

| Part | Choice | Why |
| --- | --- | --- |
| 3D engine | three.js | Requested; the standard library for 3D in a browser |
| Language | Plain JavaScript (ES modules) | Easier for Steven to read and learn from than TypeScript |
| Build tool | Vite | Fast local preview, bundles the site for upload |
| Controls panel | lil-gui | Small, grouped folders of sliders and buttons; common with three.js |
| Background work | Web Worker | Runs the river physics on a separate thread so the 3D view never stutters |
| Hosting | Cloudflare Pages, static | No backend needed; deploys from a Git repo |
| Address | meander.clydeford.net (assumed) | Matches the other clydeford.net public tools |

**Desktop only:** if the window is narrower than 1024 px, or no WebGL2 is available, show a friendly "best on a desktop browser" message instead of the app.

**In plain English:** a Web Worker is a second pair of hands inside the browser. One hand draws the picture 60 times a second; the other quietly does the river maths in the background and passes over updates.

## Architecture

The app is split into a simulation engine that decides where the river goes and a renderer that only draws it; they talk through one small, well-defined message.

**In plain English:** this is the control plane and data plane split. The engine is the routing protocol computing the topology; the renderer is the dashboard showing it. The engine never touches three.js, and the renderer never does river maths.

&#91;embedded content: how the parts fit · 3 parts and a settings file\]

Settings flow into the engine and snapshots flow out to the renderer; nothing the renderer does ever changes the physics.

The engine sends a **snapshot** to the renderer each update containing:

- the river centreline points, with width, depth and flow speed at each point
- the floodplain height grid and a surface-type grid (water, sand, grass, wetland, rock)
- oxbow lakes and their age
- recent events (a cutoff, a flood, a bank collapse) for labels and effects
- the simulated year

Suggested folder layout:

```
src/
  main.js            starts everything
  config.js          every tunable setting and its default, in one place
  engine/            river physics, runs in the Web Worker
    worker.js        receives settings, sends snapshots
    centreline.js    migration, remeshing, cutoffs
    floodplain.js    height grid, deposition, levees, oxbow infill
    random.js        seeded random numbers
  render/            three.js only
    scene.js         lights, sky, fog, camera
    terrain.js       landscape mesh from the height grid
    water.js         river and lake surfaces
    particles.js     helical flow particles
    vegetation.js    trees and grass
    labels.js        Explain mode labels
  ui/
    controls.js      lil-gui panel
    share.js         settings to and from the link
```

**Why one config file:** every number Claude Code might tweak lives in `config.js` with a comment saying what it does, so you can read and adjust behaviour without hunting through code.

## River features to simulate

Version 1 shows every common lowland meandering feature; braided rivers and incised terraces are a later option (see Assumptions).

| Feature | How it forms | How it is shown |
| --- | --- | --- |
| Meander bend | Flow deflected to one bank; erosion feeds back on itself | Channel shape migrates over time |
| Cut bank (river cliff) | Fast water on the outer bend undercuts the bank | Steep, bare earth face on outer bends |
| Point bar | Slow water on the inner bend drops sediment | Sandy, gently sloping deposit on inner bends |
| Thalweg | Line of deepest, fastest flow swings to the outside of bends | Optional line drawn along the channel bed |
| Helical flow | Water piles up on the outer bank and corkscrews across the bed | Animated particles spiralling through bends |
| Pools and riffles | Deep scour at bends, shallow gravel between them | Darker deep water at bends, lighter rippled shallows between |
| Scroll bars | Successive point bars left behind as a bend migrates | Curved ridges and hollows on the inside of bends |
| Meander neck | Two outer banks erode towards each other | Narrowing strip of land between loops |
| Neck cutoff | The river breaks through the neck | Event effect, river takes the short route |
| Chute cutoff | A flood cuts a channel across a point bar | Event during floods only |
| Oxbow lake | Abandoned loop sealed off by deposition | Still water lake beside the river |
| Oxbow infill | Lake slowly fills with sediment and plants | Lake turns to marsh, then a meander scar |
| Natural levees | Floods drop sediment on the banks as water spills out | Low ridges along the channel |
| Floodplain | Built from all the above over time | Flat valley floor with vegetation |
| Bank collapse | Undercut bank fails | Occasional chunk falling in, brief muddy plume |
| Flood | Spike in flow | Water rises, spreads over the floodplain, browner colour |

## Simulation model

Use the established centreline migration approach (Ikeda, Parker and Sawai 1981; Howard and Knutson 1984), the same idea behind the open-source meanderpy project, then build the 3D floodplain around it.

**In plain English:** the river is a chain of beads. Every tick, each bead slides sideways, further where the bend is sharper. Bends upstream also push on it a little, which is why real meanders lean downstream. When two parts of the chain touch, the loop between them is snipped out and becomes an oxbow lake.

### 1. Centreline

- The river is an ordered list of points from upstream to downstream, spaced about half a channel width apart.
- Start shape: a straight line down the valley with small seeded random wiggles, or a chosen preset.
- Upstream and downstream ends are fixed so the river always enters and leaves the map.

### 2. Migration each tick

1. Work out curvature at every point (how sharply the river turns there).
2. Work out the migration rate at each point. A local term follows curvature; an upstream term adds a weighted, fading influence from the bends above:

```latex
R_1(s) = \Omega\, R_0(s) + \Gamma \frac{\int_0^{\infty} R_0(s-\xi)\, e^{-\alpha \xi}\, d\xi}{\int_0^{\infty} e^{-\alpha \xi}\, d\xi}, \qquad R_0(s) = k\, C(s)
```

Here C is curvature, k is bank erodibility at that point, and alpha sets how quickly upstream influence fades. Starting values from Howard and Knutson are Omega = minus 1 and Gamma = 2.5; Claude Code should check these against the paper or meanderpy and expose them in `config.js`.

3. Move each point sideways (perpendicular to the flow) by rate × time step.
4. Smooth lightly and re-space the points so they stay evenly spread.

### 3. Cutoffs

- **Neck cutoff:** if two points that are far apart along the river come within about one channel width of each other in space, splice the river at that point. The removed loop becomes an oxbow.
- **Chute cutoff:** during floods only, a tight bend has a small chance of a shortcut across its point bar.
- Use a spatial grid to find close points quickly, since checking every pair is too slow.

### 4. Floodplain

- A height grid covers the valley (start at 256 × 256 cells; raise it if performance allows).
- The current channel is carved into the grid each update; land the channel leaves behind on the inside of a bend is filled as point bar, leaving scroll bar ridges.
- During floods, cells next to the channel gain height (levees) and far cells gain a little (overbank silt).
- Oxbow lakes lose depth each year until they become marsh, then dry meander scars.

### 5. Banks, vegetation and floods

- An erodibility grid sets how easily each area erodes: seeded noise plus optional hard rock patches.
- Vegetation grows on stable land over time and lowers erodibility; it is stripped where the bank collapses.
- Discharge varies year to year; floods arrive at a set frequency and size, or on the Trigger flood button. Floods speed up migration and enable chute cutoffs.

### 6. Time and randomness

- Fixed time step in simulated years; the speed control changes how many steps run per second, never the step size, so results do not change with speed.
- All randomness comes from one seeded generator, so the same seed and settings always give the same river.

### 7. Helical flow (visual only)

The corkscrew particles are driven from curvature and the thalweg position, not true fluid dynamics. State this honestly in Explain mode.

## 3D scene and visuals

The scene should read as a real valley seen from a drone: soft daylight, gentle fog in the distance, and clear contrast between water, sand, grass and woodland.

- **Terrain:** one mesh built from the floodplain height grid, coloured by surface type (sand on point bars, bare earth on cut banks, grass, wetland). A vertical exaggeration slider makes small height changes visible.
- **River water:** a ribbon mesh that follows the centreline at the right width, with an animated normal map so ripples move downstream. Colour shifts from light over riffles to dark over pools, and browner in floods.
- **Lakes:** oxbows use still water that slowly tints green and shrinks as they infill.
- **Vegetation:** instanced trees and grass clumps (one draw call each) placed on stable land, thinning near active banks and growing back over time.
- **History trails:** optional faint lines showing where the channel was 50, 100 and 200 simulated years ago.
- **Events:** a short, subtle effect for cutoffs and bank collapses (muddy plume, small splash), plus a toast message such as "Neck cutoff in year 412".
- **Cross-section panel:** click any point on the river to open a small 2D side view of the channel there, showing the bank shapes, water level and helical flow arrows.
- **Explain mode:** floating labels on the features in view, each with a two-line explanation of how it formed.
- **Lighting:** one sun with soft shadows, hemisphere sky light, a time-of-day slider for warm low-sun views.
- **Performance target:** a steady 60 frames per second at 1920 × 1080 on a mid-range desktop graphics card with default settings. A Quality setting (Low, Medium, High) trades grid size, shadows and vegetation density for speed.

## Controls panel

Controls sit in a collapsible panel on the right, grouped into folders; every slider shows its value and units, and hovering shows a one-line explanation.

| Folder | Controls |
| --- | --- |
| Simulation | Play / pause, step one year, speed (years per second), reset, seed, start shape (straight, gentle wiggle, preset), year counter |
| Presets | Lowland Scottish river, big lazy lowland river, tight-bend clay river, fast-migrating sandy river |
| Flow | Mean discharge, flood frequency, flood size, Trigger flood button |
| Channel | Width, depth, valley slope, sediment supply |
| Banks | Erodibility, bank height, patchiness (how varied the ground is), hard rock patches on or off, paint hard rock with the mouse |
| Vegetation | Growth rate, root strength (how much plants protect banks), density |
| Cutoffs | Cutoff distance, chute cutoff chance, oxbow infill speed |
| Model | Omega, Gamma, alpha (advanced, folded closed by default) |
| Show | Helical flow particles, thalweg line, history trails, labels (Explain mode), cross-section on click, water opacity, vertical exaggeration |
| Scene | Time of day, fog, quality (Low, Medium, High) |
| Share | Copy link (seed and all settings in the URL), save screenshot |

Changing a Channel, Banks or Model setting applies from the next tick without resetting. Changing the seed or start shape needs a reset, and the panel says so.

## Camera and interaction

The camera uses three.js OrbitControls with mouse and keyboard only.

| Input | Action |
| --- | --- |
| Left drag | Rotate around the focus point |
| Right drag | Pan across the valley |
| Scroll wheel | Zoom in and out, smoothly |
| Double-click | Fly to and focus on that spot |
| Click on river | Open the cross-section panel there |
| Click on a labelled feature | Show its explanation card |
| Space | Play / pause |
| F | Trigger a flood |
| R | Reset |
| 1 to 4 | Camera presets: overview, low oblique, close on a bend, top-down map |

- Zoom is limited so the camera never goes below the ground or so far out the valley edge shows.
- Camera moves between presets are animated over about one second, not instant jumps.
- A small keyboard shortcut list sits behind a ? button.

## Build phases for Claude Code

Build in seven phases, one at a time, and check each in the browser before starting the next; each phase ends with a Git commit so any mistake can be rolled back.

**How to use this with Claude Code:** put this spec in the repo as `SPEC.md`, then ask Claude Code to "read SPEC.md and do Phase 1 only". When it finishes, look at the result, then ask for Phase 2. Small steps make problems easy to spot and fix.

1. **Skeleton.** Vite project, three.js scene with a flat green valley, sky, sun, OrbitControls, an empty lil-gui panel, desktop-only message, deployed to Cloudflare Pages. *Done when* the empty valley is live at the chosen address and you can orbit around it.
2. **River engine in 2D.** Centreline migration, re-spacing, neck cutoffs and oxbow creation, shown on a simple top-down debug canvas (no 3D yet). *Done when* a nearly straight river grows bends and makes its first oxbow within two minutes at default speed.
3. **Engine into the Web Worker and into 3D.** Snapshot messages, river ribbon carved into the terrain, water surface, play / pause / speed / reset. *Done when* the Phase 2 behaviour appears in 3D with no stutter while orbiting.
4. **Floodplain features.** Height grid, point bars, scroll bars, levees, oxbow infill, surface colours, history trails. *Done when* each of those is visible and recognisable.
5. **Flow detail.** Helical flow particles, thalweg line, pools and riffles colouring, cross-section panel. *Done when* clicking a bend shows the cross-section with the deep side on the outside.
6. **Floods, banks and plants.** Variable discharge, floods and chute cutoffs, erodibility grid, hard rock painting, vegetation growth and bank collapse events. *Done when* a hard rock patch visibly deflects the river and floods leave levees.
7. **Explain mode, presets and polish.** Labels and explanation cards, presets, share links, screenshots, quality setting, performance tuning. *Done when* every check in the next section passes.

## Acceptance checks

Version 1 is finished when all of these pass on a desktop Chrome, Edge and Firefox.

- [ ] Steady 60 frames per second at 1920 × 1080 on default settings while the sim runs and the camera moves
- [ ] A nearly straight river develops clear meanders within two minutes at default speed
- [ ] Outer banks erode and inner banks build point bars, visibly
- [ ] A neck cutoff leaves an oxbow lake and the river carries on without breaking
- [ ] Oxbows infill to marsh over time
- [ ] Floods raise water, leave levees, and can cause chute cutoffs
- [ ] Same seed and settings produce the same river every time
- [ ] A copied share link reopens the same river and settings
- [ ] Pause, step, speed and reset all work; changing speed does not change the outcome
- [ ] Every control has a hover explanation
- [ ] Explain mode labels at least the cut bank, point bar, oxbow, levee and scroll bars
- [ ] Windows under 1024 px wide show the desktop-only message
- [ ] No errors in the browser console during a 10-minute run

## Assumptions and open questions

These were assumed to keep the spec moving; confirm or change them before Phase 1.

- [ ] **Name and address:** assumed "Meander" at meander.clydeford.net.
- [ ] **Accuracy:** assumed physically inspired and tuned to look right, not a validated research tool. Is that enough?
- [ ] **Braided rivers:** steep, gravel-heavy rivers split into many channels rather than meandering. Add as a later phase, or never?
- [ ] **Terraces:** a control to lower the sea or base level so the river cuts down and leaves terraces. Later phase, or never?
- [ ] **Man-made features:** bridges, embankments or straightened channels the visitor can place, to show how people change rivers. In scope?
- [ ] **Analytics:** any visitor counting (for example Cloudflare Web Analytics), or none?
- [ ] **Licence:** keep the code private, or publish it open source?
