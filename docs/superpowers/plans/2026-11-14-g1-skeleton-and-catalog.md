# G1 Skeleton and Catalog (Slices S0 + S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repo with CI, a FastAPI server serving `/health`, `/meta`, `/sites`, `/sites/{id}`, and a React app that shows the polar map with one NASA Moon Trek layer, site pins and a site picker, running on labeled sample answers with no server, at two hosted previews. Gate G1.

**Architecture:** Contract first (build-approach §5): Pydantic models in `api/` are the source of truth; sample answers live in `contract/samples/`; OpenAPI and the TypeScript types are generated from the models and drift-checked in CI. The web app reads each endpoint from MSW (`sample`) or the API (`real`) according to `config.json` (build-approach §6). Data sources are downloaded once into `data/sources/` (outside git), and a GPU timing spike measures the horizon workload.

**Tech Stack:** Python 3.12 + uv, FastAPI, Pydantic v2, pytest, mypy; pnpm, Vite, React, TypeScript, TanStack Query, zod, OpenLayers (+ proj4), MSW, openapi-typescript, Vitest, Playwright; GitHub Actions + GitHub Pages; PyTorch (spike only).

**Spec:** `docs/superpowers/specs/2026-11-10-lunar-landing-site-navigator-design.md` (the product spec, "the spec") and `docs/superpowers/specs/2026-11-14-build-approach-design.md` ("the build approach"). Executors read both.

## Global Constraints

- Base path `/api/v1`; lat/lon in degrees, east-positive lon in [−180, 180); times ISO 8601 UTC; units in field names (spec §8, §12.2).
- Errors are `application/problem+json` with a stable `code` from: `OUT_OF_COVERAGE`, `OUT_OF_TIME_RANGE`, `INVALID_PARAM`, `TERRAIN_READ_FAILED`, `RATE_LIMITED`, `FEATURE_DISABLED`, `NL_UNAVAILABLE`, `NL_NOT_UNDERSTOOD` (spec §8.4).
- `/meta` and `/health`: `Cache-Control` at most 60 s. Versioned GETs: `public, max-age=31536000, immutable` (spec §8.4).
- Custom-point area is 84°S to 90°S; catalog sites are south-polar, inside that area (spec §6.6, §15.1).
- Region `south_pole`: polar stereographic on a 1,737.4 km sphere; verify against Moon Trek's projection (spec §6.2, Appendix B).
- Moon Trek attribution text: "NASA Moon Trek / LOLA" in the map's attribution corner (spec §9.3).
- Sample answers are always labeled: a "Sample data" banner while any visible number comes from a sample, and a small tag on each card that uses one (build approach §6). `?data=sample` forces every endpoint to sample.
- MSW matches on endpoint and scenario parameters and ignores `v`; an unknown site falls back to the nearest sample site (build approach §6).
- Frontend stack is locked as in spec §9.1; folders `state/ api/ map/ ui/` are used here (spec §9.5). Dark theme first; lime is the primary-action color (spec §9.4).
- Dependency versions are pinned through lockfiles; no secrets in the repo (spec §10.5).
- Open-source license file in the repo root (spec §2). Use MIT unless the user says otherwise.
- Project code was not allowed before kickoff on 14 Nov; this plan starts after kickoff.
- Never copy estimates, decisions or code from `github-project/` (another team's repo); it is excluded from git.
- Run the typecheck (`make typecheck`) after each series of code changes.

## Review Focus

1. **Broken or outdated link** (`?site=nonexistent`, `?site=`, garbage params): the app opens on defaults with no error screen (Task 12 test).
2. **Moon Trek tile failure** (offline, 404): the map still renders with pins and shows "Basemap unavailable" instead of a blank or broken map (Task 6 test).
3. **API down while an endpoint is `real`:** the card shows a clear "Server unavailable" state and the page keeps working; no crash or endless spinner (Task 12 test).
4. **Hostile site ids** (`../x`, `%2e%2e`, empty, very long): `/sites/{id}` returns 404 `problem+json`, never a 500 or a file read (Task 11 test).
5. **Sample answer for an unknown site:** MSW serves the nearest sample site's answer instead of failing (Task 5 test).

---

## File Structure

```
.gitignore  LICENSE  Makefile  README.md
pyproject.toml  uv.lock                 one Python project: packages engine, api
engine/__init__.py                      empty for now (physics arrives in S2+)
api/main.py                             FastAPI app factory + routes
api/models.py                           Pydantic contract models (source of truth)
api/errors.py                           problem+json handlers
api/catalog.py                          loads catalog/sites.yaml -> list[Site]
api/contract.py                         CLI: `generate` / `check` OpenAPI + samples validation
catalog/sites.yaml                      stub catalog (physics team replaces)
contract/openapi.json                   generated, committed
contract/samples/                       sample answers (JSON), validated against models
build/fetch_sources.py  build/gpu_spike.py   scripts, run as `python build/<name>.py`
data/sources.lock.json                  URL + sha256 per source file (in git)
data/sources/                           downloaded files (NOT in git)
tests/                                  pytest
web/                                    Vite app (src/api, src/map, src/state, src/ui, tests, e2e)
web/public/config.json                  runtime config (api_base, sources)
.github/workflows/ci.yml  deploy.yml
docs/spikes/                            spike results (GPU timing, Moon Trek, hosting)
```

---

### Task 1: Repo, tooling and CI skeleton

**Files:**
- Create: `.gitignore`, `LICENSE`, `Makefile`, `README.md`, `pyproject.toml`, `engine/__init__.py`, `api/__init__.py`, `tests/test_smoke.py`, `web/` (Vite React-TS app via `pnpm create vite`), `web/src/smoke.test.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `make check` = `make test` + `make typecheck`; `make test` runs `uv run pytest` and `pnpm --dir web test`; `make typecheck` runs `uv run mypy api engine build` and `pnpm --dir web exec tsc --noEmit`. `make fetch`, `make contract` are added by later tasks.

- [ ] **Step 1: `git init` in the project root.** `.gitignore` must exclude `github-project/`, `data/sources/`, `node_modules/`, `.venv/`, `web/dist/`, `.superpowers/`, `.serena/`. Commit the two spec files first, alone: `git add docs/superpowers/specs && git commit -m "docs: product spec and build approach"`.
- [ ] **Step 2: Write the failing smoke tests.** `tests/test_smoke.py::test_engine_and_api_import` asserts `import engine, api` works. `web/src/smoke.test.ts` asserts `1 + 1 === 2` under Vitest (proves the runner works).
- [ ] **Step 3: Run `make check`; expected FAIL** ("No rule to make target" / missing pyproject).
- [ ] **Step 4: Create the tooling:** `pyproject.toml` (uv, Python 3.12, deps `fastapi`, `pydantic>=2`, `pyyaml`, `httpx`, `uvicorn`; dev deps `pytest`, `mypy`; mypy strict for `api`, `engine`, `build`), the Vite app with Vitest configured, the Makefile, MIT `LICENSE`, a README stub (what it is, `make check`). Do not install PyTorch here (Task 9 handles it as an optional extra `gpu`).
- [ ] **Step 5: `ci.yml`:** on push and PR, jobs `python` (uv sync, `make` equivalents) and `web` (pnpm install --frozen-lockfile, vitest, tsc). Contract drift and e2e jobs are added in Tasks 3 and 7.
- [ ] **Step 6: Run `make check`; expected PASS.** Commit `chore: repo skeleton with python and web tooling`.

### Task 2: Contract models for health and meta, with sample answers

**Files:**
- Create: `api/models.py`, `contract/samples/meta.json`, `contract/samples/health.json`, `tests/test_contract_models.py`

**Interfaces:**
- Produces in `api/models.py` (all `pydantic.BaseModel`):
  - `Health(status: Literal["ok"], version: str)`
  - `Layer(id: str, title: str, kind: Literal["wmts","local"], url_template: str | None, attribution: str, legend_url: str | None)`
  - `Region(id: str, crs: str, proj4: str, extent_m: tuple[float,float,float,float], tile_grid: TileGrid, layers: list[Layer], custom_area: CustomArea)`, `TileGrid(origin: tuple[float,float], resolutions_m: list[float], tile_size_px: int)`, `CustomArea(min_lat_deg: float, max_lat_deg: float)`
  - `Capabilities` (bool fields: `custom_points, custom_grids, insights, calendar, search, alternatives, stations, dust, globe, power, nl`), `Limits(max_cards: int, max_days: int, max_search_window_d: int)`
  - `Meta(version: str, bundle_id: str, mode: Literal["event","judging"], regions: list[Region], capabilities: Capabilities, limits: Limits)`
  - `Problem(type: str, title: str, status: int, code: ErrorCode, detail: str | None)` with `ErrorCode` a `Literal` of the eight codes in Global Constraints.
- Consumes: nothing.

- [ ] **Step 1: Write failing tests** in `tests/test_contract_models.py`:
  - `test_meta_sample_validates`: `Meta.model_validate_json(Path("contract/samples/meta.json").read_text())` succeeds and `meta.limits.max_cards == 3` and `meta.regions[0].custom_area == CustomArea(min_lat_deg=-90, max_lat_deg=-84)`.
  - `test_health_sample_validates`.
  - `test_problem_rejects_unknown_code`: `Problem(..., code="NOPE")` raises `ValidationError`.
- [ ] **Step 2: Run `uv run pytest tests/test_contract_models.py -v`; expected FAIL** (ImportError).
- [ ] **Step 3: Implement the models** in `api/models.py`. The `south_pole` sample region uses the interim proj4 `+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs`. The sample's WMTS `url_template` and tile grid are placeholders until Task 6's spike supplies the real ones; mark the sample layer title "Moon Trek (placeholder URL)" until then. Capabilities in the sample: `custom_points`, `search`, etc. all `false` (nothing is built yet).
- [ ] **Step 4: Write both sample JSON files** by hand, then run the tests; expected PASS.
- [ ] **Step 5: Commit** `feat(contract): health and meta models with sample answers`.

### Task 3: OpenAPI generation, TypeScript types and drift CI

**Files:**
- Create: `api/contract.py`, `tests/test_contract_cli.py`, `contract/openapi.json` (generated), `web/src/api/schema.d.ts` (generated)
- Modify: `Makefile` (add `contract`), `.github/workflows/ci.yml`, `web/package.json` (dev dep `openapi-typescript`)

**Interfaces:**
- Consumes: `api.main.create_app() -> FastAPI` (Task 4). To keep this task independent, the first version builds the schema from a stub app that registers only `Health`/`Meta` response models; Task 4 switches `contract.py` to `create_app()`.
- Produces: `python -m api.contract generate` (writes `contract/openapi.json` and runs `pnpm --dir web exec openapi-typescript ../contract/openapi.json -o src/api/schema.d.ts`); `python -m api.contract check` (exit 1 with a message naming the stale file if either generated file differs, or if any `contract/samples/**/*.json` fails validation against its model); `SAMPLE_MODELS: dict[str, type[BaseModel]]` mapping a samples path pattern (`"meta.json"`, `"health.json"`) to its model, extended by later tasks.

- [ ] **Step 1: Write failing tests:** `test_check_passes_when_in_sync` (run `generate` into a tmp dir via an `--out` option, then `check --against` that dir, exit code 0); `test_check_fails_on_stale_openapi` (edit one byte, exit code 1, stderr contains `openapi.json`); `test_check_fails_on_invalid_sample` (a sample with a bad field, exit 1, stderr names the file).
- [ ] **Step 2: Run; expected FAIL** (module missing).
- [ ] **Step 3: Implement `api/contract.py`** with `argparse` subcommands. Serialize OpenAPI with `json.dumps(..., indent=2, sort_keys=True)` so output is stable.
- [ ] **Step 4: Run the tests; expected PASS.** Then `make contract` and commit the generated files.
- [ ] **Step 5: CI:** add a `contract` job running `python -m api.contract check`. A stale file or invalid sample must fail it. Verify locally by editing `contract/openapi.json`, running `check` (expect exit 1), then restoring.
- [ ] **Step 6: Commit** `ci: openapi and typescript drift check`.

### Task 4: API app with health and meta

**Files:**
- Create: `api/main.py`, `api/errors.py`, `tests/test_api_basic.py`
- Modify: `api/contract.py` (use `create_app()`)

**Interfaces:**
- Produces: `create_app(sample_dir: Path = Path("contract/samples")) -> FastAPI`; routes `GET /api/v1/health -> Health`, `GET /api/v1/meta -> Meta` (S0: reads and validates `meta.json`), both with `Cache-Control: public, max-age=60`; `class ApiError(Exception)` with `status: int`, `code: ErrorCode`, `detail: str`; handler returning `application/problem+json` as `Problem`. Unknown routes and validation errors (`RequestValidationError`) also return `problem+json` with `code="INVALID_PARAM"`.

- [ ] **Step 1: Write failing tests** with `fastapi.testclient.TestClient`: `test_health_ok` (200, `status == "ok"`, header `cache-control` contains `max-age=60`); `test_meta_matches_sample` (response equals the sample's parsed JSON); `test_unknown_route_is_problem_json` (404, content type `application/problem+json`, `code == "INVALID_PARAM"`); `test_meta_is_validated_against_model` (a `sample_dir` with a malformed `meta.json` makes `create_app` raise at startup, since the app refuses to serve invalid data).
- [ ] **Step 2: Run; expected FAIL.**
- [ ] **Step 3: Implement.** Load and validate the meta sample once in `create_app`. `version` in `/health` comes from the `engine` package version string `0.0.0` for now.
- [ ] **Step 4: Run tests and `make typecheck`; expected PASS.** Switch `api/contract.py` to `create_app()`, run `make contract` (output should be unchanged apart from real routes), commit `feat(api): health and meta endpoints with problem+json errors`.

### Task 5: Web data layer with per-endpoint sample/real switch and MSW

**Files:**
- Create: `web/public/config.json`, `web/src/api/config.ts`, `web/src/api/client.ts`, `web/src/api/mocks/handlers.ts`, `web/src/api/mocks/browser.ts`, `web/src/api/config.test.ts`, `web/src/api/handlers.test.ts`; copy samples via a Vite alias to `../contract/samples` (no duplicate files)
- Modify: `web/package.json` (deps `msw`, `openapi-fetch`, `zod`), `web/src/main.tsx` (start the worker before render when any endpoint resolves to `sample`)

**Interfaces:**
- Produces:
  - `config.json` shape: `{ "api_base": string, "sources": { "sites": "real"|"sample", "horizon": ..., "summary": ... } }`. Initial content: `{"api_base": "", "sources": {"sites": "sample", "horizon": "sample", "summary": "sample"}}`. Keys not yet built are accepted and ignored.
  - `type SourceName = "sites" | "horizon" | "summary" | "meta"`; `loadConfig(url?: string): Promise<AppConfig>` validates with zod and falls back to all-`sample` if the file is missing or invalid.
  - `resolveSource(config: AppConfig, name: SourceName, search: string): "sample" | "real"`; `search` containing `data=sample` forces `"sample"`; `meta` follows `sites`.
  - `anySample(config, search): boolean` (drives the banner, Task 6).
  - `createApi(config, search): { getMeta, getSites, getSite(id) }`, each returning typed data from `schema.d.ts` types, using `openapi-fetch` against `api_base` for `real`, and against the MSW-served same-origin path for `sample`.
  - `handlers.ts`: `buildHandlers(samples)`; matches `/api/v1/<endpoint>` ignoring the `v` query param.

- [ ] **Step 1: Write failing tests.**
  - `config.test.ts`: `resolveSource` returns `"real"` for `{sites:"real"}` with search `""`, and `"sample"` for the same config with `"?data=sample"`; `loadConfig` of a malformed body returns all-`sample`.
  - `handlers.test.ts` (uses `msw/node`): `GET /api/v1/meta?v=abc` and `?v=zzz` return the same body; `GET /api/v1/health` returns the health sample. (Site handlers and nearest-site fallback are added in Task 10.)
- [ ] **Step 2: Run `pnpm --dir web test`; expected FAIL.**
- [ ] **Step 3: Implement** the files above. `createApi` must never mix: a call goes to exactly one source, decided by `resolveSource`.
- [ ] **Step 4: Run tests and `pnpm --dir web exec tsc --noEmit`; expected PASS.**
- [ ] **Step 5: Commit** `feat(web): config-driven sample/real data layer with MSW`.

### Task 6: Polar map with one Moon Trek layer, basemap fallback and sample banner

**Files:**
- Create: `docs/spikes/moon-trek-wmts.md`, `web/src/map/projection.ts`, `web/src/map/PolarMap.tsx`, `web/src/map/projection.test.ts`, `web/src/map/basemap.test.ts`, `web/src/ui/SampleBanner.tsx`, `web/e2e/smoke.spec.ts`, `web/playwright.config.ts`
- Modify: `contract/samples/meta.json` (real layer id, URL template and tile grid), `web/src/App.tsx`, `web/package.json` (deps `ol`, `proj4`)

**Interfaces:**
- Consumes: `Region`/`Layer` types from `schema.d.ts`; `createApi(...).getMeta()`; `anySample(...)` (Task 5).
- Produces: `registerRegionProjection(region: Region): ProjectionLike` (registers the region's `proj4` string with OpenLayers under the code `region.crs`); `<PolarMap region={Region} onBasemapError?={() => void} children?>` rendering the dashed circle at `custom_area.max_lat_deg`, the attribution from the active layer, and, after the first tile error, the text "Basemap unavailable" (the map, pins and interaction keep working); `<SampleBanner visible={boolean}/>` with text "Sample data".

- [ ] **Step 1: Spike, no code to ship.** From the Moon Trek WMTS `GetCapabilities` (or its documented tile endpoint), find: the south-pole colour-hillshade layer id, the tile matrix set, tile size, origin, resolutions, and the tile URL pattern. Confirm (a) its projection matches the interim proj4 in `meta.json` (use the known point from spec §11.4: service coordinate (20000, −15000) m), and (b) the licence/credit text of that layer. Record all of it, with the exact URLs used, in `docs/spikes/moon-trek-wmts.md`. If the projection differs, change the region's proj4 in the sample and note it. If no usable layer is found within 45 min, fall back to a static hillshade image and record that decision (spec §15.2).
- [ ] **Step 2: Write failing tests.**
  - `projection.test.ts`: with the sample region, transforming lon 0, lat −90 gives (0, 0) within 1 m; lon 0, lat −89 gives a point whose distance from the origin is 30,324 m ± 2 m; transforming back round-trips within 1e-6°.
  - `basemap.test.ts`: rendering `<PolarMap>` with a tile loader that fails calls `onBasemapError` once and shows "Basemap unavailable"; the dashed circle element exists in both states.
  - `e2e/smoke.spec.ts` (Playwright, against the dev server with all sources `sample`): the page shows "Sample data" and the map canvas is not blank (read a few pixels from the canvas; at least 2 distinct colours).
- [ ] **Step 3: Run; expected FAIL.**
- [ ] **Step 4: Implement** the files. Tiles load straight from NASA in the browser (spec §9.3); there are no own tiles yet, so the fallback is the message plus a dark background. Show the credit "NASA Moon Trek / LOLA" in the attribution control. Update `meta.json` from the spike and re-run `make contract` and `python -m api.contract check`.
- [ ] **Step 5: Run unit tests, `pnpm --dir web exec playwright test`, `make typecheck`; expected PASS.**
- [ ] **Step 6: Commit** `feat(web): polar map with Moon Trek layer, fallback message and sample banner`.

### Task 7: Hosted previews (product and integrated) and e2e in CI

**Files:**
- Create: `.github/workflows/deploy.yml`, `web/scripts/write-config.mjs`
- Modify: `.github/workflows/ci.yml` (add `e2e` job), `web/vite.config.ts` (`base` taken from env `VITE_BASE`), `README.md` (preview links)

**Interfaces:**
- Produces: on every push to `main`, `deploy.yml` builds the app twice into one Pages artifact: `/product/` with a `config.json` of `{"api_base":"","sources":{<all keys "sample">}}` and `/integrated/` with the committed `web/public/config.json`; plus a `404.html` so deep links work. `write-config.mjs <outDir> <mode: product|integrated>`.

- [ ] **Step 1: Write a failing test** `web/scripts/write-config.test.ts`: `product` mode output has every source `sample` even if the committed config says `real`; `integrated` copies it unchanged.
- [ ] **Step 2: Run; expected FAIL. Implement the script; run; expected PASS.**
- [ ] **Step 3: Write `deploy.yml`** (GitHub Pages, build with `VITE_BASE=/<repo>/product/` and `/integrated/`) and add the `e2e` CI job (installs Playwright browsers, runs the Task 6 smoke spec against `vite preview`). The repo must be public for free Pages; ask the user to create the GitHub repo and enable Pages if it is not set up, and say so in the PR text.
- [ ] **Step 4: Push to a branch, check CI is green; after merge to `main`, open both preview URLs and confirm the "Sample data" banner shows on `/product/`.** Record the URLs in `README.md`.
- [ ] **Step 5: Commit** `ci: deploy product and integrated previews`.

### Task 8: Source download with checksum lockfile

**Files:**
- Create: `build/fetch_sources.py`, `data/sources.lock.json`, `tests/test_fetch_sources.py`, `docs/spikes/sources-verified.md`
- Modify: `Makefile` (`fetch`), `.gitignore` (already covers `data/sources/`)

**Interfaces:**
- Produces: `data/sources.lock.json` = `{"files": [{"path": "spice/de440s.bsp", "url": "…", "sha256": "…", "bytes": 0, "note": "…"}]}`; in `build/fetch_sources.py`: `verify_file(path: Path, sha256: str) -> bool`; `fetch_all(lock_path: Path, dest: Path, fetch=download) -> list[str]` (returns the paths fetched; skips files that already verify; downloads to `<name>.part`, verifies, then renames; on a mismatch deletes the part file and raises `ChecksumMismatch(path, expected, actual)`); `main()` for `make fetch`.

- [ ] **Step 1: Write failing tests** with a fake `fetch` writing known bytes: `test_skips_verified_files` (fetch not called); `test_downloads_missing_file_and_renames`; `test_mismatch_deletes_part_and_raises`; `test_corrupt_existing_file_is_redownloaded`.
- [ ] **Step 2: Run; expected FAIL. Implement; run; expected PASS.**
- [ ] **Step 3: Build the lockfile.** Verify (spec Appendix B) and record in `docs/spikes/sources-verified.md`: current NAIF kernel versions (`naif0012.tls`, `pck00011.tpc`, `de440s.bsp`; the lunar orientation `.bpc` and a frame kernel that defines the MOON_ME alias (the 13 Nov research found `moon_de440_250416.tf` or newer is needed, with `moon_pa_de440_200625.bpc`; confirm which pairing the spec's DE421-era files vs DE440-era files require, and record the choice), an Earth orientation kernel covering 2026–2031, DSN station location kernel; the LOLA 20 m and 240 m south-polar DEMs (file names, size, projection, radius, error product yes/no); NASA illumination, PSR and slope layers if found. Compute sha256 after the first download and write the lock entries. Do not guess URLs: only those that were opened and downloaded successfully go in.
- [ ] **Step 4: Run `make fetch`** (large; the user may run it on the Windows PC and copy `data/sources/`); then `make fetch` again; expected: second run fetches nothing.
- [ ] **Step 5: Commit** `feat(build): checksummed source download` (lockfile and note only, not the data).

### Task 9: GPU timing spike and hosting decision

**Files:**
- Create: `build/gpu_spike.py`, `tests/test_gpu_spike.py`, `docs/spikes/gpu-timing.md`, `docs/spikes/hosting.md`
- Modify: `pyproject.toml` (optional extra `gpu` with `torch`)

**Interfaces:**
- Produces: `run_spike(device: str, n_dirs: int, n_steps: int, n_points: int, dem_size: int) -> dict` returning `{"device": str, "lookups": int, "seconds": float, "lookups_per_s": float, "peak_mem_mb": float | None}`; CLI `python build/gpu_spike.py --device auto|cuda|mps|cpu --points 200 --dirs 720 --steps 10000`. The workload: bilinear lookups into a synthetic DEM tensor along straight rays, with the 32-bit elevation formula of spec §7.2, running max per direction. It is a timing proxy, not the engine.

- [ ] **Step 1: Write failing tests** on CPU with tiny sizes: result dict has all five keys; `lookups == n_points * n_dirs * n_steps`; `device == "cpu"` when requested; `lookups_per_s > 0`.
- [ ] **Step 2: Run; expected FAIL. Implement; run; expected PASS.** `torch` is imported inside `run_spike` only.
- [ ] **Step 3: Measure.** On the Mac (`--device auto` should pick `mps`) with small sizes, record the numbers. **Ask the user to run on the Windows RTX 4060:** `uv sync --extra gpu` (CUDA wheels) then `python build/gpu_spike.py --device cuda --points 200 --dirs 120 --steps 10000` (the 40,000-point grid is `--points 40000`; start at 200 and scale, to avoid running out of 8 GB memory). Record device, lookups/s, extrapolated time for the spec's 5–15 billion lookups grid and the 1–2 million lookup mask, in `docs/spikes/gpu-timing.md`.
- [ ] **Step 4: Hosting decision** in `docs/spikes/hosting.md`: what the organizers offer (GPU or not), the candidate free hosts (spec §10.4), the measured API memory of `create_app()` with and without torch imported, and the chosen event-mode host and judging-mode host. If the user has no answer yet, record "undecided" and the next check time; this does not block G1 on code.
- [ ] **Step 5: Commit** `feat(build): GPU timing spike and measurements`.

### Task 10: S1 contract: sites models and sample answers

**Files:**
- Create: `contract/samples/sites.json`, `contract/samples/sites/sample_a.json`, `.../sample_b.json`, `.../sample_c.json`, `tests/test_sites_models.py`
- Modify: `api/models.py`, `api/contract.py` (`SAMPLE_MODELS` entries), `web/src/api/mocks/handlers.ts`, `web/src/api/handlers.test.ts`

**Interfaces:**
- Produces in `api/models.py`:
  - `Site(id: str, name: str, source: Literal["catalog","custom"], category: str, region: str, lat_deg: float, lon_deg: float, elevation_m: float, slope_deg: float, slope_baseline_m: float, source_url: str, is_placeholder: bool)` (field names use units, per spec §12.2). `lat_deg` must be in [−90, −84], `lon_deg` in [−180, 180), `id` matches `^[a-z0-9_]{1,64}$`; otherwise `ValidationError`.
  - `SitesResponse(sites: list[Site])`.
  - The `local_area` object of spec §8.3 is omitted in S1 and added in S2, when its files exist.
- MSW: `GET /api/v1/sites` → `sites.json`; `GET /api/v1/sites/{id}` → `sites/<id>.json`; for an id with no sample, the handler returns the sample site nearest by id-agnostic great-circle distance to the **requested site's coordinates if given in `?lat=&lon=`**, else the first sample site, and adds a header `x-sample-fallback: <used id>`.

- [ ] **Step 1: Write failing tests:** `test_site_rejects_northern_lat`, `test_site_rejects_bad_id` (`"../x"`, `""`, 65 chars), `test_sites_sample_validates_and_ids_unique`; and in `handlers.test.ts`: `GET /api/v1/sites/not_a_sample` returns 200 with the `x-sample-fallback` header set and a valid site body; `GET /api/v1/sites/sample_b` returns site `sample_b`.
- [ ] **Step 2: Run; expected FAIL.**
- [ ] **Step 3: Implement the models; hand-write three sample sites** named "Sample site A/B/C" with `is_placeholder: true` and `source_url: "placeholder: replaced by the physics team's catalog"`. Coordinates are in 84–90°S and at least 2° apart so the pins are distinguishable on the map. Register them in `SAMPLE_MODELS`; run `make contract`.
- [ ] **Step 4: Run Python and web tests; expected PASS.** Commit `feat(contract): sites models and sample answers`.

### Task 11: Catalog loader and sites endpoints

**Files:**
- Create: `catalog/sites.yaml`, `api/catalog.py`, `tests/test_catalog.py`, `tests/test_api_sites.py`
- Modify: `api/main.py`, `api/contract.py` (regenerate)

**Interfaces:**
- Consumes: `Site`, `SitesResponse`, `ApiError` (Tasks 2, 4, 10).
- Produces: `load_catalog(path: Path) -> dict[str, Site]` (raises `CatalogError(message)` on a duplicate id, a lat/lon outside the area, a missing `source_url`, or a non-mapping file); routes `GET /api/v1/sites -> SitesResponse` and `GET /api/v1/sites/{id} -> Site`, with an unknown or malformed id returning 404 `problem+json`, `code="INVALID_PARAM"`. `create_app(catalog_path: Path = Path("catalog/sites.yaml"))`. Startup fails if the catalog is invalid (the app refuses to serve a broken catalog, spec §6.4).

- [ ] **Step 1: Write failing tests:** `test_load_catalog_ok` (the stub loads 3 sites); `test_duplicate_id_rejected`; `test_lat_outside_area_rejected`; `test_missing_source_url_rejected`; API: `test_sites_list`, `test_site_by_id`, `test_unknown_site_404_problem_json`, and a parametrized `test_hostile_ids` over `"../x"`, `"%2e%2e"`, `"a"*200`, `"x y"` expecting 404 or 422 mapped to `problem+json` with `code="INVALID_PARAM"`, never 500.
- [ ] **Step 2: Run; expected FAIL.**
- [ ] **Step 3: Implement.** `catalog/sites.yaml` holds the same three placeholder sites as Task 10's samples (same ids and values, so real and sample agree for the same id). The catalog file is owned by the physics team and will be replaced; keep the loader strict so their file is checked on load. Add a test that every `contract/samples/sites/*.json` equals the matching catalog entry.
- [ ] **Step 4: Run `make check` and `python -m api.contract check`; expected PASS.**
- [ ] **Step 5: Commit** `feat(api): catalog loader and sites endpoints`. Then create a physics-team handoff note in `docs/spikes/catalog-format.md` (fields, ranges, an example entry) so they can write the real `catalog/sites.yaml`.

### Task 12: Site pins, site picker card and URL state

**Files:**
- Create: `web/src/state/urlState.ts`, `web/src/state/urlState.test.ts`, `web/src/map/SitePins.tsx`, `web/src/ui/SiteCard.tsx`, `web/src/ui/SampleTag.tsx`, `web/src/ui/ServerUnavailable.tsx`, `web/e2e/sites.spec.ts`
- Modify: `web/src/App.tsx`, `web/public/config.json` (final step), `web/package.json` (dep `@tanstack/react-query`)

**Interfaces:**
- Consumes: `createApi`, `resolveSource`, `anySample` (Task 5); `PolarMap` children slot (Task 6); `Site` type from `schema.d.ts`.
- Produces:
  - `parseUrlState(search: string, knownSiteIds: readonly string[]): { site: string | null }` (zod; an unknown, empty or malformed `site` becomes `null`, never throws) and `serializeUrlState(state): string`.
  - `useSites()` and `useSite(id)` TanStack Query hooks keyed by the request URL, keeping old data while loading.
  - `<SitePins sites selectedId onSelect/>` (pin layer in `map/`, highlighted when selected); `<SiteCard siteId sites onChange isSample/>` with a select of site names, the chosen site's name, category, coordinates and slope, and `<SampleTag/>` when `isSample`; `<ServerUnavailable onRetry/>` shown when a `real` request fails.
  - Browser history: choosing a site **adds** a history entry (Back undoes it), per spec §9.2.

- [ ] **Step 1: Write failing unit tests** in `urlState.test.ts`: `?site=sample_b` with known ids parses to `{site:"sample_b"}`; `?site=nonexistent`, `?site=`, `?site=%00`, `?foo=bar` and `""` all parse to `{site:null}`; serialize/parse round-trips.
- [ ] **Step 2: Write failing e2e** in `sites.spec.ts` (all sources `sample`): the page shows 3 pins; clicking pin B selects site B, the card shows "Sample site B", the URL contains `site=sample_b`, the card has the "Sample data" tag; browser Back returns to no selection; opening `/?site=nonexistent` shows the map with no error screen. A second test starts the app with `sites: "real"` and `api_base` pointing at a closed port: the card area shows "Server unavailable" with a retry button, and the map is still visible.
- [ ] **Step 3: Run; expected FAIL.**
- [ ] **Step 4: Implement** the files. The banner shows while `anySample` is true; with `sites: "real"` and a working server it must disappear.
- [ ] **Step 5: Run unit tests, Playwright and `make typecheck`; expected PASS.**
- [ ] **Step 6: Switch to real for the catalog.** Run the API locally (`uv run uvicorn api.main:create_app --factory`), set `sources.sites` to `real` and `api_base` to the local URL in a local copy of `config.json`, and check the card and pins still work with the real `/sites`. Only then, with the user's approval, change the committed `config.json` for the integrated preview once the API is hosted (Task 9's hosting decision); until then the committed value stays `sample`.
- [ ] **Step 7: Commit** `feat(web): site pins, site picker card and URL state`. This completes G1 except the hosted API; list that gap in the PR text.

---

## Self-Review

- **Spec coverage (G1, build approach S0 and S1):** repo and CI (T1, T7); `/health`, `/meta` sample (T2, T4); contract guard rails from build approach §8 (T3); MSW and per-endpoint switch, labeling, `?data=sample` (T5, T6, T12); polar map with one NASA layer and basemap fallback (T6); both previews (T7); kernels and DEM download (T8); GPU timing and hosting (T9); `/sites`, `/sites/{id}` from `catalog/sites.yaml` (T10 contract, T11 server); site pins and picker (T12). Deliberately not here: `/meta` real contents, own fallback tiles (the build must exist first, S9), `local_area` (S2), 3 sample answers per *every* endpoint (each later slice adds its own).
- **Gaps recorded:** the integrated preview stays on `sample` until an API host exists (Task 9 decides it); the Moon Trek URL pattern and layer are found in Task 6's spike, not assumed.
- **Type consistency:** `Site` fields use `lat_deg`/`lon_deg`/`elevation_m`/`slope_deg` in T10, T11 and T12; `create_app` gains parameters in T4 (`sample_dir`) then T11 (`catalog_path`) with defaults, so T4's tests keep working; `SAMPLE_MODELS` is introduced in T3 and extended in T10.
- **Proportion:** about 1.2k words of tasks per slice, signatures and assertions only.
