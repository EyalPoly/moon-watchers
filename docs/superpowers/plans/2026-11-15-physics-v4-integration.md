# Physics V4 integration plan

Source: `physicsV4/MenasimMoon` (physics team release of 15 Nov) compared with `MenasimMoonV3` and with our `engine/`.

## What the comparison found

1. **`lunar_nav/` and `lunar_data/` are byte-identical to V3.** No scientific code changed. The slope source (PGDA 20 m raster), per-point reach and 0–360 longitude are already in our spec (§7.2) and engine. Nothing to port from the packages.
2. **New in V4:**
   - A horizon panorama notebook. It is a display layer over the same `build_horizon`.
   - Moon Trek validation, with findings.
   - A cache-path relocation script.
   - Docs and tests.
3. **The one finding that affects our numbers:** the 240 m far-ray step is not converged.
   - At physics site B (lat -89, lon 8), one day of sunlight is 17.11 h at 240 m and 15.33 h with finer sampling. That is about 7 points of a 24 h window.
   - Cause: a blocker at azimuth 103.5° at 12.28 km that the 240 m step misses. Setting only the far step to 60 m gives 15.349 h.
   - Our `engine/horizons.py` uses the same 40 m / 240 m schedule (`ray_distances`).
   - Our spec's convergence gate is 0.5 points of `sun_pct`.
   - `tests/test_converge.py` only widens the near window on a synthetic dome. It never varies the far step and never uses real terrain.
4. **Trek check.**
   - Their observer-based Sun direction differs from Trek by at most 0.00067° (2.4″), which is solar parallax.
   - Their slope pixel reads match the NASA raster exactly at A and B.
   - A direct Trek terrain and lighting comparison is still pending on their side.
5. **Panorama extras not in our product.**
   - A seasonal Sun band (declination min/max over 370 days).
   - A three-state Earth track (clear / blocked / unknown).
   - Our `web/src/sky/SkyView.tsx` already covers the core.

## Work items

### W1. Far-step convergence (must, server owner)
- Add `tests/test_converge_far_step.py` on a synthetic DEM with a narrow ridge about 12 km out. Assert that the skyline from `far_step_m=240` stays within a stated tolerance of `far_step_m=60`.
  - This test should fail today, and the failure is the evidence.
- Add a `build/converge.py` mode that varies the far step on the real DEM at A (-89, 0) and B (-89, 8), and compare `sun_pct` over the physics day.
- Decide the step from measured cost against gain.
  - Candidate: 60 m beyond 10 km.
  - Rays go from about 810 to about 1,800 per direction.
  - That is a roughly 2× march cost, which is fine on the 4060 and on CPU for single points (to be confirmed by timing).
- Make the schedule a named setting, not a literal default.
- Bump `HORIZON_ALGO_VERSION` from "2" to "3" so cached masks rebuild.
- Rebuild the catalog masks on the Windows PC.
- Update the spec §7.2 text. Say the 240 m step was replaced and why.
- Keep the 0.5-point gate as the acceptance check.
- **Gate:** the physics team confirms the chosen step. If they keep 240 m, record the known 7-point error as a warning on the validation page.

### W2. Physics fixtures from V4 (should)
- Add the A/B Trek first-epoch Sun directions to the geometry tests.
  - A: az 114.452764, el 1.143246.
  - B: az 106.455007, el 1.273956.
  - Epoch: 2026-11-15 00:00 UTC.
  - Tolerance: 0.001° elevation, because of the parallax gap. Our engine uses surface-observer CN+S, same as theirs.
- Add their A/B slope values (4.075996° and 8.789190°) to the slope test.
- Add their A/B 15.33 h sunlight as a cross-check in `tests/test_reference_horizon.py`, once W1 is done.
- Source files: `physicsV4/MenasimMoon/data/moontrek_validation/reference_manifest.json` and `output/moontrek_validation/*.json`.

### W3. Validation page text (should, web owner with server owner)
- Add a "Sampling limits" note: far-step convergence result, Trek Sun-angle agreement (2.4″), and the fact that a direct Trek terrain comparison is still pending.
- The text can use their wording from `MOONTREK_VALIDATION.md`. Do not claim terrain validation from the API agreement.

### W4. Sky view extras (optional, only after G3, web owner)
- Seasonal Sun band: needs about 370 days of solar declination per site.
  - Not in the series endpoint today.
  - This would be a contract step: one small field, or computed in the browser from `sun_el`.
- Earth "unknown" state: check that `SkyView.tsx` already shows NaN skyline as unknown rather than clear or blocked.
  - Their codes are 0 unknown / 1 clear / 2 blocked.
  - Our skyline NaN is already unknown.
  - Check only; no new decoder.

### Not adopting
- `rebase_cache_paths.py` and the notebooks: our `data/sources/` plus `sources.lock.json` already pin checksums.
- The `lunar_nav` and `lunar_data` packages: our engine is a separate implementation. Their code is the reference for tests only.
- Station catalog (DSN/ESTRACK): defer. The spec's "different Earth station" is a Should item.

## Order and ownership
1. W1 test and convergence run (server owner, Mac for the test, Windows PC for the real-DEM run).
2. Physics team picks the step.
3. Engine change, version bump, mask rebuild.
4. W2 fixtures. Re-run the whole suite and typecheck.
5. W3 text.
6. W4 only if time remains.

## Risks
- Finer far step changes the sunlight and Earth-contact numbers on every card. The product and physics teams should see before and after for the catalog before the switch.
- Mask size is unchanged (720 directions), so the contract and web are unaffected.
- V4's convergence evidence covers two points on one day. W1's real-DEM run extends it to the catalog.
