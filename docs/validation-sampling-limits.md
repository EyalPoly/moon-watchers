# Validation notes: sampling limits and Moon Trek

Text for the "How we know it's right" page (spec §9.3), with the evidence behind it. The web page itself does not exist yet; the web owner can lift the two boxed passages as they are.

## Boxed text: terrain sampling

> **How finely we trace the terrain matters.** Our skyline for a point is built by stepping outward from it in 720 directions: every 40 m for the first 10 km, then every 60 m up to the point's reach (at most 200 km). A narrow ridge can fall between two steps and be clipped. In an earlier run with a 240 m step, a ridge about 12 km from the physics team's test site B was clipped by 0.03°, and that site's sunlight over one day came out 1.75 hours too long (17.12 h instead of 15.37 h). With the 60 m step used now, no direction differs from a 15 m step by more than 0.01°. Features narrower than the 20 m terrain data itself, and boulders, are not seen at all.

## Boxed text: Moon Trek

> **Sun direction.** At the two physics test sites, over 25 hourly times each, our Sun azimuth and elevation agree with NASA Moon Trek's Sun Angle tool to within 0.0007° (2.4″). Trek returns the direction as seen from the Moon's centre; ours is seen from the surface point, and the whole difference is solar parallax. **Terrain, slope and lighting have not been compared with Trek.** Its lighting and slope tools need an approved account, and that comparison is still pending.

## Evidence

### Far step (our own runs, 15 Nov)

Real 20/80/240 m NASA LOLA terrain, 2 m observer, per-point reach. Largest difference in any of the 720 directions against a 15 m far step:

| Far step | Site A (89°S, 0°E, reach 46.6 km) | Site B (89°S, 8°E, reach 61.6 km) | Ray samples (A / B) |
|---|---|---|---|
| 240 m (old) | 0.032° | 0.032° | 404 / 466 |
| 120 m | 0.010° | 0.016° | 557 / 681 |
| 60 m (now) | 0.006° | 0.007° | 862 / 1111 |
| 30 m | 0.003° | 0.004° | 1472 / 1971 |

Sunlight on 15 Nov 2026 (one UTC day, one-minute samples, 2 m panel, no Earth occultation), hours with any part of the Sun's disk visible:

| Far step | Site A | Site B | Site B mean disk fraction |
|---|---|---|---|
| 240 m | 0 | 17.117 h | 0.3957 |
| 60 m | 0 | 15.367 h | 0.3869 |
| 15 m | 0 | 15.317 h | 0.3851 |

The physics team's separate run (their `MOONTREK_VALIDATION.md`) got 17.115 h at 240 m and 15.33–15.35 h with finer sampling, and isolated the cause to the far step. Two independent codes agree on both numbers. This shows the step size has converged within our own terrain model; it does not validate the terrain itself.

Reproduce: `tests/test_converge.py` (synthetic ridge), `tests/test_reference_horizon.py::test_physics_site_b_sunlight_needs_the_fine_far_step` and, on the real catalog, `uv run python -m build.converge --sites <ids>` (includes "far step 60 m vs 30 m").

### Moon Trek Sun angles

`tests/test_trek_sun.py` against `tests/fixtures/trek_sun_angles.csv`: 50 saved Trek answers (sites A and B, hourly 15 Nov 2026 00:00 to 16 Nov 2026 00:00 UTC, service altitude 0), taken from the physics team's saved live responses. Moon-centred direction: within 1e-4° (they measured 5e-7°). Surface-observer direction: within 0.0007°.

The Trek endpoint is the web client's, not a documented API, and Trek's own implementation is not published. We infer the Moon-centred reading from how the numbers behave.

### Published slope

`tests/test_physics_slope.py`: the native 20 m pixel of NASA's `LDSM_80S_20MPP_ADJ.TIF` containing each point is 4.075995° at A and 8.789190° at B, read by the physics team directly with Rasterio. This checks the lookup of published data, not Trek's slope processing or the raster's physical accuracy. Custom points use the 80 m slope raster and are labeled that way.

## What is still open
- Physics team confirmation of the 60 m step (spec §7.2).
- Direct Moon Trek terrain, slope and lighting comparison (needs a Trek account).
- The catalog masks and the shipped bundle must be rebuilt with `HORIZON_ALGO_VERSION` 3 (`make masks` on the Windows PC); until then the API refuses the old bundle.
