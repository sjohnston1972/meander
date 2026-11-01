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
