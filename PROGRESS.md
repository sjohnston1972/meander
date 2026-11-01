# Progress: tune the look of Meander

Goal: make the valley genuinely nice to look at (terrain detail, smooth channel
edges, sky dome, better water, varied trees, label polish) without touching the
river physics, with screenshots in `docs/looks/` so Steven can compare before
and after. Steps are in PLAN.md.

## 2026-11-01 16:39 Step 1 done: screenshot harness
- `node scripts/shoot.mjs baseline` exits 0, 5 PNGs in docs/looks/. Port 4819 (4173 was taken by another project). Headless swiftshader run takes ~4.5 min.
- Baseline timings under swiftshader: terrain.update 40.6 ms, water.update 3.2 ms (real Chrome measured 10.9 / 0.16 ms earlier; software GL inflates uploads). Step 8 budgets will be judged relative to this baseline, not absolute.
