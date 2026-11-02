# Look tuning, 2026-11-01

Screenshots from `node scripts/shoot.mjs <label>`: headless Chromium (software
GL), seed 1, year 900, 1920x1080. Suffixes: `-1-overview`, `-2-oblique`,
`-3-bend`, `-4-topdown`, `-5-labels` (Explain mode); `-tod-7/12/17` are the
overview at 07:00, 12:00 and 17:00.

Compare `baseline-*.png` (before any change) with `final-*.png` (after all of
them). The intermediate labels show each step on its own.

| Step | Label | What changed |
| --- | --- | --- |
| 1 | `baseline` | Nothing; the starting point. |
| 2 | `terrain` | Ground colour varies with height relative to the floodplain (damp hollows and old scars darker green, levee crests drier), broad meadow patches, stronger slope shading, bare-earth faces darkest. Cut-bank colour toned down. |
| 3 | `edges` | Cells touching water take the 3x3 average of their neighbours' colours, so the grid-stepped bank line softens. Ribbon overlap 0.12 to 0.16 widths. |
| 4 | `sky` | Sky dome with a horizon-to-zenith gradient and a warm glow around a low sun; the far ground shrunk and muted; default haze raised so distance fades into the horizon instead of a flat green void. |
| 5 | `water` | Water roughness 0.12, deeper pool colour, a faint lighter rim along both banks, oxbow lakes stiller and a touch greener. |
| 6 | `trees` | Two tree shapes (conifer and broadleaf) chosen by clump noise, more canopy colour variation, taller trunks, sand-green tufts on bars, no trees on cut banks. Dusk warmed. |
| 7 | `labels` | Explain-mode labels stay clear of the control panel and fade in; cards carry the feature colour. |
| 8 | `final` | All of the above, with the terrain update cheaper than the baseline. |

## Cost

Measured with `node scripts/bench-terrain.mjs` (CPU only, Medium grid 512x256):

| | terrain.update |
| --- | --- |
| baseline | 13.0 ms |
| after step 2 | 14.2 to 15.0 ms |
| final | 11.2 to 12.6 ms |

The timings printed by `shoot.mjs` run under software GL and are dominated by
buffer uploads, so they are only useful relative to each other (terrain about
40 ms, water 1.5 to 3 ms throughout).

## Not done in this run

- Real frame rate on a GPU: needs a normal display.
- The dusk ground still reads olive rather than golden; the sky is warm, the
  grass is not. A warmer hemisphere ground colour at low sun would help.
- The `-3-bend` preset frames the bend from further away in the harness than
  it does interactively; the camera preset itself was not changed.

# Close-up pass, 2026-11-02

`v11-before-*` and `v11-after-*` add three shots to the set: `-6-closeup`
(about 150 m from the sharpest bend), `-7-braided` and `-8-braided-close`
(the Braided gravel river preset at year 300). The "before" shots were taken
just before the engine moved to its own deterministic maths, so the rivers in
the two sets differ slightly in shape; compare the look, not the bends.

| Change | Where it shows |
| --- | --- |
| Water ripples sized in metres (a 14 m tile) instead of channel widths, with mipmapped normals so far water stays calm | `-6-closeup`, `-3-bend` |
| Fine ground detail: a grain texture and matching bumps tiling every 9 m, averaging out to the old tone from afar | `-6-closeup`, `-8-braided-close` |
| Bend camera (key 3) about half as far away; on a braid it frames the middle of the gravel bed | `-3-bend`, `-5-labels` |
| Dusk: stronger, warmer low sun, less blue fill, warm bounce light | `-tod-7`, `-tod-17` |
| Braid threads drawn once per pixel with a stencil, so crossings are not darker and no edge stipple | `-7-braided`, `-8-braided-close` |

Not changed: the stair-stepped outer bank where the water surface meets the
grid at Medium quality. Splitting quads along their flatter diagonal everywhere
cost about 1.5 ms per terrain update and did not visibly help; High quality
halves the steps. Steep terrace scarps do use the flatter-diagonal split.

Phone shots (`v11-phone-*`, from `node scripts/shoot-phone.mjs v11`): Pixel 7
emulation with touch, Low quality, folded panel, touch toolbar, help sheet.

## 2026-11-02: gorges (v1.2)

`v12-gorge-*` from `node scripts/shoot-gorge.mjs v12`: seed 1 cutting down at
15 m per 1000 years, at year 4000 (60 m below the old floodplain), Medium
quality. The "before" is Steven's screenshot from v1.1: grey walls standing
at one steep angle, and a dead-straight canyon below the inlet.

| Change | Where it shows |
| --- | --- |
| The river keeps winding in its gorge and cuts off loops; no straight canyon below the inlet (its entry point swings slowly) | `-1-overview`, `-2-oblique` |
| Loops cut off while cutting down are left hanging, dry, on the terraces | `-1-overview`, `-3-labels` |
| Bedrock walls coloured by layer: pale buff hard cliffs, red-brown soft slopes, in steps | `-6-ledges`, `-5-gully` |
| Rims rounded by creep; scree below the cliffs; gullies with fans | `-5-gully`, `-6-ledges` |
| Landslide scars and debris (random, and the Landslide button) | `-4-landslide`, `-7-button` |
| Explain labels for landslides, gullies, fans, scree, rock ledges, abandoned meanders | `-3-labels` |

`v12-phone-*` are the usual phone checks (`node scripts/shoot-phone.mjs v12`).

## 2026-11-02: sediment (v1.3)

`v13-gorge-*` from `node scripts/shoot-gorge.mjs v13 2500`: the same gorge
river at year 2500, now carrying a sediment budget.

| Change | Where it shows |
| --- | --- |
| Water clouded where the river carries fines from walls, landslides and gullies (it only gets muddier downstream, and clears below a landslide lake) | `-1-overview`, `-2-oblique` |
| Show, Sediment load: the river coloured by its load (clear blue: less than comes in from upstream; brown: more), and the budget in the corner | `-8-sediment` |
| Explain labels for aggrading and scoured reaches and lake deltas | `-3-labels` |
