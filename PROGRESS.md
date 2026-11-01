# Progress: tune the look of Meander

Goal: make the valley genuinely nice to look at (terrain detail, smooth channel
edges, sky dome, better water, varied trees, label polish) without touching the
river physics, with screenshots in `docs/looks/` so Steven can compare before
and after. Steps are in PLAN.md.

## 2026-11-01 16:39 Step 1 done: screenshot harness
- `node scripts/shoot.mjs baseline` exits 0, 5 PNGs in docs/looks/. Port 4819 (4173 was taken by another project). Headless swiftshader run takes ~4.5 min.
- Baseline timings under swiftshader: terrain.update 40.6 ms, water.update 3.2 ms (real Chrome measured 10.9 / 0.16 ms earlier; software GL inflates uploads). Step 8 budgets will be judged relative to this baseline, not absolute.

## 2026-11-01 16:51 Step 2 done: terrain surface detail
- Vertex colours now vary with height relative to the floodplain (damp hollows and scars darker green, levee crests drier), broad meadow patches from value noise, stronger slope shading, bare-earth faces darkest; EARTH colour toned down to 0x6f5a44.
- CPU cost (node bench, scripts/bench-terrain.mjs, medium grid): baseline 12.98 ms, after 14.2-15.0 ms (+9 to +16%, under the 20% budget). Swiftshader timings in shoot.mjs are upload-dominated and noisy (40.6 -> 62 ms), so the node bench is the yardstick.
- Harness now opens the page with ?autoplay=0 so shots are exactly year 900.

## 2026-11-01 16:57 Step 3 done: channel edges
- Cells touching water take the 3x3 average of neighbouring vertex colours (heights untouched); ribbon overlap 0.12 -> 0.16 W. Bank line in edges-3-bend.png reads smooth at the preset distance. terrain.update node bench 15.2 ms.

## 2026-11-01 17:20 Step 4 done: sky and haze
- Sky dome (inverted sphere, vertex gradient, warm glow around a low sun, follows the camera). Far ground shrunk to 2.2 x 3.6 valley and muted; default fog raised (0.00003 + fog * 0.0002) so distance fades to the horizon instead of a flat green void. sky-tod-7/12/17.png saved. Dusk tint still subtle; warmed further in Step 6.

## 2026-11-01 17:20 Step 5 done: water
- roughness 0.12 (lakes 0.10, stiller normal map), pool colour 0x153f52, lighter rim on the outer ribbon columns, lakes 0x3f7a78. water.update in swiftshader 1.5 ms vs 3.2 ms baseline (noisy, not slower).

## 2026-11-01 17:34 Step 6 done: trees and grass
- Conifer (stacked cones) and broadleaf (three icosahedra on a taller trunk) chosen per cell by a clump noise plus hash; canopy colours vary lush/dry/dark; tufts tinted sand-green on bars; no trees on cut banks (EARTH) or lakes. trees-3-bend.png shows both shapes.
- Also: dusk warmed (sun 0xffa552, horizon 0xf2a866, wider glow, hemisphere tint), PCFSoftShadowMap -> PCFShadowMap (removed in three r187, was a console warning).

## 2026-11-01 17:43 Step 7 done: Explain mode polish
- Labels hidden when their screen x falls within 70 px of the control panel; 0.3 s fade-in animation on appearance; explanation card gets a 4 px left border in the feature colour. labels-5-labels.png shows no label over the panel (the former "Meander neck" label at the panel edge is now suppressed).
- Harness waits for a free port before starting the preview server (fixes an intermittent timeout when the previous server was still shutting down).
