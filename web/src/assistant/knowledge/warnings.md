# Warnings: what each means and what to do

Every result lists the warnings that apply. Severity: **blocking** (the score is excluded), **caution** (a number may be off or unavailable), **info**. The list is `config/warnings.yaml`, published by the server's `/meta`.

| Code | Severity | Affects | Meaning | What the user can do |
|---|---|---|---|---|
| `EXCLUDED_PSR` | blocking | score | The site is inside a permanently shadowed region, so every grade is 0 and the score is 0 | Pick a site outside the PSR, or switch off "Reject sites inside a PSR" to see its ungated score |
| `EXCLUDED_SLOPE` | blocking | score | The slope is above the maximum slope (default 15°), so the score is 0 | Pick a flatter site, or raise the maximum slope in Grading Weights (illustrative) |
| `NULL_GRADE:<grade>` | caution | score | That grade couldn't be computed (often unknown terrain) and counts as 0, lowering the score | Check the warnings for missing terrain; try a nearby point or a catalog site; or set that grade's weight to 0 |
| `PSR_UNKNOWN` | info | score | The PSR map has no value here, so the PSR check wasn't applied | Nothing; be aware the site could be in shadow permanently |
| `DEM_GAPS` | caution | skyline | Some skyline directions cross missing terrain, so those directions are unknown; times when the Sun/station is in those directions are "unknown" | Look at unknown hours; a nearby point may have complete terrain |
| `UNCERTAINTY_UNAVAILABLE` | info | skyline | The height-error map doesn't cover the whole skyline, so the uncertainty range is unavailable | Nothing |
| `SPARSE_MEASUREMENTS` | caution | all | Fewer than one laser measurement per pixel: terrain here is interpolated | Treat small differences between sites with care |
| `EFFECTIVE_RESOLUTION` | caution | slope | The data's real resolution is coarser than the 20 m slope map | Treat the slope as approximate |
| `EARTH_ORIENTATION_PREDICTED` | info | contact | The mission runs past 2026-08-06, so the Earth's orientation (and the station's position) is predicted, not observed | Nothing; contact times may shift slightly |
| `CUSTOM_COARSE_TERRAIN` | caution | skyline | A custom point uses 80 m terrain (catalog sites use 20 m); near-horizon angles can differ by up to about 0.7° | Prefer a catalog site nearby for final numbers |

## "Always true" notes (apply to every result)
- `DEM_RESOLUTION`: rocks and relief smaller than a terrain cell are not modeled.
- `GEOMETRIC_CONTACT`: contact uses instantaneous positions (no light-time delay).
- `DISK_QUADRATURE`: the Sun's and Earth's disks use 128-strip sampling and a small-angle approximation.

## Explaining a low score
1. Read the score's **deciding factor** and the **points lost** per grade: the biggest losses are the reason.
2. Read the **chip reasons** (Sun %, Earth %, slope against their thresholds).
3. Read the **warnings**: blocking ones explain a 0; `NULL_GRADE` explains a grade counted as 0; `DEM_GAPS`/unknown hours explain "unavailable" numbers.
4. Suggest concrete changes the app can make: another landing date (+29.5 d keeps the same Sun angle; a few days changes it), taller panel or antenna, another station, a nearby site (Manual Selection), or different score weights if the user's priorities differ.

Sources: `config/warnings.yaml`, `api/warnings.py`, `api/summary_json.py`, `web/src/ui/WarningsStrip.tsx`, design spec §7.3 and §7.8.
