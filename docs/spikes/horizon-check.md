# Horizon check

## Comparison with the physics prototype (Mac, cached 20 m / 80 m / 240 m crops)

`tests/test_reference_horizon.py` runs our `march` and the prototype's `build_horizon` on the same
cached LOLA crops, with the prototype's settings (0.5° azimuths, 40 m steps to 10 km, 240 m steps to
300 km, 20 km ceiling). Demo points A (−89°, 0°) and B (−89°, 8°), at 2 m (panel) and 3 m (antenna).

| Point | Height | Finite directions | Max difference, nominal | low | high |
|---|---|---|---|---|---|
| A | 2 m | 720 / 720 | 1.6e-5° | 1.6e-5° | 1.6e-5° |
| A | 3 m | 720 / 720 | 1.6e-5° | 1.6e-5° | 1.6e-5° |
| B | 2 m | 720 / 720 | 1.4e-5° | 1.4e-5° | 1.6e-5° |
| B | 3 m | 720 / 720 | 1.2e-5° | 1.2e-5° | 1.3e-5° |

Acceptance in the test: nominal within 0.01°, low and high within 0.002°, and the same directions unknown.
Skylines span −0.087° to 6.4° at A and 0.46° to 9.3° at B.

The first comparison caught a defect: low and high differed by 0.015°, because the bounds pass rounded
the target radius (R + h, about 1.7e6 m) to float32, which is only good to 0.125 m. It now works from heights.

## Skyline at centimetre heights (blend of whole-metre rows)

The bundle keeps one skyline per whole metre; any other height blends the two neighbouring rows
(`mask_at_height`). `tests/test_reference_horizon.py::test_mask_at_height_on_real_terrain` compares the
blend with a direct `march` at that height on the cached crops (Mac).

| Point | Height | Max difference | Directions above 0.01° | Most negative |
|---|---|---|---|---|
| A | 2.5 m | 0.044° | 8 / 720 | −1.4e-5° |
| A | 2.55 m | 0.049° | 8 / 720 | −1.4e-5° |
| B | 2.5 m | 0.035° | 12 / 720 | −3.1e-5° |
| B | 2.55 m | 0.032° | 10 / 720 | −3.1e-5° |

The blend is never lower than the true skyline (conservative). The plan's target was 0.01° everywhere; it
holds in all but 1-2% of directions. Those are directions where the skyline switches between a near and a
far ridge as the height changes, and the blend then follows the higher of the two. On smooth terrain (a
single mountain) the error stays under 0.003°; on bumpy ground of +-3 m within 200 m it reaches 0.2° at
1.5 m. 0.05° is a fifth of the Sun's diameter.

## Real-data run (RTX 4060 PC, 14 Nov)

Full LOLA files from PGDA product 90, placeholder catalog (`sample_a` −85.5°/0°, `sample_b`
−87.5°/100°, `sample_c` −88.5°/−120°). Nothing here used the GPU.

### Terrain units

| File | Heights (every n-th cell of the whole file) | Notes |
|---|---|---|
| 20 m, 80°S to the pole | −7,292 to +7,025 m | float32 metres, scale 1, nodata NaN, no gaps |
| 80 m, 80°S to the pole | −7,290 to +7,025 m | same |
| 240 m, 60°S to the pole | −9,088 to +7,015 m | the −9 km is the South Pole–Aitken floor, far from the sites |
| `_ERR` height errors | 0 to 8.7 m (80 m), 0 to 18 m (240 m) | a few cells are slightly negative (to −0.2 m): meaningless, too small to matter |

Every file is in the spherical south-polar stereographic projection `load_dem` expects. Around each
site, the 20 m, 80 m and 240 m windows agree on the height range within a few tens of metres. The
placeholder catalog's `elevation_m` does not match the terrain (`sample_c` says 780 m; nothing within
12 km is above 340 m); the build reads the ground from the terrain, so nothing depends on it.

### Defect found: terrain windows ignored the map scale

The first real bundle had 7 unknown directions at `sample_a` (`DEM_GAPS`), all heading north, away
from the pole. The 240 m window was a ±302 km square on the map, but the 300 km reach is measured on
the ground, and the polar map stretches distances away from the pole (1.6% at 75°S, 7% at 60°S): the
rays ended 302.2 km away on the map, outside the window. The synthetic tests never reached that far
from the pole. Each window is now scaled by the map scale at the farthest latitude its rays reach;
the fix changed only those 7 directions, from unknown to known.

### The served bundle: `20m`, `20261114-43266f39`

20 m, 80 m and 240 m terrain with their error rasters, plus the S3 ephemeris and Earth-rotation
tables. The masks take 9 s to build (3 sites, 0.3 GB peak memory) and 382 KB on disk; with the tables
the bundle is 8.0 MB, 7.3 MB zipped. Rebuilt after merging S3: the masks are identical to the first
build's (`20261114-30fa9171`, before bundles carried the ephemeris).

| Site | 2 m skyline | Blocking distance | Unknown | Warnings |
|---|---|---|---|---|
| `sample_a` | −0.087° to 20.95° | 4.8 to 105 km | 0 / 720 | none |
| `sample_b` | −0.087° to 4.74° | 0.10 to 52 km | 0 / 720 | none |
| `sample_c` | 0.93° to 13.98° | 0.06 to 55 km | 0 / 720 | none |

At every site and mast: low ≤ nominal ≤ high, and a higher mast never raises the skyline (each metre
lowers it by 0.0005° to 0.003°). `GET /sites/{id}/horizon` served it with 720 values per list,
`algo_version` "1", the immutable header with `v=`, and 422 `INVALID_PARAM` for `mast=11`.

### Convergence

`python -m build.converge --sites sample_a,sample_b,sample_c`, 2 m mast:

| Site | Near step 40 m vs 20 m | Near window 10 km vs 20 km | Reach 300 km vs 400 km |
|---|---|---|---|
| `sample_a` | 0.0076° | 0.0210° | 0.0000° |
| `sample_b` | **0.1606°** | 0.0138° | 0.0000° |
| `sample_c` | **0.2318°** | 0.0242° | 0.0000° |

Every direction was compared. Findings (above the 0.01° proxy):

- **Near step.** The large changes are all in directions whose skyline is set by terrain 50–100 m
  from the site: 20 m steps catch a small rise that 40 m steps pass over (at `sample_c`, azimuth 12°,
  the blocking terrain moves from 14.3 km to 50 m). 53 directions at `sample_b` and 72 at `sample_c`
  change by more than 0.05°. The change stays inside the low–high band from the height errors
  (0.34–0.38° wide there) in all but 1–4 directions per site. This is relief at the scale of one 20 m
  cell, where the spec already warns (`DEM_RESOLUTION`).
- **Near window.** Skylines set by a peak just beyond 10 km, which the 10 km window reads from the
  240 m terrain instead of the 20 m: up to 0.024°, median 0.0005°, but larger than the low–high band
  (0.005° that far out) in 250–290 directions per site. Small and systematic.
- **Reach.** Nothing beyond 300 km rises above the traced skyline at these sites.

Whether these matter is S4's question: its acceptance is under 0.5 percentage points of
`sun_pct` / `dte_pct`, and it re-runs this check on those. The prototype uses the same 40 m steps and
10 km window, so changing them would also move us off the reference.

### Resolution comparison

One bundle per finest terrain, built with `make_masks --terrain 40m|80m` (`20261114-7d13cc29` and
`20261114-e8bee846`), compared with `python -m build.compare_bundles <20m> <40m> <80m>`: the
largest nominal change from the served `20m` bundle. No direction is unknown in one bundle only.

| Bundle | Site | Panel 2 m | Antenna 3 m | Far-only |
|---|---|---|---|---|
| `40m` | `sample_a` | 0.018° | 0.018° | 0.018° |
| `40m` | `sample_b` | 0.308° | 0.288° | 0.019° |
| `40m` | `sample_c` | 0.410° | 0.186° | 0.016° |
| `80m` | `sample_a` | 0.024° | 0.024° | 0.024° |
| `80m` | `sample_b` | 0.401° | 0.339° | 0.026° |
| `80m` | `sample_c` | 0.707° | 0.291° | 0.019° |

- **Terrain beyond 3 km hardly depends on resolution** (far-only row: at most 0.026°), nor does a site
  whose skyline is all distant terrain (`sample_a`, blocking from 4.8 km).
- **Near terrain does.** At `sample_b` and `sample_c` the changes shrink from 80 m to 40 m but are
  still 0.3–0.4° between 40 m and 20 m at the panel: not converged at 20 m, and about as wide as the
  low–high band there (0.34–0.38°). The 20 m DEM is the finest large-area product, so a finer near
  field would need site DEMs (NASA's 5 m tiles, left out of this run).
- **A taller mast is less sensitive:** the 3 m antenna changes about half as much as the 2 m panel at
  `sample_c`, since the near relief subtends less from higher up.

### CSVs for the physics team

`python -m engine.cli horizon --site <id> --height 2|3 --bundle bundle/20261114-43266f39`: 6 files,
720 rows each, attached to the pull request (not committed: placeholder catalog).
