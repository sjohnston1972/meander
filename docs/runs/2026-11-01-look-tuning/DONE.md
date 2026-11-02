Run finished: tune the look of Meander (2026-11-01)

Accomplished (all 9 steps, each committed and pushed on main):
- Playwright screenshot harness (scripts/shoot.mjs) and a CPU bench for the terrain update (scripts/bench-terrain.mjs).
- Terrain colour detail, softened bank edges, sky dome with distance haze, water polish, two tree shapes with tinted tufts, warmer dusk, label polish.
- Terrain update is cheaper than before (13.0 -> 11.2 ms at Medium in node).
- Before/after PNGs and a guide in docs/looks/ (baseline-* vs final-*).

Not done / left for Steven:
- Deploy: not run in this run by design. Review docs/looks/final-*.png, then `npm run deploy`.
- Real frame rate on a GPU still unmeasured.
- Dusk ground reads olive, not golden; the -3-bend camera preset frames the bend from far away in the harness.

Archive: docs/runs/2026-11-01-look-tuning/ (PLAN.md and PROGRESS.md).

Suggested next run: deploy after review; then a "close-up" pass (bend camera preset distance, water ripple scale at close range, bar and cut-bank textures) once the look is approved at overview scale.
