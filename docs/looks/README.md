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
