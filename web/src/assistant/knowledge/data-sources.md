# Data sources and limits

| Data | Source | Used for |
|---|---|---|
| Terrain heights | NASA LOLA polar DEMs: 20 m near catalog sites, 80 m and 240 m farther out (custom points: 80 m + 240 m) | The skyline at every site |
| Height errors | LOLA error rasters | Uncertainty range and warnings |
| Slope | NASA PGDA LOLA product 90, 20 m slope map, read at the pixel containing the site (not smoothed) | Slope chip, S grade, slope gate |
| Shadowed regions | NASA PSR maps | The PSR gate |
| Sun, Earth, Moon orientation | NASA/JPL SPICE kernels (DE440 and lunar/Earth orientation) | Positions every 10 minutes, 2026–2030 |
| Earth stations | NAIF station kernels (DSN, ESTRACK); Houston is a demonstration point | Contact |
| Catalog | 30 sites chosen by the physics team (`catalog/sites.yaml`): massifs (Mons Mouton, Mons Malapert, Mons Kocher), craters and their rims or floors (Amundsen, Cabeus, Nobile, Malapert, Shoemaker, Haworth, Henson, Faustini, Wiechert, Sverdrup, de Gerlache, Slater, Kocher, Burbidge, Shackleton, Whitaker, Cartwright, Haynes, Brill, Stose, Kuhn, Spudis, Ibn Bajja), the Artemis III candidate sites "Connecting Ridge" and "Peak Near Shackleton", and the IM-2 Athena landing (Mons Mouton) and LCROSS Centaur impact (Cabeus) | Catalog sites |
| Basemap | NASA Moon Trek tiles and LOLA hill-shade | The map |
| Lunar regolith (dust) | Simulated index (fixed formula) | D grade only, labeled simulated |

## Limits to state honestly
- Landing dates 2026-01-01 to 2030-12-31; missions 1–365 days; heights 1–10 m.
- Custom points only from 84°S to the pole; the server computes at most about 20 new custom points per minute per user.
- Line of sight only: no link budget, antenna pointing, ground-station schedules, relays or light-time delay.
- Rocks and relief smaller than a terrain cell are not modeled; the slope is a 20 m pixel value, not lander-footprint safety.
- The score's weights and thresholds are illustrative. The ranking badge comes from a stand-in function.
- Not built yet: the Surface screen, export, mission-step timelines, a power/battery model.

Sources: `data/sources.lock.json`, `catalog/sites.yaml`, `deploy/*.lock.json`, design spec §6.
