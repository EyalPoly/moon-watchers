# Map layers: download, build and serve (server side)

Companion to `2026-11-10-lunar-landing-site-navigator-design.md`. Size: a small project. The server owner builds it; the layer switcher in the web app belongs to the web owner and is not part of this work.

## Intent

The 2D map should offer more than the Moon Trek basemap: a slope raster, an elevation raster, and vector overlays (permanently shadowed regions, past mission sites, Artemis III candidate regions, the Endurance traverse). The server side makes that data real, checked and available. The web owner then builds the switcher against `/meta` without waiting.

Source of the list: the "Layers to be presented in the 2D ui" table in `Data links.docx` (repo root).

## Goals

- Every file is downloaded from its NASA/LROC/ACT URL, pinned in `data/sources.lock.json` with sha256 and size.
- The build turns the files into tiles and GeoJSON in the south-pole polar grid.
- The files are served from a CDN with long cache and CORS, never from the API.
- `/api/v1/meta` describes everything the web app needs to draw the layers.

## Non-goals

- Any change under `web/`.
- Filling `in_psr` or changing the score (separate step).
- The CZML files (IM-1 3D models, Artemis 2 Orion orbit): 3D data, not map layers.
- The geomorphic map: no standalone download exists.
- Dust, illumination, Earth-DTE layers: no data yet.

## Anti-goals

- A layer listed in `/meta` whose file is missing or unchecked.
- The demo depending on third-party servers (`files.actgate.com`) at run time.
- Breaking the web owner's mocks: the sample `meta.json` and `openapi.json` must stay consistent with the API.

## Constraints

- Firebase project `clps-514710` is on the free Spark plan: 10 GB storage, 10 GB transfer per month. The layers should stay around 40 MB.
- Tiles use the existing region grid in `contract/samples/meta.json` (`MOON:SP`, 256 px, finest 133.78 m/px). The spec asks for at most 120 m per pixel, so the finest level may need one more resolution; the builder decides.
- Elevation tiles come from DEMs already in `sources.lock.json`. The slope raster is `LDSM_80S_80MPP_ADJ.TIF` (242 MB), which is new.
- Reference radius 1,737.4 km, as in `engine/terrain.py`.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| A | The API serves the files, shipped as a release asset like the horizon bundle. | One thing to deploy, but tile traffic runs through Cloud Run (512 MB, 2 instances): cold starts and cost for no gain. |
| **B (picked)** | **A second Firebase Hosting site for the layers**, deployed separately from the web app. | Needs a second hosting entry and a deploy command. The CDN does the serving, and the web app's build is untouched. |
| C | Put the files in `web/dist`. | Same CDN, but it ties the layers to the web app's build, which is the web owner's. |

Picked B by the user, after asking whether the CDN is best practice.

## Design

1. **Sources.** Add to `data/sources.lock.json` (the existing `build/fetch_sources` does ranged downloads and checks):
   - `LDSM_80S_80MPP_ADJ.TIF` (slope, pgda.gsfc.nasa.gov)
   - `LPSR_80S_20MPP_ADJ_1km2.SHP` with its `.DBF`, `.SHX`, `.PRJ` (PSR above 1 km²)
   - `NAC_POLE_PSR_SOUTH.ZIP` (large PSR, Mazarico et al. 2011, LROC)
   - `ANTHROPOGENIC_OBJECTS_180.ZIP` (past mission sites, LROC; the doc's QuickMap GeoJSON is a fallback)
   - `A3_9regions-lonlat-simplified.geojson` (Artemis III 2024), `A3_Named_regions.geojson` (2022), `EnduranceTraverse_240129-v2.geojson`
2. **Build** (`make layers`, a new `build/make_layers.py`):
   - Slope and elevation: color-mapped PNG tiles in the region grid, written to `layers/dist/tiles/south_pole/<layer>/{z}/{x}/{y}.png`.
   - Vectors: read, clip to the south pole, simplify, write `layers/dist/overlays/<id>.geojson` in lon/lat (OpenLayers reprojects it).
   - Write a `layers/dist/layers.json` manifest with source URLs, sha256 and attribution for each layer.
3. **Serve.** New hosting site (for example `clps-layers`) via a `targets` entry in `.firebaserc` and a second `hosting` entry in `firebase.json`, public folder `layers/dist`. Headers: `Cache-Control` `public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *`. Deploy: `firebase deploy --only hosting:layers`.
4. **Contract.**
   - New raster layers go in `Region.layers` (`kind: "local"`, full CDN `url_template`, `legend_url` for the color ramp).
   - New additive `Region.overlays` list: `id`, `title`, `kind: "geojson"`, `url`, `attribution`. Style stays with the web owner.
   - Regenerate `contract/openapi.json` and the sample `meta.json`.
5. **Tests.** The lock file validates; builds are deterministic on a small area; `meta.json` validates against the models; every URL listed in `/meta` has a file in `layers/dist`.

## Left to the builder

- Color ramps and legends.
- Number of zoom levels, and whether the finest level needs a smaller resolution than 133.78 m.
- Simplification tolerance for the vectors.
- Which PSR set is the default overlay (both are served as separate overlays).
- Whether `layers/dist` is committed or built in CI.
- The licence and attribution wording for each layer (the spec marks these "verify").
