# Meander

Watch a river carve meanders, cut off oxbow lakes and build a floodplain in a 3D valley you can rotate, pan and zoom.

Live at **https://meander.clydeford.net** (desktop browsers only).

## What it does

- A seeded river migrates using the Howard and Knutson (1984) centreline model, the same idea behind meanderpy: migration follows local curvature plus a fading upstream influence, which is why the bends lean downstream.
- Neck cutoffs leave oxbow lakes that slowly fill to marsh. Floods raise the water, leave levees and can cut chutes across point bars.
- Point bars, scroll bars, cut banks, levees, vegetation and hard rock patches all appear on the floodplain.
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

## Future work (out of scope for v1)

Braided rivers, terraces from base-level fall, man-made features such as bridges and embankments, mobile and touch support.

## Licence

MIT. Built by Steven Johnston with Claude Code.
