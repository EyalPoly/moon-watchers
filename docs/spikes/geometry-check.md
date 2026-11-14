# Geometry check

What was compared, and with what result. The tests skip when their inputs are missing (no SPICE kernels, no saved
Horizons answers, no prototype).

## JPL Horizons (`tests/test_jpl_horizons.py`)

Horizons was asked for the Sun and the Earth as seen from a point on the Moon's surface at height 0 on the
1,737.4 km sphere (`CENTER='coord@301'`, `QUANTITIES='4'`, `APPARENT='AIRLESS'`, `EXTRA_PREC='YES'`, hourly), for
four sites and three 2-day windows (2026-03-01, 2027-09-15, 2030-06-01): A (−89°, 0°), B (−89°, 8°), the pole
(−90°, 0°) and a point at (−85°, 120°). The 24 answers are in `tests/fixtures/horizons/` (fetched
14 Nov 2026 with `uv run python -m build.fetch_horizons`; each was accepted only if its header named the expected
target and `Center body name: Moon (301)` and it had 49 rows).

Our side: the table built from the SPICE kernels (`build_ephemeris`), interpolated to the same hours, CN+S
vectors from the Moon's centre minus the observer, azimuth and elevation on the flat horizon (no terrain).
Angular separation from Horizons, over 147 hours per site and body:

| Site | Body | Max | Median |
|---|---|---|---|
| A | Sun | 5.5e-8° | 2.0e-8° |
| A | Earth | 1.3e-5° | 4.0e-6° |
| B | Sun | 5.5e-8° | 1.9e-8° |
| B | Earth | 1.3e-5° | 4.0e-6° |
| pole | Sun | 4.6e-8° | 5.1e-9° |
| pole | Earth | 1.3e-5° | 4.0e-6° |
| far | Sun | 6.9e-8° | 3.9e-8° |
| far | Earth | 1.4e-5° | 4.0e-6° |

The target was 0.01°; the worst case is about a thousand times smaller. Horizons states DE441; we use de440s with
the DE440 lunar orientation kernel, and the two agree to well under an arcsecond. Nothing needed investigating
(frame, light time, ephemeris version). The Earth's small constant offset (4e-6° median) is unexplained and far
below any effect the app shows.

Downloading: Python's own certificate list rejected the JPL certificate chain on the development Mac (a
self-signed root in the chain), so `build.fetch_horizons` fetches through `curl`, which verifies against the system
trust store. Verification is on.

## Physics prototype (`tests/test_reference_series.py`)

Demo point A, 30 times at 24 h steps from 2026-11-15 (drifting through the Moon's pass over Houston), the
prototype's own `SpiceGeometry` against ours, with the kernels loaded:

| Quantity | Max difference |
|---|---|
| Sun azimuth and elevation (prototype `apparent_vectors`, observer at the panel height) | 7e-5 arcsec |
| Houston direction from the antenna (prototype `vectors(..., station)`) | 2e-15° |
| Houston's `moon_el` | 7e-15° |

Samples where Houston is below its mask are skipped, as the contact rule says 0 there whatever the terrain is
(plan Decision 3; the physics team is asked to confirm). 15 of the 30 samples had Houston up.

The prototype's disk fraction was compared separately (`tests/test_visibility.py::test_matches_prototype_disk`):
500 random disks with an Earth occultor over a random skyline agree to 1e-12.
