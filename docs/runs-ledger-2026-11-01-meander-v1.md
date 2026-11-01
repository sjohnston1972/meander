# SDD ledger — plan: docs/superpowers/plans/2026-11-01-meander-v1.md
Pre-flight: shared interfaces T2->T3 (centreline fns), T4->T5 (Engine API, settings shape), T6->T7-T10 (snapshot shape): names fixed in plan Produces blocks; no conflicts found.
Ruling: no worktree — brand-new repo with no main history to protect; cost if wrong: none.
Ruling: TDD applies to engine, share and config modules (pure JS). Renderer/UI modules are verified in the browser, since three.js output cannot be asserted in vitest without WebGL; cost if wrong: visual regressions caught only by eye.
Task 1: complete (commit b29013c, deployed meander.clydeford.net, repo sjohnston1972/meander)
Task 2: complete (commit 63c3340, tests: npx vitest run -> 13/13 pass)
Task 3: Ruling: migrationRate takes curvature and channel width as arguments (x, y, c, k, params, ds, W) and cutoff finders take an endProtection count, instead of the plan's narrower signatures — avoids recomputing curvature and lets the engine reuse it for depth/thalweg; cost if wrong: a signature rename.
Task 3: complete (commit 9a56cca, tests: npx vitest run -> 21/21 pass). Ruling: 'protected ends' test fixture changed so the whole hairpin sits inside the protected zone; the original fixture's limbs extended past protection so a hit was correct behaviour — cost if wrong: none.
Task 4: Ruling: valley enlarged to 6000x3000 m and default width 50 m — Howard-Knutson loops grow to ~10-20 widths, so the spec's implied valley was too small for them; cost if wrong: grid cells coarser per channel width (quality presets compensate).
Task 4: Ruling: upstream convolution excludes the local point and erodibility multiplies the whole R1 — the literal plan formula was anti-diffusive at alpha·ds > 0.4 and let immovable banks move; cost if wrong: slightly different bend shapes from meanderpy.
Task 4: Ruling: added bankNoise (random lateral wobble) not in the spec — without it the upstream 40% of the river never bends; cost if wrong: cosmetic.
Task 4: complete (commit HEAD, tests: npx vitest run -> 29/29 pass; debug.html checked in Chrome: bends grow, first oxbow ~year 380)
Task 5: complete (commit 4cb7779, tests: npx vitest run -> 37/37 pass). Ruling: floodplain grid (Task 6/7 scope) written here with Task 7's tests since the engine, worker and snapshot shape all depend on it; cost if wrong: none.
Tasks 6-12: complete (commit a31da85, tests: npx vitest run -> 40/40 pass; browser checks in Chrome: terrain, river, bars, cut banks, oxbow, labels, cross-section, trails, thalweg, rock painting, share link, deployed to meander.clydeford.net). Ruling: share.js test and implementation written in the same step (test ran RED->GREEN in one run) — cost if wrong: weaker proof the test can fail. Ruling: Web Analytics beacon gated on VITE_CF_BEACON_TOKEN because the API token lacks the RUM permission; Steven creates the site in the dashboard. Ruling: fps acceptance not measurable in the automated Chrome window (rAF throttled to 2 fps even on a blank page); CPU costs measured instead.
Final review: fresh reviewer (opus) on the whole branch. Verdict "with fixes". Fix pass (commit 2e5548f):
Final: fixed malformed/out-of-range share links crash — test/share-safety.test.js RED->GREEN, suite 51/51
Final: fixed oxbow lakes buried under terrain (stamp at creation claims river cells) — floods.test 'keeps river cells below water...' RED->GREEN
Final: fixed river not re-carving old lake cells (lakeLost) — same test
Final: fixed chute cutoffs firing on trivial reaches (chord <= 0.4 path, path >= 6 W) — floods.test 'neck cutoffs are the common kind' RED->GREEN
Final: fixed bankHeight/valleySlope/patchiness not applying mid-run (rebase, live patch sampling, depth clamp) — floods.test 'applies bank height...' and 'applies patchiness...' RED->GREEN
Final: fixed lake ribbons re-uploaded every update (one mesh per oxbow, built once, keyed by id) — verified in Chrome
Final: fixed presets leaking into each other (defaults restored first) — code change, verified by reading; no unit test (UI)
Final: fixed missing planned tests (test/floods.test.js: flood flag, no chute without flood, rock deflection) — all GREEN
Final: Ruling: vegetation counts re-graded from Minor to Important (Low quality drew High's 48k instances) and fixed — cost if wrong: none
Final: Ruling: camera floor re-graded to Important (camera could enter upstream terrain) and fixed with a terrain probe — cost if wrong: none
Final: Ruling: cell walker wedge gap found while fixing #3 (corner cells unclaimed) — fixed; cost if wrong: none
Final: minor (deferred): shadow map size only set at page load, not on quality change
Final: minor (deferred): High grid is 1024x512 (plan said 768x384) — chosen for 5.9 m cells; no ruling was written at the time
Final: minor (deferred): rock painting raycasts the full terrain mesh per pointermove; paused paints send a full snapshot each
Final: minor (deferred): a snapshot in flight across a reset can show the old river briefly (no generation id)
Final: minor (deferred): cross-section panel keeps its point index across cutoffs and resampling
Final: minor (deferred): clearing rock drops the cell's patchiness value (now live-sampled, so only the rock flag matters — effectively resolved)
Final: minor (deferred): rock the river cut into shows as sand afterwards (surface) though it stays hard (erodibility)
Final: minor (deferred): small per-update allocations in water.js (level array per lake, now once per lake), trails.js, vegetation clumpNoise closure
Final: minor (deferred): desktop-only width check only at load; no hashchange handler for links pasted into an open tab
Final: minor (deferred): cross-browser determinism (Math.exp/sin differences between engines) untested

Second fix pass (Steven asked to finish the review): deferred minors addressed where they touch a visitor.
Final: fixed shadow map size now follows the quality setting on reset (scene.setQuality) — verified in Chrome (1024 after switching to Low)
Final: fixed rock painting picks the ground with two plane intersections instead of raycasting the terrain mesh; paint strokes no longer post a snapshot each — verified in Chrome
Final: fixed reset race with a generation id carried on every snapshot (sim.js drops stale ones) — code change, verified by reading
Final: fixed cross-section panel follows the clicked spot across cutoffs and re-spacing, and closes if the river leaves it — verified in Chrome (year 750 to 800)
Final: fixed share link pasted into an open tab applies via hashchange and resets — verified in Chrome
Final: fixed desktop-only message now also appears when the window is resized below 1024 px — code change
Final: fixed per-call closure in vegetation clumpNoise hoisted — code change
Final: Ruling: High grid stays 1024x512 (documented in config.js) — 5.9 m cells give ~8 cells per channel width; cost if wrong: slower terrain updates on High (throttled to 4 Hz)
Final: minor (deferred): cross-browser determinism (Math.exp/sin differences) untested; needs Firefox on a real display
Final: minor (deferred): rock the river has cut into keeps its hardness but reads as sand once abandoned — already shows ROCK on abandon since the fix pass; only the carved bed shows as water
