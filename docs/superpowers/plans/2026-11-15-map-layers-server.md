# Map Layers (Server Side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download the layer data from `Data links.docx`, build slope and elevation tiles plus GeoJSON overlays in the south-pole polar grid, serve them from a separate Firebase Hosting site, and describe them in `/api/v1/meta`.

**Architecture:** Sources are pinned in `data/sources.lock.json` and fetched by the existing `build.fetch_sources`. A new build (`build/make_layers.py`, helpers `build/layer_tiles.py` and `build/layer_vectors.py`) writes `layers/dist/`. A self-contained `layers/firebase.json` deploys `layers/dist` to its own hosting site. `Region` gains an additive `overlays` list, and `contract/samples/meta.json` lists the new layers with their CDN URLs.

**Tech Stack:** Python 3.12, numpy, rasterio (already used), Pillow (PNG), pyshp (shapefiles), shapely (clip and simplify), pydantic, pytest, mypy strict, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-11-15-map-layers-server-design.md`. Source list: `Data links.docx` (repo root).

**Not in this plan:** anything under `web/` (the one exception is the generated `web/src/api/schema.d.ts`, rewritten by `make contract`). No commit steps: commit only when the user asks. The working tree already has many uncommitted changes (including `contract/samples/meta.json` and `contract/openapi.json`); build on them, never revert them. Per the user's CLAUDE.md: no `Co-Authored-By` trailers, minimal comments, typecheck at the end.

## Global Constraints

- Region grid, from `contract/samples/meta.json`: crs `MOON:SP`, proj4 `+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs`, extent `[-457440, -457440, 457440, 457440]` m, tile origin `[-1095930, 1095930]`, 7 resolutions from 8561.953 to 133.78 m/px, tile size 256 px. Do not change this grid (Moon Trek shares it).
- Reference radius 1,737,400 m (`engine.terrain.MOON_RADIUS_M`). Reuse `engine.terrain.project` / `unproject` for lon/lat conversion; `unproject` returns longitude 0..360.
- Output layout: `layers/dist/tiles/south_pole/<layer_id>/{z}/{x}/{y}.png`, `layers/dist/overlays/<overlay_id>.geojson`, `layers/dist/legends/<layer_id>.png`, `layers/dist/layers.json`.
- Layer ids: rasters `slope_80m`, `elevation`; overlays `psr_1km2`, `psr_large`, `mission_sites`, `artemis3_2024`, `artemis3_2022`, `endurance_traverse`.
- Source paths in the lock (under `data/sources/`): `layers/slope/LDSM_80S_80MPP_ADJ.TIF`, `layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.{SHP,DBF,SHX,PRJ}`, `layers/psr_large/NAC_POLE_PSR_SOUTH.ZIP`, `layers/mission_sites/ANTHROPOGENIC_OBJECTS_180.ZIP`, `layers/artemis3/A3_9regions-lonlat-simplified.geojson`, `layers/artemis3/A3_Named_regions.geojson`, `layers/endurance/EnduranceTraverse_240129-v2.geojson`.
- CDN base URL constant `LAYERS_BASE_URL = "https://clps-514710-layers.web.app"` (hosting site id `clps-514710-layers`), defined once in `build/make_layers.py`.
- Total `layers/dist` size under 40 MB; each overlay GeoJSON under 5 MB.
- CORS on the layers site: `Access-Control-Allow-Origin: *`; cache `public, max-age=31536000, immutable`.

## Review Focus

1. A slope or DEM raster with nodata or NaN cells → those pixels are fully transparent in the PNG, never black (Task 2, Task 3).
2. A feature entirely outside the extent, or one that is empty after clipping → dropped without a crash; an overlay with zero features is still a valid FeatureCollection (Task 4).
3. Longitude convention: `unproject` returns 0..360; the GeoJSON must hold -180..180 (a point at 270° becomes -90) (Task 4).
4. Re-running the build must not leave stale files from an earlier run and must give byte-identical output (Task 5).
5. A missing source file or an unsupported `.prj` → a clear error that names the file and the command to fix it (`make fetch ONLY=layers/`), not a bare traceback (Task 4, Task 5).

---

### Task 1: Pin the sources

**Files:**
- Modify: `data/sources.lock.json`
- Create: `tests/test_layer_sources.py`

**Interfaces:**
- Produces: the lock entries listed in Global Constraints (`path` under `layers/`), each with a 64-hex `sha256` and exact `bytes`.

- [ ] **Step 1: Write the failing test** `test_layer_sources_are_pinned` in `tests/test_layer_sources.py`: loads `data/sources.lock.json`; takes entries whose `path` starts with `layers/`; asserts the set of paths equals the 10 paths in Global Constraints (expanding the `PSR_1KM2` braces), every `sha256` matches `^[0-9a-f]{64}$`, every `bytes > 0`, every `url` starts with `https://`.
- [ ] **Step 2: Run** `uv run pytest tests/test_layer_sources.py -v`. Expected: FAIL (no `layers/` entries).
- [ ] **Step 3: Add the 10 entries** with `sha256: ""` and these `bytes` (from the servers' `Content-Length`, 15 Nov): slope TIF 241594035, PSR SHP 20743300, DBF 369101, SHX 12348, PRJ 368, large-PSR ZIP 1121858, mission-sites ZIP 1569089, A3 9-region 3545, A3 named 3566, Endurance 407357. URLs are in `Data links.docx` (the PSR siblings are the same path as the `.SHP` with the other extension). Add a short `note` to each.
- [ ] **Step 4: Download and pin.** Run `make fetch ONLY=layers/`. It prints `unpinned <path>: add sha256 <hex>` for each file; write each hash into the lock. If a `bytes` value is wrong the run raises `SizeMismatch`; correct it from the message and rerun.
- [ ] **Step 5: Inspect the slope file** (one-off, not a test): with `uv run python -`, open it through `engine.terrain.load_dem(Path("data/sources/layers/slope/LDSM_80S_80MPP_ADJ.TIF"), "slope")` and print `np.nanmin/nanmax` and `cell_m`. Expected: it loads (south-polar CRS check passes), values within 0..90, `cell_m` 80. If the CRS check raises or the range is not degrees, stop and report to the user: the builders below assume degrees.
- [ ] **Step 6: Run** `uv run pytest tests/test_layer_sources.py tests/test_fetch_sources.py -v`. Expected: PASS.

### Task 2: Tile math and PNG rendering

**Files:**
- Create: `build/layer_tiles.py`
- Modify: `pyproject.toml` (add `pillow`, `pyshp`, `shapely>=2.2.0` to the `dev` group via `uv add --dev pillow pyshp shapely`; add `shapefile`, `shapely`, `shapely.*` to the mypy `ignore_missing_imports` override)
- Test: `tests/test_layer_tiles.py`

**Interfaces:**
- Consumes: `api.models.TileGrid` (`origin`, `resolutions_m`, `tile_size_px`).
- Produces:
  - `tile_bounds(grid: TileGrid, z: int, x: int, y: int) -> tuple[float, float, float, float]` (x_min, y_min, x_max, y_max in metres; y counts down from `origin[1]`).
  - `tiles_in_extent(grid: TileGrid, z: int, extent: tuple[float, float, float, float]) -> list[tuple[int, int]]` (every `(x, y)` whose bounds intersect the extent, row-major).
  - `Ramp = Callable[[NDArray[np.float32]], NDArray[np.uint8]]` returning RGBA `[h, w, 4]`; NaN input must give alpha 0.
  - `png_bytes(rgba: NDArray[np.uint8]) -> bytes`.
  - `write_pyramid(out: Path, grid: TileGrid, extent: tuple[float, float, float, float], sampler: Callable[[NDArray[np.float64], NDArray[np.float64]], NDArray[np.float32]], ramp: Ramp) -> int` — writes `out/{z}/{x}/{y}.png` for every tile in every level, including fully transparent ones (so no 404), returns the file count. `sampler` takes pixel-centre x and y arrays (metres) and returns values.
  - `legend_png(ramp: Ramp, low: float, high: float, width: int = 256, height: int = 16) -> bytes`.

- [ ] **Step 1: Write failing tests** in `tests/test_layer_tiles.py`, using the sample meta grid (load it via `Meta.model_validate_json(Path("contract/samples/meta.json").read_text()).regions[0].tile_grid`):
  - `test_tile_bounds_z0`: tile `(0, 0)` at z0 has x_min `-1095930`, y_max `1095930`, and span `256 * 8561.953` on both axes.
  - `test_tiles_in_extent_covers_extent`: at z6 the union of returned tiles' bounds contains the extent, and no returned tile lies fully outside it.
  - `test_nan_is_transparent`: a ramp output for an array holding one NaN has alpha 0 there and 255 elsewhere (use the slope ramp from Task 3 as a stub: a ramp passed in by the test, `lambda v: np.where(np.isnan(v)[..., None], 0, 255).astype(np.uint8).repeat(4, -1)`).
  - `test_write_pyramid_writes_every_tile`: with a constant sampler, the file count equals the sum of `len(tiles_in_extent(...))` over all levels, and one decoded PNG (PIL) is 256×256 RGBA.
- [ ] **Step 2: Run** `uv run pytest tests/test_layer_tiles.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the five functions. Pixel centres for a tile: `x_min + (i + 0.5) * res`, `y_max - (j + 0.5) * res`. Encode with Pillow, `optimize=True`.
- [ ] **Step 4: Run** `uv run pytest tests/test_layer_tiles.py -v`. Expected: PASS.

### Task 3: Slope and elevation tile builders

**Files:**
- Modify: `build/layer_tiles.py` (ramps), create `build/make_layers.py` (raster builders only for now)
- Test: `tests/test_layer_rasters.py`

**Interfaces:**
- Consumes: Task 2 (`write_pyramid`, `legend_png`, `Ramp`); `engine.terrain.load_dem`, `sample_stack`; `tests/tif_helpers.write_tif`.
- Produces in `build/layer_tiles.py`:
  - `slope_ramp: Ramp` (degrees; 0° → light, 30° and above → saturated; NaN → transparent). Legend range 0–30.
  - `hillshade(values: NDArray[np.float32], cell_m: float) -> NDArray[np.float32]` (0..1, sun from the north-west, NaN stays NaN) and `elevation_ramp: Ramp` (metres, fixed range `-9000..9000`, NaN → transparent).
- Produces in `build/make_layers.py`:
  - `build_slope_tiles(slope_tif: Path, out: Path, grid: TileGrid, extent: tuple[float, float, float, float]) -> int`.
  - `build_elevation_tiles(dems: Sequence[tuple[Path, str]], out: Path, grid: TileGrid, extent: tuple[float, float, float, float]) -> int` — `dems` are `(path, dem_id)`, finest first is not required (`sample_stack` sorts by cell size). Pixel colour = `elevation_ramp` multiplied by the hillshade of a locally sampled 3×3 neighbourhood at that level's resolution.

- [ ] **Step 1: Write failing tests** in `tests/test_layer_rasters.py` using `write_tif` on `tmp_path`:
  - `test_slope_tiles_colour_covered_pixels_only`: a 40×40 constant 10.0 raster at 80 m centred on the pole (`x_min=-1600, y_max=1600, cell_m=80`); in the z6 tile that contains the origin the pixel at the origin has alpha 255 and the corner pixel (outside the file) has alpha 0.
  - `test_slope_nodata_is_transparent`: the same raster with a NaN block; those pixels have alpha 0, not black.
  - `test_elevation_falls_back_to_coarser_dem`: a fine 40×40 raster of 0 m and a coarse (240 m) 120×120 raster of 100 m covering a wider area; a pixel outside the fine raster but inside the coarse one is opaque.
  - `test_wrong_crs_raises`: a raster written with a non-polar CRS makes the builder raise `ValueError` mentioning the path.
  - `test_hillshade_flat_is_constant`: a flat array gives one constant value.
- [ ] **Step 2: Run** `uv run pytest tests/test_layer_rasters.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the ramps, `hillshade` and the two builders. Load each DEM with `load_dem(path, id, window_m=extent)`; the sampler passed to `write_pyramid` calls `sample_stack`.
- [ ] **Step 4: Run** `uv run pytest tests/test_layer_rasters.py tests/test_layer_tiles.py -v`. Expected: PASS.

### Task 4: Vector overlays

**Files:**
- Create: `build/layer_vectors.py`
- Test: `tests/test_layer_vectors.py`

**Interfaces:**
- Consumes: `engine.terrain.project`, `unproject`, `MOON_RADIUS_M`.
- Produces:
  - `read_shapefile(shp: IO[bytes], dbf: IO[bytes], prj: str) -> list[tuple[BaseGeometry, dict[str, Any]]]` — geometry in **map metres**. If `prj` contains `Stereographic_South_Pole` and radius `1737400` (either spelling of the number) the coordinates are already metres; if it starts with `GEOGCS` they are lon/lat degrees and are projected with `project`; anything else raises `ValueError` naming the projection.
  - `read_geojson(text: str) -> list[tuple[BaseGeometry, dict[str, Any]]]` — lon/lat input projected to metres.
  - `overlay_geojson(features: Sequence[tuple[BaseGeometry, dict[str, Any]]], extent: tuple[float, float, float, float], simplify_m: float, keep: Sequence[str]) -> str` — clips each geometry to the extent box, drops empties, simplifies in metres (`preserve_topology=True`), converts back with `unproject`, wraps longitude to -180..180, rounds coordinates to 5 decimals, keeps only the property names in `keep`, and returns a FeatureCollection string with features in input order and `sort_keys` JSON.
  - `shapefile_from_zip(zip_path: Path, stem_suffix: str = ".shp") -> tuple[IO[bytes], IO[bytes], str]` — opens the `.shp`, `.dbf` and `.prj` (case-insensitive) inside the ZIP; raises `FileNotFoundError` naming the ZIP when `zip_path` is missing, with the text `run: make fetch ONLY=layers/`.

- [ ] **Step 1: Write failing tests** in `tests/test_layer_vectors.py` (write small shapefiles with `shapefile.Writer` into `tmp_path`):
  - `test_polar_shapefile_roundtrip`: a point at `x=0, y=rho(-85°)` (use `project(-85, 0)`) comes out at lon 0, lat -85 within 1e-4.
  - `test_longitude_wrapped`: a point at lon 270, lat -85 comes out at lon -90.
  - `test_outside_extent_dropped`: a point at lat -60 is absent; an overlay whose features all fall outside is `{"features": [], "type": "FeatureCollection"}`.
  - `test_polygon_clipped_to_extent`: a polygon straddling the extent edge has all output vertices within the extent after projecting back.
  - `test_simplify_reduces_vertices`: a 1000-vertex noisy line shrinks with `simplify_m=100`.
  - `test_keep_filters_properties`.
  - `test_geographic_prj_is_projected` (a `GEOGCS` prj with a lon/lat point gives the same point back) and `test_unknown_projection_raises` (message contains the projection name).
  - `test_missing_zip_message`: `shapefile_from_zip(tmp_path / "x.zip")` raises `FileNotFoundError` whose text contains `make fetch ONLY=layers/`.
  - `test_deterministic`: the same input twice gives the same string.
- [ ] **Step 2: Run** `uv run pytest tests/test_layer_vectors.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `shapely.geometry.shape`, `shapely.geometry.box(*extent)`, `shapely.ops.transform` for coordinate changes. A point-only file needs no simplification (skip when the geometry is a Point).
- [ ] **Step 4: Run** `uv run pytest tests/test_layer_vectors.py -v`. Expected: PASS.

### Task 5: Orchestrator, manifest and dist check

**Files:**
- Modify: `build/make_layers.py`, `Makefile`, `.gitignore`, `.gcloudignore`, `.dockerignore`
- Test: `tests/test_make_layers.py`

**Interfaces:**
- Consumes: Tasks 2–4; `data/sources.lock.json` (for manifest hashes); `Meta` from `api.models`.
- Produces in `build/make_layers.py`:
  - `LAYERS_BASE_URL: str`, `RASTER_LAYERS` and `OVERLAYS` registries (id, title, attribution, source lock paths, `keep` property names, `simplify_m`). Titles: "LOLA slope, 80 m", "LOLA elevation, hill-shaded", "Permanently shadowed regions, 1 km² and larger", "Permanently shadowed regions, 5 km² and larger (Mazarico 2011)", "Past mission sites", "Artemis III candidate regions (2024)", "Artemis III candidate regions (2022)", "Endurance-A traverse". Attributions: `NASA / GSFC / LOLA` for slope, elevation and the 1 km² PSR set; `NASA / LRO / LROC (ASU)` for the large PSR set and mission sites; `NASA, via Arizona State University / ACT` for the Artemis III and Endurance files. These strings are the builder's best reading; record in `docs/spikes/hosting.md` that licence wording is still to verify.
  - `build_all(sources: Path, out: Path, region: Region) -> None` — deletes `out` first, builds everything, writes `out/layers.json` (per layer: id, title, attribution, source URLs and sha256 from the lock, output file count and bytes), and runs `check_dist`.
  - `check_dist(meta: Meta, dist: Path) -> list[str]` — for every region layer with `kind == "local"` and every overlay, maps its URL under `LAYERS_BASE_URL` to a path under `dist` (for tiles: the z0 tile `0/0/0.png` and the z6 tile at the extent centre must exist) and returns a problem string for each missing file, plus one if total size ≥ 40 MB or an overlay GeoJSON ≥ 5 MB.
  - `main() -> None` (`python -m build.make_layers`); a missing source file raises an error naming the file and `make fetch ONLY=layers/`.
- Makefile targets: `layers` (`uv run python -m build.make_layers`), `layers-deploy` (`cd layers && firebase deploy --only hosting --project clps-514710`).

- [ ] **Step 1: Write failing tests** in `tests/test_make_layers.py` with tiny synthetic sources in `tmp_path` laid out as the Global Constraints paths:
  - `test_build_all_writes_layout_and_manifest`: the layout of Global Constraints exists; `layers.json` lists all 8 layers with sha256 taken from a stub lock.
  - `test_rebuild_is_clean_and_identical`: a stray file in `out` is gone after a rebuild; two builds produce identical file hashes.
  - `test_missing_source_names_file_and_command`.
  - `test_check_dist_reports_missing_file`: delete one overlay and one z0 tile; both are reported.
  - `test_check_dist_flags_oversize_overlay`.
- [ ] **Step 2: Run** `uv run pytest tests/test_make_layers.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `build_all`, `check_dist`, `main`, the Makefile targets, and add `layers/dist` to `.gitignore`, `.gcloudignore` and `.dockerignore`.
- [ ] **Step 4: Run** `uv run pytest tests/test_make_layers.py -v`. Expected: PASS.

### Task 6: Contract and sample meta

**Files:**
- Modify: `api/models.py`, `contract/samples/meta.json`, `contract/openapi.json` and `web/src/api/schema.d.ts` (both regenerated)
- Test: `tests/test_contract_models.py`, `tests/test_api_basic.py` (extend)

**Interfaces:**
- Produces in `api/models.py`: `Overlay(BaseModel)` with `id: str`, `title: str`, `kind: Literal["geojson"]`, `url: str`, `attribution: str`; `Region.overlays: list[Overlay] = Field(default_factory=list)` (default keeps existing fixtures valid).
- `contract/samples/meta.json`, region `south_pole`: keep the Moon Trek layer first; append two `kind: "local"` layers (`slope_80m`, `elevation`) with `url_template` `https://clps-514710-layers.web.app/tiles/south_pole/<id>/{z}/{x}/{y}.png`, `legend_url` `https://clps-514710-layers.web.app/legends/<id>.png`, and the attributions from Task 5; add the six `overlays` with `url` `https://clps-514710-layers.web.app/overlays/<id>.geojson`. Titles and attributions are the Task 5 strings.

- [ ] **Step 1: Write failing tests:**
  - `test_overlay_model_rejects_unknown_kind` in `tests/test_contract_models.py`.
  - `test_meta_lists_layers_and_overlays` in `tests/test_api_basic.py`: `GET /api/v1/meta` returns region `south_pole` whose `layers` ids are `["LRO_LOLA_ClrShade_SPole75_30mp_v04", "slope_80m", "elevation"]` and whose `overlays` ids are the six overlay ids, and every `url` / `url_template` starts with `https://clps-514710-layers.web.app/`.
- [ ] **Step 2: Run** `uv run pytest tests/test_contract_models.py tests/test_api_basic.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the model change and edit `meta.json`.
- [ ] **Step 4: Regenerate** `make contract`, then `uv run python -m api.contract check` (expected exit 0). The only `web/` file that changes is the generated `schema.d.ts`.
- [ ] **Step 5: Run** `uv run pytest tests/test_contract_models.py tests/test_api_basic.py tests/test_contract_cli.py -v`. Expected: PASS.

### Task 7: Hosting site config

**Files:**
- Create: `layers/firebase.json`, `layers/.firebaserc`
- Test: `tests/test_layers_hosting.py`

**Interfaces:**
- `layers/firebase.json`: `{"hosting": {"site": "clps-514710-layers", "public": "dist", "ignore": ["**/.*"], "headers": [...]}}` with, for `**`, `Cache-Control: public, max-age=31536000, immutable` and `Access-Control-Allow-Origin: *`; no SPA rewrite (a missing tile must 404). `layers/.firebaserc`: `{"projects": {"default": "clps-514710"}}`. The repo-root `firebase.json` and `.firebaserc` stay untouched, so the web app's deploy is unaffected (this replaces the spec's "targets entry" with a separate config; same result, no change for the web owner).

- [ ] **Step 1: Write failing test** `test_layers_hosting_config` in `tests/test_layers_hosting.py`: parses `layers/firebase.json`, asserts site, public, both headers, no `rewrites`, and that its site id equals the host part of `LAYERS_BASE_URL`.
- [ ] **Step 2: Run** `uv run pytest tests/test_layers_hosting.py -v`. Expected: FAIL.
- [ ] **Step 3: Create** the two files.
- [ ] **Step 4: Run** `uv run pytest tests/test_layers_hosting.py -v`. Expected: PASS.

### Task 8: Real build, checks and docs

**Files:**
- Modify: `docs/spikes/hosting.md` (new "Map layers" section: sources, `make fetch ONLY=layers/`, `make layers`, `make layers-deploy`, the one-time site creation, licence wording still to verify, the file sizes measured)

- [ ] **Step 1: Build for real.** `make layers`. Expected: finishes, `check_dist` prints no problems, `layers/dist` under 40 MB, each GeoJSON under 5 MB. If the PSR 1 km² file exceeds 5 MB, raise its `simplify_m` in the registry and rebuild; record the final tolerance in the docs.
- [ ] **Step 2: Look at it.** Serve `layers/dist` locally (`python3 -m http.server -d layers/dist 8099`) and open `/tiles/south_pole/slope_80m/6/13/13.png` and `/overlays/mission_sites.geojson`; report what you see (slope colours near the pole; sites such as Apollo points absent at this latitude is expected, so expect few or zero features — say so).
- [ ] **Step 3: Verify the whole repo.** Run `uv run pytest`, `uv run mypy api engine build deploy`, `uv run python -m api.contract check`, and `pnpm --dir web exec tsc -p tsconfig.app.json --noEmit`. Expected: all pass; paste any failure's output instead of summarising it.
- [ ] **Step 4: Ask the user before anything outward-facing.** Creating the hosting site (`firebase hosting:sites:create clps-514710-layers --project clps-514710`) and `make layers-deploy` publish to the public internet and need the user's `firebase` login. Give them the two commands to run with the `!` prefix. After they run them, check `curl -sI https://clps-514710-layers.web.app/overlays/psr_1km2.geojson` returns 200 with `access-control-allow-origin: *` and the immutable cache header. If the site id is taken, pick another id and update `LAYERS_BASE_URL`, `layers/firebase.json` and `meta.json` together.
