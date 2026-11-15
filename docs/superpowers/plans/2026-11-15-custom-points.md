# Custom Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /sites/custom` and every site endpoint work for any point between 84°S and the pole. The server computes the point's skyline from 80 m and 240 m terrain shipped in the image, caches it, and answers horizon, series and summary like a catalog site.

**Architecture:**
- **Same physics:** `engine.custom_point.compute_custom_point` calls `compute_site_masks`, the function the catalog build uses, on windows of 80 m and 240 m terrain, and reads the slope from the 80 m slope raster.
- **One lookup:** the API gets a `resolve(site_id)` that returns a `Site` and a `Bundle` view. For a catalog id both are the catalog's. For a `pt_…` id it computes the point (or finds it in an LRU) and returns a per-point `Bundle` holding that one site's masks. The endpoints stay as they are after the lookup.
- **Delivery:** terrain files are GitHub Release assets pinned in `deploy/terrain.lock.json` and fetched while the image is built, like the bundle. With the lock empty the feature stays off and a deploy is unaffected.

**Tech Stack:** Python 3.12, NumPy, rasterio, FastAPI, Pydantic v2, pytest, mypy strict; Docker on Google Cloud Run.

**Spec:** `docs/superpowers/specs/2026-11-15-custom-points-design.md`, which implements the product spec §6.5, §6.6, §8.2 (`docs/superpowers/specs/2026-11-10-lunar-landing-site-navigator-design.md`). Executors read both.

## Global Constraints

- Base path `/api/v1`. Errors are `application/problem+json` with the 8 stable codes (`api/models.py` `ErrorCode`).
- Custom area: latitude −90 to −84, longitude 0 to under 360, ids written by the web app as `pt_<s|n><lat×1000>_e<lon×1000, 6 digits>` (`web/src/api/points.ts`).
- The mask is `(3, 11, 720)` float32, blocking `(11, 720)` float32 (`api/bundle.py` `MASKS_SHAPE`, `BLOCKING_SHAPE`). `HORIZON_ALGO_VERSION` is unchanged by this work.
- Cloud Run: 512 MiB, 1 vCPU. The two-slot limit on heavy work (`MAX_HEAVY_REQUESTS` in `api/main.py`) applies to a point's computation.
- Commit messages carry no Co-Authored-By trailer, and PR descriptions no "Generated with" line. Comments only for a non-obvious *why*; no spec section references in code.
- Run `make typecheck` after each series of code changes and `make check` before each commit. `MenasimMoonV3/` is a test reference only: never imported by `engine/`, `api/` or `build/`.

## Review Focus

1. **Two requests for the same new point at once** compute it once. Pinned in Task 5: `test_concurrent_requests_compute_a_point_once`.
2. **A point with no terrain or slope under it** (a gap, or the edge of a file) answers 422 `OUT_OF_COVERAGE`, never a 500. Pinned in Tasks 3 and 5: `test_point_without_elevation_raises`, `test_point_without_terrain_is_out_of_coverage`.
3. **The same point spelled two ways** (`pt_s87500_e045000` and `pt_s87500_e45000`) returns the canonical id and is computed once. Pinned in Task 5: `test_non_canonical_id_returns_the_canonical_site`.
4. **A hostile or malformed id** never touches the disk and answers 404. Pinned in Task 2: `test_rejects_malformed_ids`; Task 5: `test_hostile_ids_are_unknown_sites`.
5. **A tampered or truncated terrain download** fails the image build. Pinned in Task 4: `test_checksum_mismatch_fails`, `test_size_mismatch_fails`.

---

### Task 1: Terrain window helpers move into the engine

The API cannot import `build/`, and the custom point needs the same window maths as the catalog build.

**Files:**
- Create: `engine/windows.py`
- Modify: `build/make_masks.py` (import the helpers; keep `map_half_width_m`, `NEAR_HALF_WIDTH_M` and `site_window` importable from `build.make_masks`)
- Test: `tests/test_windows.py`

**Interfaces:**
- Produces: `NEAR_HALF_WIDTH_M: float = 12_000.0`, `map_half_width_m(lat_deg: float, ground_m: float) -> float`, `window_around(lat_deg: float, lon_deg: float, ground_half_m: float) -> tuple[float, float, float, float]` (x_min, y_min, x_max, y_max on the polar map).

- [ ] **Step 1: Failing tests** in `tests/test_windows.py`:
  - `test_map_half_width_matches_the_catalog_build`: `map_half_width_m(-85.5, 200_000.0) == build.make_masks.map_half_width_m(-85.5, 200_000.0)` and `> 201_800.0`.
  - `test_window_is_centred_on_the_point`: for `(-89.0, 90.0)`, `window_around(...)` has centre `project(-89.0, 90.0)` within 1e-6 m and equal half-widths.
- [ ] **Step 2:** Run `uv run pytest tests/test_windows.py -q`. Expected: FAIL (no module).
- [ ] **Step 3:** Move `map_half_width_m` and `NEAR_HALF_WIDTH_M` into `engine/windows.py`, add `window_around`, and make `build.make_masks.site_window(site, layer)` call `window_around(site.lat_deg, site.lon_deg, layer.half_width_m)`.
- [ ] **Step 4:** Run `uv run pytest tests/test_windows.py tests/test_masks_build.py -q`. Expected: PASS.
- [ ] **Step 5:** `make check`, then commit `refactor(engine): terrain window helpers live in the engine`.

### Task 2: Point ids

**Files:**
- Create: `api/point_ids.py`
- Test: `tests/test_point_ids.py`

**Interfaces:**
- Produces: `format_point_id(lat_deg: float, lon_deg: float) -> str`; `parse_point_id(site_id: str) -> tuple[float, float] | None` (latitude and longitude in degrees, longitude in [0, 360)); `in_custom_area(lat_deg: float, lon_deg: float, min_lat_deg: float, max_lat_deg: float) -> bool`.

- [ ] **Step 1: Failing tests:**
  - `test_round_trip`: `format_point_id(-87.5, 45.0) == "pt_s87500_e045000"`; `parse_point_id("pt_s87500_e045000") == (-87.5, 45.0)`.
  - `test_longitude_wraps`: `format_point_id(-89.0, 360.0) == "pt_s89000_e000000"`; `format_point_id(-89.0, -90.0) == "pt_s89000_e270000"`; `parse_point_id("pt_s89000_e360000") == (-89.0, 0.0)`.
  - `test_rounds_to_a_thousandth`: `format_point_id(-87.5004, 45.0006) == "pt_s87500_e045001"`.
  - `test_non_canonical_spelling_parses`: `parse_point_id("pt_s87500_e45000") == (-87.5, 45.0)`.
  - `test_rejects_malformed_ids` (parametrized): `""`, `"pt_x1_e1"`, `"pt_s87500_e045000x"`, `"pt_s87500_e360001"`, `"pt_s../etc_e000000"`, `"PT_s87500_e045000"`, `"pt_s87500_e045000/"`, `"pt_s9999999_e000000"` all give `None`.
  - `test_area`: `in_custom_area(-84.0, 10.0, -90.0, -84.0)` is true; `-83.999` false; `-90.0` true.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with one anchored regex, `^pt_([ns])(\d{1,5})_e(\d{1,6})$` (latitude digits at most 5, longitude at most 360000, as in `web/src/api/points.ts`). The format function rounds to 0.001° and wraps longitude into [0, 360).
- [ ] **Step 4:** Run. Expected: PASS. `make check`, then commit `feat(api): custom point ids`.

### Task 3: Compute a custom point from terrain files

**Files:**
- Create: `engine/custom_point.py`
- Test: `tests/test_custom_point.py` (builds synthetic terrain with `tests/tif_helpers.write_tif`, laid out like `tests/test_masks_build.py` `make_sources`)

**Interfaces:**
- Consumes: `compute_site_masks(lat_deg, lon_deg, terrain, errors)` and `MAX_REACH_M` from `engine/horizons.py`; `load_dem`, `sample`, `sample_stack`, `project` from `engine/terrain.py`; `window_around`, `NEAR_HALF_WIDTH_M` from Task 1.
- Produces: `TERRAIN_FILES: tuple[str, ...]` (relative paths: `lola/LDEM_80S_80MPP_ADJ.TIF`, its `_ERR.TIF`, `lola/LDEM_60S_240MPP_ADJ.TIF`, its `_ERR.TIF`, `layers/slope/LDSM_80S_80MPP_ADJ.TIF`); `SLOPE_RESOLUTION_M: float = 80.0`; `class TerrainMissing(FileNotFoundError)`; `@dataclass(frozen=True) class CustomPoint` with `lat_deg: float`, `lon_deg: float`, `elevation_m: float`, `slope_deg: float`, `masks: NDArray[np.float32]`, `blocking: NDArray[np.float32]`, `warnings: list[str]`; `compute_custom_point(lat_deg: float, lon_deg: float, terrain_dir: Path) -> CustomPoint`.

- [ ] **Step 1: Failing tests:**
  - `test_shapes_and_values`: on flat terrain of 100 m and a slope raster of 7 degrees, `masks.shape == (3, 11, 720)`, `blocking.shape == (11, 720)`, `elevation_m == pytest.approx(100.0)`, `slope_deg == pytest.approx(7.0)`.
  - `test_matches_the_catalog_build_on_the_same_terrain`: build a bundle with `build_bundle(CATALOG, sources, out, default_ephemeris(), terrain="80m")` and compare the masks and blocking of site `s1` with `compute_custom_point` at the same latitude and longitude: `np.testing.assert_array_equal` on both, equal warnings.
  - `test_missing_file_raises`: removing the 240 m file raises `TerrainMissing` naming the file.
  - `test_point_without_elevation_raises`: a NaN hole at the point raises `ValueError` with `"no terrain elevation"`.
  - `test_point_without_slope_raises`: a NaN slope at the point raises `ValueError` with `"no slope"`.
- [ ] **Step 2:** Run `uv run pytest tests/test_custom_point.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement. Near window: `window_around(lat, lon, NEAR_HALF_WIDTH_M)` on the 80 m files. Far window: `window_around(lat, lon, MAX_REACH_M + 2_000.0)` on the 240 m files. Load elevation and error `Dem`s the way `build.make_masks.load_windows` does; a file the point lies outside of is skipped, and a missing file is `TerrainMissing`. The slope is a bilinear sample of a window of a few cells around the point. Errors are optional: a missing `_ERR` file means no error list (the masks then carry their usual uncertainty warning).
- [ ] **Step 4:** Run. Expected: PASS. `make check`, then commit `feat(engine): compute a custom point from 80 m and 240 m terrain`.

### Task 4: Terrain delivery (lock, fetch, pack)

**Files:**
- Create: `deploy/fetch_terrain.py`, `deploy/terrain.lock.json` (`{"files": []}`), `build/pack_terrain.py`
- Modify: `Dockerfile`, `deploy/fetch_bundle.py` (rename `_sha256` to `sha256_of` and update its uses), `docs/spikes/hosting.md`
- Test: `tests/test_fetch_terrain.py`, `tests/test_pack_terrain.py`

**Interfaces:**
- Consumes: `download(url, dest)` and `sha256_of(path)` from `deploy/fetch_bundle.py`; `TERRAIN_FILES` from Task 3.
- Produces: `fetch_terrain(lock_path: Path, out_dir: Path, fetch: Callable[[str, Path], None] = download) -> list[Path]`, with `class TerrainFetchError(Exception)`; a lock entry is `{"path": str, "url": str, "sha256": str, "bytes": int}`. CLI: `python -m deploy.fetch_terrain [--lock deploy/terrain.lock.json] --out DIR`. `pack_terrain(sources: Path, repo: str, tag: str) -> dict[str, list[dict[str, object]]]` returns the lock content for the files in `TERRAIN_FILES` found under `sources`; CLI: `python -m build.pack_terrain --sources data/sources --repo EyalPoly/moon-watchers --tag terrain-80m-20261115 --out deploy/terrain.lock.json`, which also prints the `gh release create` command that uploads those files.

- [ ] **Step 1: Failing tests** in `tests/test_fetch_terrain.py`:
  - `test_empty_lock_writes_nothing`: `fetch_terrain` returns `[]` and `out_dir` does not exist.
  - `test_fetches_and_checks_every_file`: a fake `fetch` that writes known bytes; all files end up at `out_dir/<path>` with those bytes.
  - `test_checksum_mismatch_fails` and `test_size_mismatch_fails`: raise `TerrainFetchError` naming the file, and nothing is left in `out_dir`.
  - `test_path_must_stay_inside_out_dir`: entries with `..` or an absolute path raise.
  - `tests/test_pack_terrain.py::test_lock_matches_the_files`: for a temp `sources` holding two of the `TERRAIN_FILES`, the returned entries have the real size and sha256, and `url` is `https://github.com/<repo>/releases/download/<tag>/<basename>`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Download each file to a scratch folder, check size and sha256, then move into `out_dir` only when all pass. Standard library only in `deploy/`. Dockerfile, after the bundle step: `RUN python -m deploy.fetch_terrain --out /app/terrain` and `ENV TERRAIN_DIR=/app/terrain`. In `hosting.md` add a "Terrain for custom points" section: the lock, the assets, and that an empty lock leaves the feature off.
- [ ] **Step 4:** Run. Expected: PASS. `uv run python -m deploy.fetch_terrain --out /tmp/t` with the empty lock exits 0. `make check`, then commit `feat(deploy): fetch pinned terrain into the image for custom points`.

### Task 5: Custom points in the API

**Files:**
- Create: `api/custom_points.py`
- Modify: `api/main.py`, `config/warnings.yaml`, `contract/openapi.json` and `contract/samples/meta.json` (regenerated), `web/src/api/schema.d.ts` (regenerated), `tests/test_api_custom_sites.py` (extend)
- Test: `tests/test_api_custom_points.py`

**Interfaces:**
- Consumes: Tasks 2 and 3; `Site` from `api/models.py`; `Bundle` from `api/bundle.py`; `ApiError`.
- Produces: `class CustomPoints` with `__init__(self, terrain_dir: Path, guard: AbstractContextManager[object], capacity: int = 256, new_per_minute: int = 20, clock: Callable[[], float] = time.monotonic)` and `get(self, site_id: str) -> tuple[Site, CustomPoint]`. `get` raises `ApiError(404, "INVALID_PARAM", …)` for an id that does not parse, `ApiError(422, "OUT_OF_COVERAGE", …)` outside the area or when the terrain or slope is missing at the point, `ApiError(503, "TERRAIN_READ_FAILED", …)` when a terrain file is missing or unreadable, and `ApiError(429, "RATE_LIMITED", …)` when more than `new_per_minute` points were computed in the last 60 s (a cache hit never counts). `compute` runs inside `guard`. `create_app(…, terrain_dir: Path | None = None)` (default: the `TERRAIN_DIR` environment variable when that folder exists).
- Warning code `CUSTOM_COARSE_TERRAIN` in `config/warnings.yaml`: severity `caution`, affects `skyline`, text one plain sentence saying the point uses 80 m terrain, catalog sites use 20 m, and near-horizon angles can differ by up to about 0.7°.

- [ ] **Step 1: Failing tests** in `tests/test_api_custom_points.py` (a module fixture writes synthetic terrain to a temp folder in the layout of Task 3 and a bundle through `make_bundle` from `tests/test_api_summary.py`):
  - `test_post_returns_a_custom_site`: `POST /sites/custom {"lat_deg": -87.5, "lon_deg": 45}` is 200; body `id == "pt_s87500_e045000"`, `source == "custom"`, `slope_resolution_m == 80`, `in_psr is None`, the name reads `Custom point 87.500°S, 45.000°E`.
  - `test_post_is_idempotent_and_cached`: posting twice computes once (count calls to `compute_custom_point` by monkeypatching `api.custom_points.compute_custom_point`).
  - `test_get_site_recomputes_after_a_restart`: a new `create_app` answers `GET /sites/pt_s87500_e045000` with the same body.
  - `test_non_canonical_id_returns_the_canonical_site`: `GET /sites/pt_s87500_e45000` returns `id == "pt_s87500_e045000"`, one computation.
  - `test_horizon_series_summary_work_for_a_custom_point`: each returns 200; the horizon `warnings` and the summary `warnings` (codes) contain `CUSTOM_COARSE_TERRAIN`.
  - `test_point_without_terrain_is_out_of_coverage`: terrain with a NaN hole at the point answers 422 `OUT_OF_COVERAGE` on POST and on GET.
  - `test_missing_terrain_file_is_terrain_read_failed`: 503 `TERRAIN_READ_FAILED`.
  - `test_point_outside_the_area_is_out_of_coverage`: unchanged from the existing tests, still 422.
  - `test_hostile_ids_are_unknown_sites`: `/sites/pt_s..%2f..%2fetc_e000000` and `/sites/pt_s87500_e045000%2f` answer 404 `INVALID_PARAM`.
  - `test_rate_limit`: with `new_per_minute=2` and an injected clock, the third distinct point is 429 `RATE_LIMITED`, a cached point still answers, and after 61 s of clock a new point works.
  - `test_cache_is_bounded`: with `capacity=3`, four distinct points leave three cached, and the least recently used one is the first dropped.
  - `test_concurrent_requests_compute_a_point_once`: eight threads request the same new point; one computation.
  - `test_heavy_work_is_limited`: eight different new points at once never run more than `MAX_HEAVY_REQUESTS` computations together (same technique as `test_heavy_series_work_runs_at_most_two_at_a_time`).
  - `test_cors_allows_post`: an `OPTIONS /api/v1/sites/custom` with `Origin` and `Access-Control-Request-Method: POST` allows POST.
  - `test_capability_follows_terrain`: `/meta` has `capabilities.custom_points` true with terrain and false without.
  - In `tests/test_api_custom_sites.py`: without terrain, an in-area POST still answers 503 `FEATURE_DISABLED`.
- [ ] **Step 2:** Run `uv run pytest tests/test_api_custom_points.py tests/test_api_custom_sites.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement `api/custom_points.py` (an `OrderedDict` LRU, one lock per id taken before the compute, a sliding-window counter of computations for the rate limit). In `main.py` add `resolve(site_id) -> tuple[Site, Bundle]` (catalog id: `(catalog[id], bundle)`; else a custom point: `dataclasses.replace(bundle, masks={id: …}, blocking={id: …}, warnings={id: [*point.warnings, "CUSTOM_COARSE_TERRAIN"]})`), and use it in the horizon, series, summary and `/sites/{id}` handlers and in `_metrics`. Build the `Site` from the point (decision 3 of the design). Allow `POST` in the CORS middleware. Add the warning code to `config/warnings.yaml`, set the capability, and regenerate the contract (`uv run python -m api.contract generate`).
- [ ] **Step 4:** Run the new tests, then `make check`, and `uv run python -m api.contract check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): custom points from 80 m terrain`.

### Task 6: Publish the terrain, deploy, measure (user, on the PC that has the files)

Not code. The PC with `data/sources/` has all five files.

- [ ] **Step 1:** `git pull`, then `uv run python -m build.pack_terrain --sources data/sources --repo EyalPoly/moon-watchers --tag terrain-80m-20261115 --out deploy/terrain.lock.json`. It prints the `gh release create` command; run it. Commit the updated lock on a branch and open a pull request.
- [ ] **Step 2:** On the Mac: `make deploy`. The image build downloads and checks the files; a wrong checksum fails the build.
- [ ] **Step 3: Measure on the live service.** `curl -s -X POST https://clps-api-982577966589.europe-west1.run.app/api/v1/sites/custom -H 'content-type: application/json' -d '{"lat_deg":-87.5,"lon_deg":45}' -w '%{time_total}\n'`, cold and warm, then a summary for the returned id. Expected: a Site back; record both times in `docs/spikes/hosting.md`. Check the Cloud Run memory graph stays under 512 MiB with three different new points requested at once.
- [ ] **Step 4:** Set `"custom": "real"` in `web/public/config.json`, check a click on the map in the integrated preview, and commit `chore(web): custom points from the real API`.

---

## Self-review

- **Spec coverage:**

  | Requirement | Task |
  |---|---|
  | §8.2 `POST /sites/custom`, idempotent, synchronous numbers | 5 |
  | §6.5 recompute a missing custom id from the id | 2, 5 |
  | §6.6 terrain for custom points, slope from the slope raster | 3, 4 |
  | §6.4 same physics for custom and catalog | 3 (`test_matches_the_catalog_build_on_the_same_terrain`) |
  | §10 rate limits on expensive actions | 5 |
  | Design: the 80 m labelling, no new infrastructure | 4, 5 |

- **Deferred on purpose:** 20 m custom terrain (a storage change), shadows (S8), alternatives (S10), a disk cache, PSR.
- **Types:** `CustomPoint` (Task 3) is what `CustomPoints.get` returns (Task 5); `parse_point_id`, `format_point_id` and `in_custom_area` (Task 2) are used only inside `CustomPoints`; `TERRAIN_FILES` (Task 3) is what `pack_terrain` packs (Task 4).
- **Open for the user:** the release tag name, and whether the measured custom-point time (Task 6) is acceptable.
