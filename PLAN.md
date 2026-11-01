# Run: tune the look of Meander

Branch: `main` (push there; do not create branches). Repo root is this directory.
Read `SPEC.md` section "3D scene and visuals" first: the target is a real valley
seen from a drone, soft daylight, gentle distant haze, clear contrast between
water, sand, grass and woodland. Realism of appearance over stylisation.

Rules for this run:
- Do not change river physics: nothing in `src/engine/` and no `defaults`,
  `CENTRELINE`, `FLOODPLAIN`, `FLOODS` or `THALWEG` values in `src/config.js`.
  `RENDER`, `QUALITY` shadow sizes, `CAMERAS` and the surface colours are fair game.
- `npm test` must stay at 51 passing and `npm run build` must succeed before every commit.
- Commit and push after every step. Append a timestamped entry to PROGRESS.md.
- Judge the look by opening the PNGs with the Read tool. If a change looks worse,
  revert it and say so in PROGRESS.md; a step can end with "tried X, kept Y".
- The automated browser cannot measure frame rate. Use the CPU timings printed by
  the screenshot script instead, and keep them within the budgets in step 8.
- Do not deploy with wrangler in this run. Steven deploys after reviewing the PNGs.

## Steps

1. **Screenshot harness.** `npm i -D playwright`, then `npx playwright install chromium`.
   Write `scripts/shoot.mjs`: builds with `vite build`, serves `dist/` with
   `vite preview --port 4173`, opens headless Chromium (viewport 1920x1080, args
   `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) at
   `http://localhost:4173/#seed=1`, waits for `window.meander`, calls
   `window.meander.sim.step(900)` and waits until `#year` shows at least year 900,
   then for each of the camera presets (keys `1`, `2`, `3`, `4`) and the Explain
   mode on, waits 1.5 s and saves `docs/looks/<label>-<preset>.png`. Also records
   every console error and prints the mean CPU ms of `terrain.update` and
   `water.update` (wrap them from the page via `window.meander.terrain.update`).
   Takes the label as `process.argv[2]`. Exits non-zero on any console error.
   *Done when* `node scripts/shoot.mjs baseline` exits 0 and
   `ls docs/looks/baseline-*.png | wc -l` prints 5.

2. **Terrain surface detail.** In `src/render/terrain.js` make the ground read
   as ground, not flat paint: per-vertex colour variation driven by height
   relative to the local floodplain (low ground slightly darker and greener,
   ridges lighter), stronger slope darkening on cut banks, and a subtle
   high-frequency tint variation. Keep it in vertex colours (no new textures)
   so the update cost does not rise more than 20%.
   *Done when* `node scripts/shoot.mjs terrain` exits 0 and PROGRESS.md records
   the terrain.update ms before and after.

3. **Channel edges.** The channel edge is visibly stepped by the grid cells. In
   `terrain.js`, when colouring a vertex next to water, blend its colour with
   the neighbouring cells' surface colours (a 3x3 average of the palette colour,
   not of the height), and in `water.js` raise `EDGE_OVERLAP` only as far as
   hides the step without the ribbon looking fat.
   *Done when* `node scripts/shoot.mjs edges` exits 0 and the `-3` (close on a
   bend) PNG shows a smooth bank line when opened with Read.

4. **Sky and haze.** Replace the flat background colour in `src/render/scene.js`
   with a sky dome (a large inverted sphere with a vertex-coloured gradient:
   pale horizon, deeper blue overhead, warm tint near the sun at low time of
   day) and keep fog consistent with the horizon colour. The time-of-day slider
   must still tint sky, fog and sun together.
   *Done when* `node scripts/shoot.mjs sky` exits 0, and the script also saves
   `docs/looks/sky-tod-7.png`, `sky-tod-12.png`, `sky-tod-17.png` (add a
   `--tod` loop to the script: set `window.meander.settings.timeOfDay` and call
   `window.meander.view.setTimeOfDay(h)` before the overview shot).

5. **Water.** In `src/render/water.js`: a touch more specular (roughness 0.12),
   a slightly deeper pool colour, a faint lighter rim along both banks of the
   river ribbon (the two outermost vertex columns), and oxbow lakes a stiller,
   slightly greener tint than the river. Flood water stays brown.
   *Done when* `node scripts/shoot.mjs water` exits 0 and water.update ms is
   within 10% of the baseline.

6. **Trees and grass.** In `src/render/vegetation.js`: two tree shapes
   (conical and a rounder broadleaf made of two or three overlapping
   icosahedra) chosen by hash, canopy colour varying more between lush and
   dry, trunks a little taller, grass tufts on bars tinted sand-green. Trees
   must not stand in water or on cut banks.
   *Done when* `node scripts/shoot.mjs trees` exits 0 and the `-3` PNG shows
   both tree shapes when opened with Read.

7. **Explain mode polish.** Labels should not overlap the control panel
   (hide any label whose screen x is within the panel's width from the right
   edge) and should fade in over 0.3 s via a CSS transition. The explanation
   card gets the feature's palette colour as a 4 px left border.
   *Done when* `node scripts/shoot.mjs labels` exits 0 and no label in the
   `-1` PNG overlaps the panel when opened with Read.

8. **Performance budget.** Run `node scripts/shoot.mjs final`. Mean CPU ms per
   call must be: `terrain.update` under 14 ms at Medium, `water.update` under
   1 ms. If over, reduce work (skip colour recompute for cells whose surface
   and vegetation did not change, using a copy of the previous arrays) until
   under budget.
   *Done when* the script prints both numbers under budget and exits 0.

9. **Record and hand over.** Write `docs/looks/README.md` listing each step,
   what changed, and the before/after PNG names, so Steven can compare them.
   *Done when* `git status --short` is empty after the final commit and push,
   and `git log --oneline | head -1` shows the handover commit.
