# Meander

Watch a river carve meanders, cut off oxbow lakes and build a floodplain in a 3D valley you can rotate, pan and zoom.

Live at **https://meander.clydeford.net** (desktop browsers only).

## What it does

- A seeded river migrates using the Howard and Knutson (1984) centreline model, the same idea behind meanderpy: migration follows local curvature plus a fading upstream influence, which is why the bends lean downstream.
- Neck cutoffs leave oxbow lakes that slowly fill to marsh. Floods raise the water, leave levees and can cut chutes across point bars.
- Point bars, scroll bars, cut banks, levees, vegetation and hard rock patches all appear on the floodplain.
- Optional vertical erosion: set an incision rate or drop the base level, and the river cuts down, leaving the old floodplain as terraces whose tall edges hem it in.
- A grouped control panel changes flow, slope, bank strength, vegetation, floods and speed. Explain mode labels features and says how each one formed.
- The same seed and settings always give the same river, and a link carries both.

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

### Analytics (optional)

Visitor counting uses cookie-free Cloudflare Web Analytics. Create a Web Analytics site for `meander.clydeford.net` in the Cloudflare dashboard (Analytics & Logs, Web Analytics, Add a site), copy its token, and put `VITE_CF_BEACON_TOKEN=<token>` in `.env` before `npm run deploy`. Without the token no beacon is included.

## Layout

```
src/config.js      every tunable number, with a comment
src/engine/        river physics (runs in a Web Worker, never touches three.js)
src/render/        three.js scene, terrain, water, particles, vegetation, labels
src/ui/            control panel, share links, cross-section panel, toasts
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
| Same seed and settings produce the same river | Unit test (two engines, 500 ticks, identical). |
| A copied share link reopens the same river and settings | Yes; unit tests cover round trip, garbage, out-of-range and bad encoding. |
| Pause, step, speed and reset all work; speed does not change the outcome | Yes; unit test for batching. |
| Every control has a hover explanation | Yes, from `HELP` in config.js. |
| Explain mode labels cut bank, point bar, oxbow, levee and scroll bars | Yes, plus neck, pool, riffle, helical flow (with the honesty note), marsh and flood. |
| Windows under 1024 px wide show the desktop-only message | Yes (checked at load; resizing an open window does not re-check). |
| No errors in the browser console during a 10-minute run | No errors seen in runs of several thousand simulated years; a timed 10-minute soak was not done. |

## Future work (out of scope for v1)

Braided rivers, knickpoints that migrate upstream, man-made features such as bridges and embankments, mobile and touch support.

## Licence

MIT. Built by Steven Johnston with Claude Code.
