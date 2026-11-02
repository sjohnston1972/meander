# Meander

Watch a river carve meanders, cut off oxbow lakes and build a floodplain in a 3D valley you can rotate, pan and zoom.

Live at **https://meander.clydeford.net**. Works in desktop browsers and on phones and tablets with WebGL2.

## What it does

- A seeded river migrates using the Howard and Knutson (1984) centreline model, the same idea behind meanderpy: migration follows local curvature plus a fading upstream influence, which is why the bends lean downstream.
- Neck cutoffs leave oxbow lakes that slowly fill to marsh. Floods raise the water, leave levees and can cut chutes across point bars.
- Point bars, scroll bars, cut banks, levees, vegetation and hard rock patches all appear on the floodplain.
- Optional vertical erosion: set an incision rate, and the river cuts down while still meandering, leaving the old floodplain as terraces. Dropping the base level sends a knickpoint (a step in the bed, with white water) up the river. Below the alluvium lies bedrock, which erodes more slowly and shows in the walls. Terrace scarps and river bluffs slump to a stable slope.
- Braided rivers: switch the channel pattern to Braided (or Auto, which braids steep, sediment-rich rivers) and the river spreads into shallow threads that split and rejoin across a wide gravel bed, shifting with every flood.
- A grouped control panel changes flow, slope, bank strength, vegetation, floods and speed. Explain mode labels features and says how each one formed.
- The same seed and settings always give the same river in every browser, and a link carries both. The engine uses its own arithmetic-only maths (`src/engine/dmath.js`) because browsers' built-in `Math.exp`, `Math.sin` and friends differ in their last bits.
- Your river is saved in the browser as it runs and comes back when you return. Save and share also saves the whole river to a `.meander` file, opens one again, brings back the river you had before, and records a time-lapse video of the view.
- On a phone or tablet the panel starts folded away, a toolbar gives play, flood, camera and help buttons, and quality starts at Low.

The model is physically inspired and tuned to look right. It is not a validated research tool. The helical flow particles are drawn from curvature, not computed from fluid dynamics.

## Running it

```
npm install
npm run dev        # local preview
npm test           # engine unit tests
npm run build      # bundle to dist/
npm run deploy     # build and deploy to Cloudflare
```

`debug.html` shows the 2D engine on its own, which is handy when tuning the model.

Checks that need a browser:

```
node scripts/determinism.mjs        # same rivers in Node, Chromium, Firefox and WebKit
node scripts/shoot.mjs <label> --tod  # screenshots to docs/looks/ (see docs/looks/README.md)
node scripts/shoot-phone.mjs <label>  # phone emulation screenshots and touch checks
```

Add `?fresh` to the URL to skip resuming the autosaved river, and `?autoplay=0` to start paused.

### Analytics (optional)

Visitor counting uses cookie-free Cloudflare Web Analytics. Create a Web Analytics site for `meander.clydeford.net` in the Cloudflare dashboard (Analytics & Logs, Web Analytics, Add a site), copy its token, and put `VITE_CF_BEACON_TOKEN=<token>` in `.env` before `npm run deploy`. Without the token no beacon is included.

## Layout

```
src/config.js      every tunable number, with a comment
src/engine/        river physics (runs in a Web Worker, never touches three.js)
src/render/        three.js scene, terrain, water, particles, vegetation, labels
src/ui/            control panel, share links, save files, recorder, cross-section panel, toasts
src/storage.js     the browser autosave (IndexedDB)
test/              vitest tests for the engine
docs/              spec and plans
```

See `SPEC.md` for the full build spec.

## Acceptance checks (v1, 2026-11-01)

Checked in Chrome on the live site unless noted. "Unit test" means `npm test` covers it.

| Check | Result |
| --- | --- |
| Steady 60 fps at 1920x1080 on default settings | Not measurable in the automated browser used for the build (its frame timer was throttled to 2 fps even on a blank page). CPU cost per frame is small; needs a check on a normal display. |
| A nearly straight river develops clear meanders within two minutes | Yes. First neck cutoff between years 700 and 2000 depending on seed (unit test: at least two neck cutoffs in 2000 years). |
| Outer banks erode and inner banks build point bars, visibly | Yes: bare-earth cut banks and sandy point bars, labelled in Explain mode. |
| A neck cutoff leaves an oxbow lake and the river carries on | Yes (unit tests: cutoff splice, lake bed below lake level, river cells below water). |
| Oxbows infill to marsh over time | Yes: lake tints green, surface turns to wetland then marsh, label changes to "Infilled oxbow". |
| Floods raise water, leave levees, can cause chute cutoffs | Yes (unit tests: flood flag, levee build, chute only during floods). |
| Same seed and settings produce the same river | Unit test (two engines, 500 ticks, identical). Since 2026-11-02 also across Node, Chromium, Firefox and WebKit (`scripts/determinism.mjs`). |
| A copied share link reopens the same river and settings | Yes; unit tests cover round trip, garbage, out-of-range and bad encoding. |
| Pause, step, speed and reset all work; speed does not change the outcome | Yes; unit test for batching. |
| Every control has a hover explanation | Yes, from `HELP` in config.js. |
| Explain mode labels cut bank, point bar, oxbow, levee and scroll bars | Yes, plus neck, pool, riffle, helical flow (with the honesty note), marsh and flood. |
| Windows under 1024 px wide show the desktop-only message | Yes in v1. Replaced on 2026-11-02 by phone support; the message now shows only without WebGL2. |
| No errors in the browser console during a 10-minute run | No errors seen in runs of several thousand simulated years; a timed 10-minute soak was not done. |

## Changes since v1 (2026-11-02)

- Save and resume, `.meander` files, earlier-river slot, time-lapse recording.
- Knickpoints, bedrock, slumping scarps; incising rivers keep meandering.
- Braided rivers (procedural threads over a gravel braidplain, not a sediment-transport model).
- Close-up look: ripples sized in metres, fine ground detail, a closer bend camera, warmer dusk.
- Phones and tablets.
- Cross-browser determinism. Links made before 2026-11-02 replay with small differences, since every river shifted once in its last bits.

## Future work

Man-made features such as bridges and embankments; knickpoints in braided rivers; sediment-transport braiding.

## Licence

MIT. Built by Steven Johnston with Claude Code.
