# Moon Watchers: Lunar Landing Site Navigator

This solution was developed as part of NASA Space Apps Tel Aviv 2026. The event was led by the Space Engineering Center (SEC) and SpaceTAU at Tel Aviv University, in partnership with the Rakia Mission and Space Campus IL.

**Live app: https://clps-514710.web.app**

Moon Watchers helps plan a landing near the Moon's south pole. Pick a landing site, a landing time and a mission length, and it shows when the site has **sunlight** (for power) and **direct line of sight to an Earth station** (for communication). It then turns that into a score, so you can compare sites side by side.

Built by the Menasim to the Moon team for the NASA Space Apps 2026 challenge "Lunar Landing Site Navigator".

## What you can do

- **Orbit:** a 3D Moon showing where the Sun and Earth are for any UTC date and hour, with the landing sites pinned on it.
- **Site Calculator:**
  - a south-pole map (NASA Moon Trek / LOLA terrain, with slope, permanently shadowed region and geology layers) and a horizon "ridge graph" for each site;
  - a card per site with live sunlight and Earth-contact status and a weighted score;
  - **Grading Weights** to set what matters most to you;
  - **Manual Selection** to outline an area on the map and find its best spots.
- **Timelines:** sunlight, Earth contact and terrain-unknown periods for every site on one mission-day axis, with a comparison table.
- **AI guide:** explains any number, button or warning, suggests score weights for your priorities, and helps search an area.
- **Shareable links:** sites, settings and the viewed time all live in the URL, so a link reopens the same view and the browser's Back button undoes changes.

Sites come from a catalog of 30 south-pole sites (Mons Mouton, Mons Malapert, Shackleton rim, Artemis III candidates and more). You can also add custom points anywhere from 84°S to the pole.

## How it works

The skyline around each catalog site (how high the terrain rises in every direction) and the Sun and Earth positions are precomputed into a data bundle. For each request, the Python API compares the Sun and Earth with the skyline to find sunlight, contact and the score. It computes a custom point's skyline on demand. The web app shows the results.

| Data | Source |
|---|---|
| Terrain heights and slope | NASA LOLA polar elevation maps (20 m near catalog sites, 80 m and 240 m farther out) and the PGDA LOLA 20 m slope map |
| Sun, Earth and Moon positions | NASA/JPL SPICE kernels (DE440), every 10 minutes, 2026–2030 |
| Earth stations | NAIF station kernels (DSN, ESTRACK) |
| Shadowed regions, geology, basemap | NASA PSR maps, LROC QuickMap, NASA Moon Trek |

**Limits.** Sunlight and contact are line-of-sight geometry only: no link budget, antenna pointing, relay satellites or station schedules. The score's weights and thresholds are illustrative examples, not validated landing criteria. The lunar dust (regolith) index is simulated. The app labels all of these.

## Repository layout

| Path | What's there |
|---|---|
| `web/` | The web app: React, TypeScript, Vite, OpenLayers |
| `api/` | The FastAPI server ([live API docs](https://clps-api-982577966589.europe-west1.run.app/docs)) |
| `engine/` | Horizon, visibility, metrics and score calculations |
| `build/` | Scripts that fetch source data and build the horizon masks, ephemeris and map layers |
| `catalog/`, `config/` | The site catalog, score settings and warning thresholds |
| `contract/` | The OpenAPI contract and sample responses shared by the API and the web app |
| `tests/` | Python tests (web tests live in `web/`) |

## License

[MIT](LICENSE)
