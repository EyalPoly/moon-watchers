# Custom points: design

Slice S7 of the build approach. The product spec (§6.5, §6.6, §8.2) says what a custom point is; this document decides how the server delivers it on Cloud Run, with the terrain we can ship today.

## Intent

A user clicks the map or types a latitude and longitude between 84°S and the pole, and gets the same answers a catalog site gets: the skyline (horizon), the Sun and Earth series, and the summary with its score. The server computes the point itself, because the catalog bundle only covers fixed sites.

## Goals, non-goals, anti-goals

**Goals**
- Any point in 84–90°S works through the existing endpoints, with no change to the web contract beyond what the web app already sends.
- A shared link to a custom point works after a server restart (the point is recomputed from its id).
- It deploys without new cloud infrastructure.

**Non-goals**
- 20 m terrain for custom points (later: terrain in object storage).
- The live shadow overlay for custom points (S8), nearby alternatives (S10), a disk cache.
- A PSR map: `in_psr` stays unknown, as for catalog sites.

**Anti-goals**
- A custom point that looks as precise as a catalog site when it is not. It carries a warning that it uses coarser terrain.
- One slow click starving the whole instance, or filling its memory.

## Constraints

- Cloud Run, CPU only, 512 MiB, 1 vCPU, max 2 instances (`docs/spikes/hosting.md`).
- The physics must be the same function as the catalog build: `engine.horizons.compute_site_masks`, same algorithm version.
- Terrain files are large and not in git. The bundle already travels as a checksum-pinned GitHub Release asset fetched while the image is built; terrain follows the same path.
- The web app already creates custom ids, `pt_s87500_e045000` (0.001° precision, longitude 0 to 360), in `web/src/api/points.ts`. The server adopts that format; the spec's `cust_…` format is dropped.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **1 (picked)** | **80 m and 240 m terrain, with their error rasters and the 80 m slope map, fetched into the image at build time. Compute a point on the first request, keep it in memory.** About 1.2 GB of files; no new infrastructure; windows are read from disk per point. | Near-horizon skylines can differ from 20 m results by up to about 0.7° at some sites (measured in `docs/spikes/horizon-check.md`); far terrain barely changes (0.026°). |
| 2 | Terrain in a Cloud Storage bucket, 20 m for custom points. | Best accuracy, but needs a bucket, access on the project owner's account, and a 3–5 GB upload first. A later upgrade, not the first deploy. |
| 3 | Precompute a grid (about 4,000 points at 5 km) and snap clicks to it. | No terrain on the server, but not exact, and about 3.5 hours of building. |
| 4 | Read NASA's rasters live. | About 10 s per tile in a measured read, and a dependency on NASA's server. Rejected. |

Upgrading from 1 to 2 changes only where `TERRAIN_DIR` points and which layers load; the endpoints and the tests do not change.

## Decisions

1. **Ids.** `pt_<s|n><lat×1000>_e<lon×1000, 6 digits>`, as the web app writes them. The server parses and rewrites an id before using it, and rounds to 0.001° (about 30 m). A point outside 84–90°S is `422 OUT_OF_COVERAGE`. An id that doesn't parse is `404 INVALID_PARAM`, like any unknown site.
2. **Terrain.** The 80 m elevation and error rasters (80°S to the pole), the 240 m elevation and error rasters (60°S to the pole), and the 80 m slope raster, pinned by size and sha256 in `deploy/terrain.lock.json`, fetched by the Dockerfile into `/app/terrain`, found through `TERRAIN_DIR`. With the lock empty, or `TERRAIN_DIR` unset, custom points stay disabled (`503 FEATURE_DISABLED`, as today) and a deploy is unaffected.
3. **The site record.** Name `Custom point 87.500°S, 45.000°E`; category `custom point`; source `custom`; elevation sampled from the terrain at the point; slope read from the 80 m slope raster; `slope_resolution_m` 80; `in_psr` unknown; `is_placeholder` false. Missing terrain or slope at the point is `422 OUT_OF_COVERAGE`.
4. **A new warning code**, `CUSTOM_COARSE_TERRAIN` (caution, affects the skyline and slope), appended to every custom point's data warnings.
5. **Computation.** Same `compute_site_masks` as the catalog build, over an 80 m window of 12 km and a 240 m window sized for the point's reach. The existing two-slot limit on heavy work covers it.
6. **Cache and limits.** An in-memory LRU of 256 points (about 32 MB), one lock per id so two clicks on the same point compute once, and at most 20 new points per minute per instance (`429 RATE_LIMITED`). No disk cache: a restart costs one recompute per link.
7. **Endpoints.** `POST /sites/custom`, `GET /sites/{id}`, horizon, series and summary all accept `pt_` ids. CORS allows POST. `/meta` reports `custom_points: true` only when terrain is configured.

## Left to the builder

File layout inside `engine/` and `api/`, the exact warning text (one sentence, plain words), and test data. The accuracy statement in the warning must match `docs/spikes/horizon-check.md`.

## After this ships (not part of this work)

Pack and publish the terrain from the PC that has it, pin it in `deploy/terrain.lock.json`, deploy, measure a cold and a warm custom point on the live service, and switch `custom` to `real` in `web/public/config.json`.
