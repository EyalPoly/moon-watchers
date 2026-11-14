# S2 Horizon Mask (Server Track) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For every catalog site, compute the terrain skyline from real LOLA terrain: 720 elevation angles with nominal, low and high variants, plus blocking distances, for heights 1–10 m and a far-only variant. Store it in a versioned bundle and serve it at `GET /api/v1/sites/{id}/horizon`.

**Architecture:** Contract first: the Pydantic model and sample answers land before any engine code (build approach §5). The engine is pure NumPy functions: `engine/terrain.py` for projection and DEM reads, `engine/horizons.py` for the ray-march. A build script writes `masks.npy` / `blocking.npy` per site into `bundle/<bundle_id>/server/`. The API loads the bundle at startup and refuses to start on a version mismatch or a missing site file. The physics team's prototype (`MenasimMoon/lunar_nav`, P1) is the test reference for the skyline.

**Tech Stack:** Python 3.12, NumPy, rasterio (windowed GeoTIFF reads), pyproj (tests), scipy + shapely (only to import the reference prototype in tests), FastAPI, Pydantic v2, pytest, mypy strict.

**Spec:** `docs/superpowers/specs/2026-11-10-lunar-landing-site-navigator-design.md` (§6.1–6.4, §7.2, §7.3 "Uncertainty range" and "Data warnings", §8.2, §11.1, §12.3) and `docs/superpowers/specs/2026-11-14-build-approach-design.md` (§5, §7, §9 row S2). Executors read both.

## Where the server stands (as of `b8f50f1` on `main`, 14 Nov)

Slices S0 and S1, server side, are done and merged (plan `2026-11-14-g1-skeleton-and-catalog.md`). `uv run pytest`: 54 passed, 1 skipped.

| Done | Where |
|---|---|
| FastAPI app factory, CORS, `problem+json` errors with the 8 stable codes | `api/main.py`, `api/errors.py` |
| `GET /health`, `GET /meta` (sample-backed, 60 s cache) | `api/main.py`, `contract/samples/{health,meta}.json` |
| `GET /sites`, `GET /sites/{id}` from a placeholder catalog (3 sites, `is_placeholder: true`), hostile ids give 404/422 `problem+json` | `api/catalog.py`, `catalog/sites.yaml`, `tests/test_api_sites.py` |
| Contract tooling: models → `contract/openapi.json` + `web/src/api/schema.d.ts`, sample validation, CI drift check | `api/contract.py` (`make contract`) |
| Source lockfile and checksummed download (`make fetch`); SPICE kernels (6 files, DE440 set) downloaded and pinned | `build/fetch_sources.py`, `data/sources.lock.json` |
| GPU timing spike script | `build/gpu_spike.py` |
| CI (python, contract drift, web, e2e), two previews deployed | `.github/workflows/` |

| Not done from G1 | Note |
|---|---|
| LOLA DEMs not downloaded; their `sha256` fields are empty | The first `make fetch` prints the hashes; commit them. Total 7.9 GB, so fetch only what each step needs (Task 5). |
| GPU timing not measured | Mac is Intel (`x86_64`): PyTorch has no wheel for it. Run `build/gpu_spike.py` on the 4060 and fill `docs/spikes/gpu-timing.md`. |
| Hosting undecided | `docs/spikes/hosting.md`; nothing here depends on it. |
| `engine/` is empty (`__version__` only); no `/scenario/*`, no `/sites/custom` | These are S3 onwards. |

**Next step per the spec:** slice S2 (build approach §9), the first slice on the road to gate G2 ("one catalog site works end to end with real numbers", spec §13.2). This plan is its server track. The web track (sky view silhouette) is the web owner's and reads only this plan's contract (Task 1).

## Decisions this plan makes

1. **NumPy, not PyTorch, for S2.** A mask is about 1 million lookups per height pass, under 1 s on a CPU, and PyTorch has no wheel for this Intel Mac. Masks run in NumPy float32 with the spec's 32-bit formula. The PyTorch version comes in S8 (shadow grids and large alternatives areas), with this NumPy version as its test oracle. This departs from spec §5.1 ("`horizons`: the PyTorch ray-march") for this slice only.
2. **The far-only mask** starts at 3 km from the site (outside the 6 × 6 km patch) and uses a 2 m observer (the default panel height).
3. **No bundle means no horizon.** Without a configured bundle, the endpoint answers 503 `FEATURE_DISABLED`, and the web app stays on its `sample` switch for it.

## Global Constraints

- Base path `/api/v1`; lat/lon in degrees, east-positive lon in [−180, 180); units in field names.
- Errors are `application/problem+json` with codes `OUT_OF_COVERAGE`, `OUT_OF_TIME_RANGE`, `INVALID_PARAM`, `TERRAIN_READ_FAILED`, `RATE_LIMITED`, `FEATURE_DISABLED`, `NL_UNAVAILABLE`, `NL_NOT_UNDERSTOOD`.
- Versioned GETs (with `v=`): `Cache-Control: public, max-age=31536000, immutable`.
- Moon is a sphere of R = 1,737,400 m; heights are above it. Projection: spherical south-polar stereographic (`+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs`). Frame `MOON_ME_DE440_ME421`; the DEMs are `MOON_ME_DE421` (sub-meter residual, recorded in the manifest).
- Elevation formula, 32-bit, no cancellation: `el = atan2(Δh − (R + h_t)·2·sin²(θ/2), (R + h_t)·sin θ)`, `θ = s / R`, `Δh = h_t − h_o` (spec §7.2).
- Ray schedule (the physics team's settings): 40 m steps from 20 m to 10 km, then 240 m steps to 300 km, plus the 300 km point. At every step, read the finest DEM that has a value there (20 m, then 80 m, then 240 m), blending the 4 nearest cells.
- 720 directions, 0.5° apart, azimuth clockwise from north; at the pole, north is the direction of longitude 0. Heights 1–10 m in one pass, plus a far-only row.
- Skyline floor: never below `−acos((R + h_ground) / (R + h_ground + height))`.
- Unknown: a direction whose ray meets any missing DEM value is NaN (warning `DEM_GAPS`). The low and high variants are NaN where the height-error raster is missing (warning `UNCERTAINTY_UNAVAILABLE`).
- Truncation: with a terrain ceiling of 20,000 m, a direction where untraced terrain beyond 300 km could exceed the traced skyline is NaN (warning `HORIZON_TRUNCATED`); terrain above the ceiling is an error.
- Low skyline: terrain lowered by its error, observer raised by its error. High: the opposite.
- Bundle files (spec §6.3): `masks.npy` [3 × 11 × 720] float32 ° (nominal, low, high × heights 1–10 + far-only), `blocking.npy` [11 × 720] float32 km.
- The API refuses to start if the bundle's `algo_version` differs from `HORIZON_ALGO_VERSION`, the manifest is invalid, or a catalog site lacks a file (spec §6.4).
- Commit messages carry no Co-Authored-By trailer and PR descriptions no "Generated with" line.
- Comments only for non-obvious *why*; no spec section references in code.
- Run `make typecheck` after each series of code changes; `make check` before each commit.
- Never copy estimates, decisions or code from `github-project/`. `MenasimMoon/` is the physics team's prototype: its decisions are already in the spec, and its code is a test reference, never imported by `engine/` or `api/`.

## Review Focus

1. **Site at or next to the pole** (lat −90, −89.99): 720 finite values; north is the direction of longitude 0. Task 3 test.
2. **Rays crossing missing terrain or leaving the DEMs:** the direction becomes NaN with `DEM_GAPS`, never open sky, never a crash, and the JSON carries `null`, not `NaN`. Tasks 3 and 6 tests.
3. **Longitude ±180 and negative longitudes:** `lon_deg = -180` and `179.999` project to nearly the same point. Task 2 test.
4. **Height out of range or not an integer** (`0`, `11`, `2.5`, `abc`, empty): 422 `INVALID_PARAM` `problem+json`, never a 500. Task 6 test.
5. **Stale or incomplete bundle:** a wrong `algo_version`, a site missing `masks.npy`, or a corrupt manifest stops startup with a message naming the problem. Task 6 test.

---

## File Structure

```
engine/terrain.py        project/unproject, Dem, sample, sample_stack, load_dem
engine/horizons.py       HORIZON_ALGO_VERSION, ray_distances, march, compute_site_masks
engine/cli.py            python -m engine.cli horizon --site ... --height ... --out file.csv
build/make_masks.py      masks for every catalog site → bundle
build/converge.py        convergence check of steps and near window
api/bundle.py            load and validate bundle/<id>/server; startup checks
api/models.py            + HorizonResponse
api/main.py              + GET /sites/{id}/horizon, create_app(bundle_dir=...)
contract/samples/horizon/{sample_a,sample_b,sample_c}.json
tests/test_terrain.py  tests/test_horizons.py  tests/test_masks_build.py  tests/test_api_horizon.py
tests/test_engine_cli.py  tests/test_reference_horizon.py  tests/test_converge.py
```

---

### Task 1: Horizon contract and sample answers

**Files:**
- Modify: `api/models.py`, `api/contract.py` (`SAMPLE_MODELS`), `contract/openapi.json`, `web/src/api/schema.d.ts` (generated)
- Create: `contract/samples/horizon/{sample_a,sample_b,sample_c}.json`
- Test: `tests/test_sites_models.py` (add cases)

**Interfaces:**
- Produces in `api/models.py`:
  - `HorizonResponse(site_id: str, height_m: int | None, part: Literal["full","far"], az_step_deg: float, elevation_deg: list[float | None], low_deg: list[float | None], high_deg: list[float | None], blocking_distance_km: list[float | None], algo_version: str, warnings: list[str])`. All four lists are exactly 720 long, `az_step_deg == 0.5`, and `height_m is None` exactly when `part == "far"` (one `model_validator`). `None` marks an unknown direction.
- Consumes: the `SAMPLE_MODELS` pattern (`"horizon/*.json": HorizonResponse`).

- [ ] **Step 1: Write failing tests:**
  - `test_horizon_sample_validates`, for each of the 3 sample files.
  - `test_horizon_requires_720_values`: 719 values raise `ValidationError`.
  - `test_far_part_has_no_height`: `part="far", height_m=2` raises.
  - `test_unknown_direction_is_null`: a list with `None` validates and serializes as JSON `null`.
- [ ] **Step 2: Run `uv run pytest tests/test_sites_models.py -v`; expected FAIL** (ImportError).
- [ ] **Step 3: Implement `HorizonResponse`.** Write the 3 sample files from a throwaway generator: a smooth skyline of cosine bumps between −1° and 4°, low/high at ∓0.05°, blocking distance 0.5–40 km, `height_m: 2`, `part: "full"`, `algo_version: "sample"`. Give `sample_c` three `null` directions and `warnings: ["DEM_GAPS"]`, so the web track sees an unknown case.
- [ ] **Step 4: Register the sample pattern; run `make contract` then `uv run pytest tests/test_sites_models.py tests/test_contract_cli.py -v`; expected PASS.**
- [ ] **Step 5: Ask the web owner to approve the shape** (build approach §5 step 1), then commit `feat(contract): horizon model and sample answers`.

### Task 2: Projection and DEM sampling

**Files:**
- Create: `engine/terrain.py`
- Test: `tests/test_terrain.py`
- Modify: `pyproject.toml` (deps `numpy`; dev dep `pyproj`)

**Interfaces:**
- Produces in `engine/terrain.py`:
  - `MOON_RADIUS_M: float = 1_737_400.0`
  - `project(lat_deg: ArrayLike, lon_deg: ArrayLike) -> tuple[NDArray[float64], NDArray[float64]]` (x, y in metres) and `unproject(x_m, y_m) -> tuple[NDArray, NDArray]`
  - `@dataclass(frozen=True) Dem(id: str, data: NDArray[float32], x0_m: float, y0_m: float, cell_m: float)`. `data` holds NaN for nodata. `(x0_m, y0_m)` is the centre of cell `[0, 0]`; rows run toward decreasing y, as in the GeoTIFFs.
  - `sample(dem: Dem, x_m: NDArray, y_m: NDArray) -> NDArray[float32]`: bilinear height; NaN outside coverage or when any of the 4 cells is NaN.
  - `sample_stack(dems: Sequence[Dem], x_m, y_m) -> NDArray[float32]`: the finest DEM (smallest `cell_m`) with a finite value at each point. The order of `dems` doesn't matter.

- [ ] **Step 1: Write failing tests:**
  - `test_projection_matches_pyproj`: 200 random points (lat in [−90, −80], lon in [−180, 180)) agree with `pyproj` (proj string in Global Constraints) within 0.01 m.
  - `test_projection_roundtrip`; `test_pole_projects_to_origin`.
  - `test_lon_wrap`: `project(-85, -180)` equals `project(-85, 180)` within 1e-6 m.
  - `test_bilinear_on_plane`: a tilted-plane DEM returns the exact plane height at off-grid points.
  - `test_sample_nodata_gives_nan`; `test_sample_outside_gives_nan`.
  - `test_stack_prefers_finest`: a fine DEM with a hole and a coarse DEM underneath; inside the hole the coarse value is returned, elsewhere the fine one.
- [ ] **Step 2: Run `uv run pytest tests/test_terrain.py -v`; expected FAIL.**
- [ ] **Step 3: Implement.** ρ = 2R·tan((90° + lat)/2), x = ρ·sin(lon), y = ρ·cos(lon) (pyproj is the arbiter of the axis convention). Use float64 for projection.
- [ ] **Step 4: Run tests; expected PASS.** Commit `feat(engine): south-polar projection and DEM sampling`.

### Task 3: Ray-march

**Files:**
- Create: `engine/horizons.py`
- Test: `tests/test_horizons.py`

**Interfaces:**
- Consumes: `Dem`, `sample_stack`, `project`, `unproject`, `MOON_RADIUS_M` (Task 2).
- Produces in `engine/horizons.py`:
  - `HORIZON_ALGO_VERSION: str = "1"`, `TERRAIN_CEILING_M: float = 20_000.0`
  - `ray_distances(near_step_m: float = 40.0, near_m: float = 10_000.0, far_step_m: float = 240.0, reach_m: float = 300_000.0) -> NDArray[float64]`: `arange(near_step/2, near, near_step)`, then `arange(near, reach, far_step)`, then `[reach]`.
  - `@dataclass(frozen=True) March(elevation_deg: NDArray[float32], low_deg: NDArray[float32], high_deg: NDArray[float32], blocking_km: NDArray[float32], warnings: list[str])`. Each array is `[n_heights, n_az]`; NaN marks unknown.
  - `march(lat_deg: float, lon_deg: float, heights_m: Sequence[float], terrain: Sequence[Dem], errors: Sequence[Dem], distances_m: NDArray[float64], n_az: int = 720) -> March`. The ground height at the site is `sample_stack(terrain, site)`; a NaN there raises `ValueError`. One pass covers all heights.

- [ ] **Step 1: Write failing tests**, all on synthetic DEMs (the Mac has no LOLA files):
  - `test_smooth_sphere_2m`: a flat DEM of height 0 and a 2 m observer give −0.087° ± 0.001° in every direction (the tangent floor), with no warnings.
  - `test_single_mountain_matches_hand_calc`: a 500 m cone 10 km due east; the elevation at azimuth 90° equals a float64 hand calculation in the test within 0.001°, and its blocking distance is 10 km ± one step. Azimuth 270° stays at the floor.
  - `test_higher_observer_never_raises_skyline`: rows for 1…10 m are non-increasing at every azimuth.
  - `test_float32_matches_float64`: agrees with a float64 reference in the test within 0.001°.
  - `test_pole_site_finite`: lat −90 gives 720 finite values.
  - `test_missing_cell_makes_direction_unknown`: one NaN cell on the eastward ray makes azimuth 90° NaN, leaves 270° finite, and adds `DEM_GAPS`.
  - `test_ray_leaving_coverage_is_unknown`: a DEM ending at 50 km → NaN directions plus `DEM_GAPS`.
  - `test_truncation_flagged`: an observer on a 5 km peak over flat ground has a skyline of about −4.35°, while terrain up to the 20 km ceiling beyond 300 km could reach about −2.11°. Its directions become NaN with `HORIZON_TRUNCATED`. A 2 m observer on flat ground at height 0 (−0.087°) is not flagged. Terrain above 20 km raises `ValueError`.
  - `test_low_nominal_high_ordered`: with a constant 5 m error raster, `low ≤ nominal ≤ high` everywhere, and they differ near the mountain.
  - `test_missing_error_gives_nan_bounds`: no error coverage → low/high NaN, nominal finite, `UNCERTAINTY_UNAVAILABLE`.
- [ ] **Step 2: Run `uv run pytest tests/test_horizons.py -v`; expected FAIL.**
- [ ] **Step 3: Implement `march`.**
  - Unit vectors along each great circle from the site's east/north/up basis (no pole special case). `unproject` is not needed: project the step points straight from lat/lon of those vectors.
  - `sample_stack` heights; the 32-bit formula, vectorized over heights and directions; max and argmax along distance; the floor; NaN rows where any step is NaN.
  - Truncation, and low/high from the error stack, as in Global Constraints.
  - Chunk over azimuths to bound memory (720 × ~1,460 floats per chunk row).
- [ ] **Step 4: Run tests; expected PASS.** Commit `feat(engine): horizon ray-march with unknowns, truncation and error bounds`.

### Task 4: Per-site mask product

**Files:**
- Modify: `engine/horizons.py`
- Test: `tests/test_horizons.py` (add)

**Interfaces:**
- Consumes: `march`, `ray_distances` (Task 3).
- Produces:
  - `HEIGHTS_M: tuple[float, ...] = (1, 2, …, 10)`, `FAR_ONLY_START_M: float = 3_000.0`, `FAR_ONLY_HEIGHT_M: float = 2.0`
  - `@dataclass(frozen=True) SiteMasks(masks_deg: NDArray[float32], blocking_km: NDArray[float32], warnings: list[str])`. `masks_deg` is [3, 11, 720] (nominal, low, high); `blocking_km` is [11, 720]; rows 0–9 are heights 1–10 m and row 10 is far-only. `warnings` is the de-duplicated union in first-seen order.
  - `compute_site_masks(lat_deg: float, lon_deg: float, terrain: Sequence[Dem], errors: Sequence[Dem]) -> SiteMasks`. One `march` call for rows 0–9 with `ray_distances()`, and one for row 10 with only the distances ≥ `FAR_ONLY_START_M`.

- [ ] **Step 1: Write failing tests:**
  - `test_shape_and_rows`: shapes [3, 11, 720] and [11, 720], float32.
  - `test_far_only_ignores_nearby_ridge`: a ridge at 1 km raises rows 0–9 but not row 10.
  - `test_far_mountain_seen`: a mountain at 250 km with 6 km relief raises the skyline in its direction (within the 300 km reach).
  - `test_warnings_merged`: gaps in either pass appear once.
- [ ] **Step 2: Run; expected FAIL.** **Step 3: Implement.** **Step 4: Run; expected PASS.**
- [ ] **Step 5: Commit** `feat(engine): per-site horizon masks for heights 1–10 m and far-only`.

### Task 5: Real DEM reader and the bundle build

**Files:**
- Modify: `engine/terrain.py` (add `load_dem`), `build/fetch_sources.py` (add `--only` prefix filter), `pyproject.toml` (dep `rasterio`), `Makefile` (`masks` target, `ONLY=` for `fetch`), `.gitignore` (`bundle/`)
- Create: `build/make_masks.py`
- Test: `tests/test_masks_build.py`, `tests/test_fetch_sources.py` (add), `tests/test_real_dem.py`

**Interfaces:**
- Consumes: `compute_site_masks`, `HORIZON_ALGO_VERSION`, `load_catalog`.
- Produces:
  - `load_dem(path: Path, dem_id: str, window_m: tuple[float, float, float, float] | None = None) -> Dem`: reads a GeoTIFF window (`x_min, y_min, x_max, y_max` in projected metres) and turns nodata into NaN. It raises `ValueError` if the file's CRS is not the spherical stereographic above.
  - `build/make_masks.py`: `build_bundle(catalog: dict[str, Site], sources: Path, out_dir: Path) -> Path`.
    - Per site, it loads windows of the 20 m DEM (12 km around the site, if the file is present), the 80 m DEM (12 km) and the 240 m DEM (302 km), with the matching `_ERR` rasters.
    - It writes `bundle/<bundle_id>/server/sites/<id>/masks.npy` and `blocking.npy`.
    - It writes `manifest.json` `{bundle_id, algo_version, created, frame_note, sources: {file: sha256}, sites: {id: {warnings}}}`.
    - `bundle_id` is `<YYYYMMDD>-<first 8 hex of the sha256 of the manifest without the id>`.
    - It writes into a temp dir, then renames.
  - `make masks` runs it; `make fetch ONLY=lola/LDEM_80S_80MPP` downloads every lock entry whose path starts with that prefix.

- [ ] **Step 1: Write failing tests:**
  - `test_build_bundle_on_synthetic_dems`: 3 sites, tiny synthetic GeoTIFFs in `tmp_path` → the files exist with the right shapes, the manifest's `algo_version == HORIZON_ALGO_VERSION`, and the bundle id changes when a DEM byte changes.
  - `test_build_without_20m_uses_80m`: with no 20 m file, the build succeeds, and the manifest lists only the files used.
  - `test_load_dem_rejects_wrong_crs`; `test_load_dem_nodata_is_nan`.
  - `test_fetch_only_filters_by_prefix`.
  - `tests/test_real_dem.py::test_real_dem_smoke`, skipped unless `data/sources/lola/LDEM_80S_80MPP_ADJ.TIF` exists: masks for `sample_a` are finite or NaN-with-warning, and every finite value lies between −5° and 15°.
- [ ] **Step 2: Run `uv sync && uv run pytest tests/test_masks_build.py tests/test_fetch_sources.py -v`; expected FAIL.**
- [ ] **Step 3: Implement** `load_dem` (rasterio window read, float32), the `--only` filter, `build_bundle` and `main()`.
- [ ] **Step 4: Run `make check`; expected PASS.**
- [ ] **Step 5: First real data (user, on the Mac, about 0.93 GB):** `make fetch ONLY=lola/LDEM_80S_80MPP_ADJ` then `make fetch ONLY=lola/LDEM_60S_240MPP_ADJ` (each prefix also matches the `_ERR` file). Commit the printed sha256 values into `data/sources.lock.json`. Run `make masks` and `uv run pytest tests/test_real_dem.py -v`; expected PASS and a bundle on disk. The 20 m files (6.6 GB) are fetched on the GPU PC in Task 8.
- [ ] **Step 6: Commit** `feat(build): horizon bundle from LOLA terrain`.

### Task 6: `GET /sites/{id}/horizon` and startup checks

**Files:**
- Create: `api/bundle.py`
- Modify: `api/main.py`
- Test: `tests/test_api_horizon.py`

**Interfaces:**
- Consumes: `HorizonResponse` (Task 1), the bundle layout (Task 5), `ApiError`.
- Produces:
  - `api/bundle.py`:
    - `class BundleError(RuntimeError)`
    - `@dataclass Bundle(bundle_id: str, algo_version: str, masks: dict[str, NDArray[float32]], blocking: dict[str, NDArray[float32]], warnings: dict[str, list[str]])`
    - `load_bundle(bundle_dir: Path, site_ids: Iterable[str]) -> Bundle` raises `BundleError` when the manifest is unreadable or invalid, when `algo_version != HORIZON_ALGO_VERSION`, when a site lacks either `.npy` file, or when an array has the wrong shape.
  - `create_app(sample_dir=..., catalog_path=..., bundle_dir: Path | None = None)`.
  - `GET /api/v1/sites/{site_id}/horizon?height=<int 1–10, default 2>&part=<full|far, default full>&v=<optional>` → `HorizonResponse`.
    - `part=far` ignores `height` and returns row 10 with `height_m: null`.
    - NaN becomes `null`.
    - With `v` present, the response gets `Cache-Control: public, max-age=31536000, immutable`.
  - Errors:
    - unknown site → 404 `INVALID_PARAM`
    - `height` outside 1–10 or not an integer, or `part` unknown → 422 `INVALID_PARAM`
    - no bundle → 503 `FEATURE_DISABLED`

- [ ] **Step 1: Write failing tests** (a bundle built from synthetic DEMs in a fixture via `build_bundle`):
  - `test_horizon_ok`: 200, 720 elevations, `height_m == 2`, and `algo_version` equals the bundle's.
  - `test_far_part`: `?part=far` → `height_m is None`, and the values equal row 10.
  - `test_height_changes_values`: `height=1` vs `height=10` differ, and 10 is never higher.
  - `test_unknown_direction_is_null`: a fixture with a DEM hole returns `null` at those azimuths, and the response is valid JSON (no `NaN` token).
  - `test_bad_height`, parametrized over `0, 11, 2.5, abc, ""`: 422 `problem+json` with `code == "INVALID_PARAM"`.
  - `test_unknown_and_hostile_site_ids` (reuse the hostile list from `test_api_sites.py`): 404 or 422, `problem+json`.
  - `test_no_bundle_is_503`: `create_app()` without a bundle → 503 with `code == "FEATURE_DISABLED"`.
  - `test_versioned_get_is_immutable`: the header is present with `v=x` and absent without it.
  - `test_startup_refuses_stale_bundle`: a wrong `algo_version`, a missing `masks.npy` and a corrupt `manifest.json` each raise `BundleError` from `create_app(bundle_dir=...)`, with a message naming the file or the version.
- [ ] **Step 2: Run `uv run pytest tests/test_api_horizon.py -v`; expected FAIL.**
- [ ] **Step 3: Implement** `load_bundle` and the endpoint. `/meta` keeps its sample content.
- [ ] **Step 4: Run `make contract` then `make check`; expected PASS.** Commit the regenerated OpenAPI file and TypeScript types.
- [ ] **Step 5: Commit** `feat(api): horizon endpoint with bundle startup checks`.

### Task 7: Physics-team command and CSV

**Files:**
- Create: `engine/cli.py`
- Test: `tests/test_engine_cli.py`

**Interfaces:**
- Consumes: `load_bundle`.
- Produces: `python -m engine.cli horizon --site <id> --height <1-10> [--part full|far] [--bundle <dir>] --out <file.csv>`.
  - CSV columns: `az_deg,elevation_deg,low_deg,high_deg,blocking_distance_km`, 720 rows. Unknown cells are empty.
  - The first line is a comment: `# site=<id> height_m=<n> bundle=<id> algo_version=<v> warnings=<codes>`.

- [ ] **Step 1: Write failing tests:**
  - `test_cli_writes_720_rows`: the header, the row count, a first az of `0.0` and a last of `359.5`.
  - `test_cli_matches_api`: the CSV values equal the API's answer for the same site and height.
  - `test_cli_unknown_is_empty_cell`.
- [ ] **Step 2: Run; expected FAIL.** **Step 3: Implement** with `argparse`. **Step 4: Run; expected PASS.**
- [ ] **Step 5: Produce CSVs for the 3 sample sites from the real bundle,** at `--height 2` (panel) and `--height 3` (antenna). Attach them to the S2 pull request for the physics team (build approach §7), then commit `feat(engine): horizon csv command`.

### Task 8: Reference comparison and convergence check

**Files:**
- Create: `build/converge.py`, `tests/test_reference_horizon.py`, `tests/test_converge.py`, `docs/spikes/horizon-check.md`
- Modify: `pyproject.toml` (dependency group `reference = ["scipy", "shapely"]`, only for importing the prototype in tests)

**Interfaces:**
- Consumes: `march`, `ray_distances`, `load_dem`.
- Produces:
  - `max_mask_change(a: NDArray, b: NDArray) -> float`: the maximum absolute difference over directions finite in both.
  - `python -m build.converge --sites a,b,c` prints that change for: near steps 40 m vs 20 m, near window 10 km vs 20 km, and reach 300 km vs 400 km.

- [ ] **Step 1: Write failing tests:**
  - `test_max_mask_change_zero_for_identical`; `test_max_mask_change_ignores_nan`.
  - `test_converges_on_synthetic_dem`: relief within 8 km gives a change < 0.001° between 10 km and 20 km windows.
  - `tests/test_reference_horizon.py::test_matches_prototype_build_horizon`. It skips unless `MenasimMoon/lunar_nav` imports and the 80 m and 240 m DEMs are present.
    - Build the prototype's `RasterTerrain` from the same windows, with `Settings(horizon_step_deg=0.5, near_step_m=40, near_radius_m=10_000, far_step_m=240, horizon_radius_m=300_000, terrain_ceiling_m=20_000)`.
    - Run its `build_horizon` for the prototype's demo point A (−89°, 0°) at 2 m and 3 m.
    - Our nominal mask agrees within 0.01° wherever both are finite, and NaN appears in the same directions.
- [ ] **Step 2–4: Fail, implement, pass** (`uv sync --group reference` for the reference test).
- [ ] **Step 5: On the GPU PC with the 20 m files** (`make fetch ONLY=lola/LDEM_80S_20MPP_ADJ`), run `python -m build.converge` and the reference test. Record both in `docs/spikes/horizon-check.md`.
  - The spec's acceptance is `sun_pct` / `dte_pct` changing by less than 0.5 percentage points. Mask change is the proxy until S4 exists, and S4 re-runs the check on percentages.
  - Then commit `test(engine): horizon reference comparison and convergence check`.

---

## Self-review

- **Spec coverage:**

  | Spec requirement | Task |
  |---|---|
  | §7.2 ray-march, 32-bit formula, finest-first DEMs, 300 km reach with 40 m / 240 m steps, tangent floor, truncation with a 20 km ceiling, unknown directions | 3 |
  | Heights 1–10 m in one pass, far-only row | 4 |
  | §7.3 low/high skylines (P9), warnings `DEM_GAPS`, `HORIZON_TRUNCATED`, `UNCERTAINTY_UNAVAILABLE` | 3 |
  | §6.3 file names and shapes | 5 |
  | §6.4 version and startup checks | 6 |
  | §8.2 `/sites/{id}/horizon?height=&part=` | 6 |
  | §11.1 sphere / mountain / 32-vs-64-bit / pyproj / stability tests | 2, 3, 8 |
  | §12.3 P1 comparison | 8 |
  | Build approach §7 CSV command | 7 |

  **Deferred on purpose:**
  - grids and heightmaps (S8)
  - the PyTorch version (S8)
  - the warnings that need the site-quality layers (`SPARSE_MEASUREMENTS`, `EFFECTIVE_RESOLUTION`) and the Earth-orientation warning (S4, with the summary)
  - slope from the 240 m tangent-plane fit (S4, where the slope chip and the score use it)
  - the `/meta` bundle fields: `bundle_id` stays the sample value until S3 needs `v=`
- **Types:** `Dem`, `March`, `SiteMasks` and `HorizonResponse` keep the same names and fields in every task that uses them; the query parameter is `height` throughout.
- **Open for the user:** decisions 1–3 above.

## What follows (separate plans, written when S2 is merged)

- **S3 Series:** `engine/geometry.py`.
  - The ephemeris table, 2026–2031 hourly: Sun and Earth with CN+S, the Earth geometric, and the ITRF93 → MOON_ME rotation (`earth_rotation.npy`).
  - The Earth-station placement (`georec`, default Houston).
  - The Sun disk fraction with 128 strips and Earth eclipses.
  - `/scenario/series` with panel and antenna heights.
  - The Horizons comparison fixtures.
- **S4 Summary:**
  - visibility with unknown time, metrics (including L and C), the physics team's score with penalties and the deciding factor, and slope
  - the remaining warnings
  - `/scenario/summary`
  - the JPL Horizons check passing, which completes gate G2
