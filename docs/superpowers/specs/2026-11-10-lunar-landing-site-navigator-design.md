# Lunar Landing Site Navigator: Design Spec

| | |
|---|---|
| Status | Draft for team review. The physics team's review is applied, and so are the decisions in their prototype (`MenasimMoon`, 11–12 Nov), including the new score and the 12 h landing margin from `MenasimMoonV2` (14 Nov). Only P6 and P7 are still placeholders (§12.3). |
| Date | 2026-11-14 |
| Event | NASA Space Apps Challenge 2026, Tel Aviv. Build days: 14–15 Nov 2026 |
| Deadline | 15 Nov 2026, 23:59 local time, in English |
| Challenge | [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) (formerly "CLPS Lunar Mission Browser") |
| Related | The product teammate's Hebrew spec for the 4 screens (PDF); the team overview doc (Claude Doc), which predates several decisions below; the 3D teammate's Moon Watchers orbit kit (§9.3) |

Numbers marked *est.* are first-principles estimates, measured at kickoff (Appendix A). Facts marked *verify* are checked against NASA, NAIF or JPL sources in the data step (Appendix B). Items marked **P1**–**P12** are the physics team's decisions (§12.3). Most now come from their prototype. For the few still open, the interim value given next to the marker is used.

---

## 0. Summary

We are building a web app that shows when a lander near the Moon's south pole has sunlight and a direct radio link to Earth. It works for any catalog site or clicked point, for any landing date from 2026 to 2030, and lets users compare sites and dates in seconds. Its users are mission planners first, then teachers, students and the judges.

Five principles drive every decision:

1. **One physics.**
   - A single Python engine computes every number and every shadow.
   - The physics team defines the rules and formulas. The engine implements them and is tested against the physics team's reference script (§12.3).
   - The browser never does physics. It only compares numbers that the engine prepared.
2. **The engine decides; AI only translates.** AI may turn text into form fields. It never computes, ranks or invents results.
3. **Heavy work once, light work live.**
   - Horizons and shadow grids are computed in advance on our GPU machine.
   - The server answers scenario questions in milliseconds.
   - Big files come from a static CDN.
4. **The URL is the state.** Every screen can be shared, reloaded or undone with Back, exactly.
5. **South pole now, whole Moon later.**
   - Coordinates are lat/lon everywhere.
   - Terrain comes from a registry of DEMs.
   - Each region declares its own map projection.

---

## 1. Context

### 1.1 What the challenge asks for

Condensed from the challenge page:

- **Sites:** curated landing sites (Apollo, CLPS targets, commercial and other nations' sites) plus custom coordinates, compared side by side.
- **Dates:** landing dates and times, and how conditions change across lunar days and seasons.
- **Sky:** Sun and Earth positions relative to the horizon. Consider showing the time remaining before sunset and Earthset.
- **Metrics:** solar elevation, sunlight duration and Earth visibility windows.
- **Views:** 2D maps, 3D surface views or other creative representations; animations and timelines.
- **Audience:** mission planners as well as educators and the public.
- **Physics to account for:** real topography (LOLA), no atmosphere (so no refraction), libration and orbital variations.
- **Understanding:** explain why small changes in location or date have large effects.
- **Speed:** respond quickly when schedules slip, by finding "alternative sites in the same region, or alternative dates at the same site".
- **Existing tools:** NASA QuickMap, Moon Trek and JPL Horizons are powerful but hard to use for quick comparisons.
- **Resources:** the challenge's Resources tab opens on Fri 13 Nov.

### 1.2 Judging criteria and how we address them

| Criterion | What judges look for | Our answer |
|---|---|---|
| **Impact** | How much the solution can really help | <ul><li>It answers the challenge's real use case, a slipping schedule. It finds better dates at the same site (landing calendar, "Next good landing") and better sites nearby (nearby alternatives) in seconds.</li><li>Score weights that users can change, so the same sites rank differently for spacecraft with different needs (P5).</li><li>Export as CSV or as a ready-made JPL Horizons query.</li><li>Shareable links help science and engineering teams coordinate.</li><li>Open source, and extendable to the whole Moon.</li><li>We measure the time saved against existing tools (§11.5).</li></ul> |
| **Creativity** | An original idea and a new approach | <ul><li>Shadows are drawn from the same engine data as the numbers ("one physics").</li><li>A landing-calendar heat map.</li><li>"What blocks the Sun" explanations, based on the blocking distance.</li><li>Uncertainty ranges.</li><li>An AI command bar that can set up the whole screen.</li></ul> |
| **Validity** | Scientific and technical correctness | <ul><li>NASA SPICE and LOLA data, exact curvature, no atmosphere, with libration and orbital variations included.</li><li>Known-answer tests.</li><li>Automated comparison with JPL Horizons and NASA's map of permanently shadowed regions (PSRs).</li><li>Side-by-side comparisons with QuickMap TerrainShadows.</li><li>Basic checks against GMAT.</li><li>A "How we know it's right" page, which also explains how the calculations work.</li><li>Honest labels and ranges. Simulated data (the dust layer) is labeled as simulated.</li></ul> |
| **Relevance** | Answers the chosen challenge | Every objective on the challenge page maps to a feature (§1.3) |
| **Presentation** | A clear, convincing pitch | <ul><li>A 30-second demo built on the slipped-launch story.</li><li>Example scenarios one click from the start screen.</li><li>A consistent dark UI that runs at a smooth 60 FPS.</li><li>A README with screenshots.</li><li>Slides mapped to the criteria (§14).</li></ul> |

### 1.3 Challenge objectives → features

| The challenge asks for | Our feature | Priority |
|---|---|---|
| Curated sites and custom coordinates | Catalog of south-polar sites (CLPS targets, Artemis III candidate regions, other nations' polar targets); lat/lon entry; click on the map (84–90°S). Apollo and other non-polar sites are out of scope for now (§15.1). | Must |
| Side-by-side comparison | Up to 3 cards, a split map, the Screen 4 timeline | Must |
| Dates, lunar days, seasons | Per-card dates and offsets, "+1 Lunar Day", a landing calendar for 2026–2030 | Must / Should |
| Sun and Earth relative to the horizon | A sky view on every card; live shadows on the map; a 3D surface view | Must / Must / Should |
| Time left before sunset or Earthset | Live countdowns on every card | Must |
| Solar elevation, sunlight duration, Earth visibility windows | A live panel (elevation and clearance), mission metrics, Gantt rows | Must |
| 2D, 3D and creative views | Polar map with a topographic layer, sky view, timeline, calendar, 3D view, globe | Must → Should |
| Animations and timelines | Time slider with Play; Gantt chart | Must |
| Planners and the public | Progressive disclosure (simple first, detail on demand); explanations | Must / Should |
| Real topography, no atmosphere, libration, orbital variations | The engine (§7) | Must |
| Why small changes matter | "Explain" comparisons; a score map of the area around a site | Should |
| Fast response to schedule changes | The slipped-launch flow, "Next good landing", nearby alternatives | Must / Should |

### 1.4 Rules and submission

- **Before kickoff (14 Nov):** no project code and no prototypes.
  - Design work, reading and learning the data are allowed.
  - The official FAQ says teams may not begin working on challenges before the hackathon.
  - Downloading and exploring NASA data before kickoff is allowed: NASA data is public, and only development has to wait for the event ([Space Apps discussion #1925](https://github.com/nasa/spaceapps/discussions/1925)).
- **Submission:** due 15 Nov 23:59, in English, in six parts:
  - a summary
  - a demo: 7 slides or a 30-second video
  - a public link
  - project details
  - a Data and AI disclosure
  - references
- **NASA data** is required for global judging.
- **AI tools** are allowed but must be disclosed.

### 1.5 Success criteria (checked before submission)

- Every Must feature works at the public link. The demo also works with the API off, using the snapshot (§10.3).
- Sun and Earth azimuth and elevation match JPL Horizons within 0.01°. That is the target; if there is a frame difference, it is documented.
- Sampled points inside NASA's PSRs are never lit during 2026–2030.
- The time slider and Play run at 60 FPS on a laptop. Changing a setting updates the numbers in under 0.5 s.
- A shared link reproduces the same screen.

---

## 2. Scope

| Priority | Features |
|---|---|
| **Must** | <ul><li>**Screen 2:**<ul><li>A South Pole map: NASA layers when zoomed out, live shadows near catalog sites when zoomed in.</li><li>Up to 3 mission cards. A site can come from the catalog, from typed lat/lon, or from a click on the map.</li><li>Each card has: a panel height and an antenna height, each 1–10 m (defaults 2 m and 3 m; **P10**); a landing date plus a per-card offset; a mission length of 1–365 days (default: 30 days; **P4**); "+1 Lunar Day"; red, amber or green chips for Sun, Earth contact and slope; a live panel with solar elevation, clearance and countdowns; a sky view.</li><li>A split map and "Compare Timelines".</li></ul></li><li>**Screen 4:** Gantt rows for Sun, Earth contact and both; the score with its breakdown; CSV and Horizons export.</li><li>**Score settings panel** (top bar): the 7 weights with presets, and every other number the score uses, each user-changeable (§7.5, §9.3).</li><li>**Warnings strip** on every card, comparison column and ranked point: every data and score warning is shown in plain words, never only in a tooltip (§7.8).</li><li>Custom points with numbers, inside 84–90°S.</li><li>Shareable URLs.</li><li>A minimal "How we know it's right" page.</li><li>The demo snapshot.</li><li>An open-source license and a README.</li></ul> |
| **Should** | <ul><li>**Site finder** on Screen 2: enter the mission and spacecraft parameters (everything except a site) and get suggested sites and landing dates (§7.6). How it looks is decided at implementation.</li><li>An elevation-over-time graph on each mission card: the Sun, the Earth and the terrain in their direction across the mission (§9.3).</li><li>Screen 3 surface view: 3D, time-lapse shadows and gauges.</li><li>Landing calendar, with "Next good landing".</li><li>Nearby alternatives: the user draws an area (a polygon) around a site and gets a score for each point inside it, with the best points ranked (**P11**).</li><li>"Explain": insights built from templates, including comparisons.</li><li>Uncertainty ranges.</li><li>Example scenarios on the start screen.</li><li>The full validation page: Horizons, PSR, QuickMap side by side, GMAT, and how the calculations work.</li><li>Shadows for custom points, only when a GPU server is available.</li><li>A topographic layer on the map (elevation colors).</li><li>Choosing a different Earth station for contact: typed coordinates, or a preset (§7.3).</li><li>The Screen 1 globe with recommended sites.</li></ul> |
| **Could** | <ul><li>A power model: panels always facing the Sun, plus a battery.</li><li>The "Ask the Navigator" command bar, which also covers plain-English search.</li><li>Checking the Sun's elevation at historical Apollo landings.</li></ul> |
| **Nice** | <ul><li>Requirements read from a pasted document or a PDF.</li><li>A mission brief.</li><li>A dust map layer, drawn from the simulated (mock) dust index and labeled "simulated" everywhere. The index itself is part of the score, so it is built with the score (§7.5).</li></ul> |
| **Out** | <ul><li>Non-polar sites, such as Apollo (the architecture can add regions later).</li><li>Relay satellites: Earth contact means direct to Earth only.</li><li>Fixed (non-tracking) panels.</li><li>Accounts and a database.</li><li>Searching the terrain for new sites.</li><li>A guided tour.</li><li>Voice input.</li><li>A backup server.</li><li>A browser GPU shader for shadows (kept as a future upgrade path).</li></ul> |

**Changes from the product spec, to confirm with the product teammate:**
- **Dates:** extended to 2026–2030, with data running to the end of 2031.
- **Default date:** replaced by the example scenarios.
- **Panels:** the Fixed/Tracking toggle is removed. Panels always face the Sun, and power moves down to Could.
- **Card chips:** the red/amber/green chips judge the whole mission. The live status is shown separately (§7.4).
- **Timeline:** aligned by mission elapsed time (§9.2).
- **New features:** the sky view, the elevation-over-time graph, countdowns, the site finder, the landing calendar and alternatives.

---

## 3. Users and flows

**Users:**
- **Mission planners (primary):** need exact numbers, comparisons and exports.
- **Educators and the public:** need the simple view and explanations.
- **Judges:** watch a short demo, or open the link with no guidance.

**The unit of everything is a scenario.** A scenario is a site (catalog or custom), a landing time, a mission length, a panel height and an antenna height. If the Could power feature is built, it also includes power settings. The **spacecraft settings** (the Earth station and the score settings) are shared by all cards, because the cards compare sites for the same spacecraft.

| Flow | What the user does |
|---|---|
| **F1. Compare two sites** | The app opens on Screen 2. The user picks two sites, gets two cards and a split map, then presses "Compare Timelines" to go to Screen 4. |
| **F2. The launch slips (the demo story)** | "Our launch slipped by a month. Is the site still good?" The user presses "+1 Lunar Day", or shifts a card's offset so the same site appears twice, and compares. The landing calendar shows the next green day, and "Next good landing" opens a card there (Should). |
| **F3. Custom point** | The user clicks inside the dashed circle (84–90°S). The numbers appear in about 1–2 s (*est.*), and the shadows a few seconds later if a GPU is available. |
| **F4. Surface view (Should)** | The user stands at the site and watches the shadows sweep, with the Sun and Earth on the skyline. |
| **F5. Find alternatives (Should)** | The user draws an area around the site and gets a score for each point in it on the same date, as a score map; better dates at the same site come from the calendar. |
| **F6. Ask in plain English (Could)** | "Compare Shackleton rim and Ridge B in March 2027 with an 8 m antenna" sets up the screen; a request phrased as a search runs a search. |

**Demo script draft** (30 s; the product teammate owns it, and the real values come from the data):
1. Open the example "Launch slips by a month". The card for a rim site shows its verdict and sky view.
2. Press "+1 Lunar Day". A second card appears, and its sky view shows the Earth dipping behind the rim.
3. Press "Compare Timelines" to show the Gantt chart and the scores.
4. Open the landing calendar and click the next green day to get "Next good landing" and its score.

---

## 4. Key concepts (full glossary in §17)

- **Horizon mask:** the skyline of one point in 720 directions, 0.5° apart. The Sun is checked against the mask at panel height, Earth contact against the mask at antenna height. Masks produce all the numbers.
- **Horizon grid:** the skylines of 40,000 ground points (200 × 200 points, 30 m apart, covering 6 × 6 km) in 120 directions, 3° apart. It is used to draw shadows.
- **Why the two differ:** the Sun's disk is about 0.5° wide, so the numbers need 0.5° steps at the lander. The shadow map is a picture, and 3° is enough for it. 720 directions on all 40,000 points would make the browser's grid file 6 times bigger (about 58 MB instead of 9.6 MB per site).
- **Site frame ("the site's compass"):** east, north and up at the site. Grids, heightmaps and sky positions are all expressed in it. That lets the browser compare one Sun direction against every grid point without doing any geometry.
- **`vis_el`:** for each body at each step, the elevation that must clear the terrain for the body to count as visible. The visibility rule is encoded in this number (§7.3).
- **Window:** a stretch of time when something is true: Sun visible, Earth contact, or both.
- **Verdict vs. live status:** the red/amber/green chips judge the whole mission. The live panel shows the moment being viewed: elevation, clearance and countdowns.
- **Weights:** how much each grade (sunlight, Earth contact, longest darkness, longest outage, sunlight at landing, slope, dust) counts in the score. The default set is the physics team's (§7.5); users can change it. Weights change the score and its color, never the chips.
- **Unknown time:** time when the data can't say whether a body is visible, for example because a skyline ray crosses missing terrain. It is never counted as darkness or as no contact (§7.3).
- **Mission elapsed time (MET):** the time since a scenario's landing. Cards are synchronized by MET (§9.2).
- **Lunar day:** 29.53 days (one synodic month), from sunrise to sunrise.

---

## 5. Architecture

```
 BUILD - once, on the RTX 4060 PC (Mac as backup)               RUNTIME
 ┌────────────────────────────┐     ┌──────────────────────────────┐
 │ NAIF SPICE · LOLA DEMs     │     │ Data build (Python engine)   │
 │ NASA map layers · GMAT     ├────►│ + validation gate            │
 │ catalog (physics team)     │     └──────┬─────────────┬─────────┘
 └────────────────────────────┘            │ server part │ static part
                                           ▼             ▼
                          ┌─────────────────────┐   ┌───────────────────────────┐
                          │ API (FastAPI)       │   │ Static host / CDN         │
                          │ engine inside       │   │ app · tiles · grids ·     │
                          │ scenarios · search ·│   │ heightmaps · snapshot ·   │
                          │ custom points       │   │ config.json               │
                          └─────────▲───────────┘   └─────────────▲─────────────┘
                                    │ questions / answers         │ files
                                    └─────────┐     ┌─────────────┘
                                         ┌────┴─────┴─────┐
                                         │ Web app (React)│
                                         │ in the browser │
                                         └────────────────┘
 Claude API (command bar, Could): text → form fields; called only by the API
```

### 5.1 Components

1. **Engine:** a Python library, and the only place where physics lives.
   - Modules:
     - `geometry`: ephemeris and sky positions
     - `terrain`: the DEM registry and DEM reads
     - `horizons`: the PyTorch ray-march
     - `visibility`: the rules, as the physics team defines them (§7.3)
     - `metrics`, `score`, `search`, `alternatives`, `insights`
     - `power` (Could)
   - It is made of pure functions: arrays in, arrays out.
   - Scenario math uses NumPy. Only horizons use PyTorch.
2. **Data build:** one command that is safe to rerun.
   - Steps:
     1. Verify the sources against the lockfile.
     2. Build the ephemeris table.
     3. Compute the products for each catalog site.
     4. Render the map tiles.
     5. Run the validation suite.
     6. Write a versioned **bundle**.
   - If the geometry or PSR validation fails, it refuses to write a bundle.
3. **API:** FastAPI with Pydantic.
   - At startup it loads the bundle and validates the manifest and the algorithm version.
   - It serves scenario answers (cacheable GETs), custom points (with a disk cache), search, insights and AI parsing (Could).
   - It is stateless, apart from a cache it can always rebuild.
4. **Static host / CDN:** the app, map tiles, grids, heightmaps, validation assets, the demo snapshot and `config.json`.
5. **Web app:** a React single-page app with no physics (§9).

**External services:**
- NAIF and PGDA, at build time only.
- The Claude API, only for the command bar (Could) and requirements from a document (Nice).

### 5.2 Data flows

- **Catalog scenario:**
  - The card asks the API for a summary (numbers, verdict, windows) and for the month's series.
  - The slider reads the series locally.
  - Shadows come from the grid file on the CDN.
- **Custom point:** `POST /sites/custom`, and from then on it is used exactly like a catalog site.
- **Landing calendar:** one API call per site, per settings and per year returns 365 daily scores.
- **Nearby alternatives:** one API call with the area the user drew returns a score for each point in it and the ranked points. Each point gets an exact mask, computed on demand. Opening a point creates a custom point.
- **Command bar (Could):**
  - The API asks Claude to fill in a form.
  - The app applies the result as a new URL.
  - The deterministic endpoints then run as usual.

### 5.3 Hosting modes

| Mode | When | What changes |
|---|---|---|
| **Event mode** | While a GPU server is available at the event | Everything works, including shadows for new custom points |
| **Judging mode** | On a free CPU host during the weeks of judging | Everything except shadows for *new* custom points. Nearby alternatives are capped to a small number of points (set at kickoff from measured CPU speed), because each point needs its own mask. The demo's custom points and its alternatives area are computed in advance into the bundle. |

The mode is a setting. The API reports it in `/meta.capabilities`, and the UI follows.

---

## 6. Data

### 6.1 Sources

| Data | Source | Use | Status |
|---|---|---|---|
| SPICE kernels: `naif0012.tls`, `pck00011.tpc`, `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` | NAIF (NASA/JPL) | Sun and Earth positions; the Moon's orientation (the DE440 set, matching the physics team's prototype) | Downloaded and checksummed 14 Nov (`docs/spikes/sources-verified.md`) |
| SPICE kernel for the Earth's orientation: `earth_1962_260806_2126_combined.bpc` | NAIF | Where the chosen Earth station is, and whether it sees the Moon (Earth contact, §7.3). Observed until 2026-08-06, predicted after | Downloaded 14 Nov |
| LOLA DEMs, PGDA product 90: 20 m and 80 m (80°S to the pole), 240 m (60°S to the pole), each with its `_ERR` height-error raster; 80 m measurement counts (`LDEC`) and effective resolution (`EFFRES`) | NASA PGDA | Terrain for horizons, grids, heightmaps and slope (finest available first); height errors for the uncertainty range; counts and effective resolution for data warnings | Files and sizes verified 14 Nov; checksums pinned on first download |
| LOLA slope map, PGDA product 90: `LDSM_80S_20MPP_ADJ` (20 m, 80°S to the pole) and its `_ERR` raster | NASA PGDA | The slope of every point (§7.2), and its error as context | Added with the physics team's V3 (15 Nov); size and checksums pinned on first download |
| NASA layers: average illumination, PSR | LOLA products (PGDA/PDS) | Map colors when zoomed out; PSR validation | To find |
| Moon Trek basemap tiles | NASA Moon Trek, tile service (WMTS) for the south pole: color hillshade, hillshade and slope, up to 5 m per pixel for some sites (§9.3) | Zoomed-out basemap on Screen 2, loaded by the browser. Our own build tiles are the fallback when Moon Trek is slow or offline | Tile request and layer list worked on 13 Nov. Licence of each layer *verify* |
| Moon Trek elevation service | NASA Moon Trek, ArcGIS ImageServer for the 5 m south-pole LOLA DEM (`identify` and `getSamples`) | Validation only: our local DEM against NASA's own service at 20–50 points (§11.4). Never used at runtime, never for horizon masks (about 200 points per call, so thousands of calls per site) | Worked on 13 Nov. Height reference *verify* |
| Topographic layer | Rendered by the build from the LOLA DEMs above | Elevation colors on the map, and on the globe if it's built | From the DEMs |
| Globe assets (Screen 1, Should) | Prepared at kickoff from public sources, as in the 3D teammate's test: LOLA LDEM_16 and 240 m polar DEMs; an LROC-WAC-based color map (CC BY-SA 4.0, via Stellarium); NASA Blue Marble | Visual context only | §9.3 |
| Dust | Simulated (mock) index from the physics team: a fixed formula (§7.5), no data file | Dust grade in the score (weight 0 by default, users can raise it); the dust map layer (Nice) | Labeled "simulated" everywhere. LADEE/LDEX orbital dust data is not a surface map, so it isn't used. The physics team's V3 adds a source matrix (`output/surface_source_matrix.csv`) that keeps four kinds of data apart: measured regolith records from landing missions, rock abundance, PSR references, and this synthetic dust score. Only the last one is in the score. |
| JPL Horizons answers | JPL Horizons API (`ssd.jpl.nasa.gov/api/horizons.api`) | Validation only: Sun and Earth azimuth and elevation at test sites, fetched once and saved under `data/sources/horizons/` with checksums. Never called at runtime (§11.4) | Request recipe checked by hand on 13 Nov; see §11.4 |
| GMAT checks | Physics team | Validation only: basic checks of the Sun and Earth positions | §12.3 |
| Catalog | Physics team (`catalog/sites.yaml`), with a source link per site | Site list (south-polar, inside the 20 m DEM coverage) | To build |

### 6.2 Regions and the DEM registry

- **A region** declares its map projection (`crs`), extent, tile grid, layers (with legends), DEM ids and custom-point area.
- **Today there is one region, `south_pole`.**
  - Projection: polar stereographic on a 1,737.4 km sphere. *verify* this against the DEM's own CRS.
  - It has map tiles.
  - Custom points are allowed from 84°S to 90°S.
- **More regions later:** adding a region is new data, not new code.
- **A DEM registry entry** has these fields:
  - `id`
  - `uri`: a local path or a URL; the same reader handles both
  - `crs`, `resolution_m`, `coverage`
  - `height_reference`: a sphere of R = 1,737,400 m (*verify*)
  - `nodata`, `source_url`, `sha256`
- **DEM choice:** the engine uses the finest DEM that covers each sample.

### 6.3 Bundle layout and formats

```
data/sources/                        build inputs - never deployed, not in git
  spice/ dem/ layers/ gmat/          git holds sources.lock.json (URL + sha256 per file)
bundle/<bundle_id>/                  build output - read-only, versioned
  manifest.json                      inputs + checksums, versions, parameters, validation summary
  server/                            → shipped with the API (archive on a GitHub Release)
    ephemeris.npy                    Sun + Earth vectors from the Moon's center, MOON_ME, hourly
                                     2026-01-01 … 2031-12-31: Sun and Earth with CN+S, Earth geometric
    earth_rotation.npy               Earth-fixed (ITRF93) → MOON_ME rotation, hourly, same times
    sites.json  regions.json         catalog; regions + DEM registry
    sites/<id>/masks.npy             [3 × 11 × 720] float32 °: nominal, low, high (height-error bounds)
                                     × 10 heights (1–10 m) + far-only; NaN = unknown direction
    sites/<id>/blocking.npy          [11 × 720] float32 km: distance to the blocking terrain
    terrain/                         shared 240 m and 80 m terrain (+ the 20 m copy if on the server's disk),
                                     each with its _ERR height-error raster
  static/                            → uploaded to the CDN
    sites/<id>/grid.npy.gz           [200 × 200 × 120] int16, units of 0.01°, site frame
    sites/<id>/heightmap.npy.gz      [200 × 200] float32 m, site frame, curvature included
    tiles/south_pole/<layer>/{z}/{x}/{y}.png
    validation/                      data and images for "How we know it's right"
$CACHE_DIR/<algo_version>/<cust_id>/ custom points at runtime, same layout as sites/<id>/
```

| Data | Read by | Format | Size (*est.*) |
|---|---|---|---|
| Descriptions (sites, regions, manifest) | API → browser as JSON | JSON, validated by Pydantic | KB |
| Ephemeris table | API only | NPY float64, memory-mapped. Times are implicit: start + i × 1 h | ~3.8 MB (52.6k rows × 9) |
| Earth rotation table | API only | NPY float64, hourly (52.6k × 3 × 3) | ~3.8 MB |
| Masks + blocking distances | API | NPY float32 | ~130 KB per site |
| Horizon grid | Browser | NPY int16 in units of 0.01°, gzipped, decompressed with `DecompressionStream` | 9.6 MB raw; 3–5 MB gzipped per site |
| Heightmap | Browser | NPY float32, gzipped | 160 KB raw per site |
| Map tiles | Browser | PNG in the region's projection, at most 120 m per pixel | 10–20 MB and about 500 files per layer |
| Far-field terrain (240 m, 60°S to the pole) | API | COG | ~220 MB |
| 80 m terrain (80°S to the pole), fills gaps in the 20 m copy | API | COG | ~190 MB |
| 20 m copy for custom points (to ~83°S) | API | COG, on the server's disk or in object storage | 0.5–1 GB |
| Slope map and its error raster (20 m, 80°S to the pole), cropped to the clickable area | API | COG | Size to check at the first download |
| Height errors (`_ERR`) of the three terrain copies above | API | COG, cropped and stored like the terrain it belongs to | ~270 MB (240 m), ~255 MB (80 m), 0.7–1.5 GB (20 m copy, *est.*) |

**Formats:**
- **NPY** is NumPy's array file: a small header followed by raw numbers. Python writes it in one call, and the browser reads it with a parser of about 30 lines.
- **COG** (Cloud-Optimized GeoTIFF) is a tiled raster with an index. It can be read one small window at a time without loading the whole file.

### 6.4 Versions and cache safety

- **Version markers:**
  - `bundle_id`: the date plus a hash of the manifest.
  - `HORIZON_ALGO_VERSION`: an engine constant, raised whenever anything changes that affects precomputed products.
  - The engine's git SHA.
- **Startup checks.** The API refuses to start if:
  - the bundle's algorithm version differs from its own (so custom points computed live and catalog sites computed offline can never use different physics);
  - the manifest is invalid;
  - a catalog site is missing a file.
- **Cache keys:** every request URL carries `v=<bundle_id>.<engine_sha>`. A data rebuild or a code fix therefore invalidates every cached answer. Presets and thresholds are in git, so the SHA covers them too.
- **CDN:** keeps the current bundle and the previous one, so pages that are already open survive a redeploy.

### 6.5 Custom-point cache

- **Layout:** the same as a catalog site, keyed by algorithm version.
- **Ids:** canonical ids of the form `cust_<lat>_<lon>`, with 5 decimals and longitude in [0, 360), for example `cust_-89.45000_222.69000`. Ids are parsed and rewritten before they touch the disk.
- **Recomputable:** every entry can be rebuilt from its id. A `GET` for a custom id that is missing recomputes it, so shared links survive restarts.
- **Writes:** go to a temp folder that is then renamed. One lock per id.
- **Eviction:** least recently used entries go first once the size cap is reached.

### 6.6 Terrain for custom points (NASA servers only at build time)

- **Clickable area:** 84°S to 90°S, shown as a dashed circle on the map. NASA places its Artemis III candidate regions within 6° of the pole (*verify*).
- **The 20 m copy reaches about 83°S.** The margin is the near window, so even a point at the edge has detailed terrain all around it.
- **The 240 m copy reaches 60°S,** which covers 200 km rays (the longest reach, §7.2) from any clickable point. It is loaded into memory at startup, with the 80 m copy (80°S to the pole) that fills gaps in the 20 m data.
- **The slope map** is the published LOLA slope raster (`LDSM_80S_20MPP_ADJ`, 20 m per pixel, 80°S to the pole) with its error raster (`LDSM_80S_20MPP_ADJ_ERR`), cropped and stored like the DEMs. It is read for slope only (§7.2).
- **Each copy comes with its height-error raster** (`_ERR`), cropped and stored the same way, so a custom point gets the low and high skylines (§7.3) like a catalog site. Without it the range is unavailable (`UNCERTAINTY_UNAVAILABLE`). The errors double what the server holds: the 240 m and 80 m copies with their errors take about 950 MB as float32 in memory.
- **Format:** both copies are COGs. The area is a setting, announced in `/meta`.

### 6.7 Reproducibility and credits

- `make fetch` downloads every source and verifies it against `sources.lock.json`.
- The manifest lists every dataset with its URL and version. It produces the submission's References and the data half of the Data and AI disclosure.

---

## 7. Engine

### 7.1 Ephemeris and sky geometry

- **Kernels:** listed in §6.1.
- **Frame:** `MOON_ME_DE440_ME421` (MOON_ME as defined by the DE440 frame kernel), as in the physics team's prototype. LOLA's DEMs use `MOON_ME_DE421`; the two are aligned to well under a meter, and the residual is recorded in the manifest. `IAU_MOON` is never used. Using the principal-axis frame by mistake would rotate the sky against the terrain by about 0.03°.
- **Light-time and aberration (the physics team's choice):**
  - **Sunlight**, and the Earth as a body that can block the Sun: **CN+S** (converged light time plus stellar aberration), the frame evaluated at reception. The prototype computes it per observer with SPICE `spkcpo`. The table stores CN+S vectors from the Moon's center, and the site's position is subtracted. The difference from the per-observer result is far below 1″; the comparison with the reference script (§11.1) checks it.
  - **Earth contact and Earth visibility:** geometric (no correction), with the instantaneous station position.
- **Table:**
  - Sun and Earth position vectors from the Moon's center, hourly, from 2026-01-01 to 2031-12-31: the Sun and the Earth with CN+S, and the Earth again without correction.
  - The rotation from the Earth-fixed frame (ITRF93) to MOON_ME at the same times, for placing the Earth station (§7.3).
  - Times are UTC, converted with the leap-second kernel.
  - The extra year beyond 2030 lets a 365-day mission that lands in late 2030 still fit.
  - Cubic interpolation gives any time, with an error far below 1″.
- **Parallax:** the site's position is subtracted before computing directions. For the Earth this matters (up to 0.26°, half the Sun's width); for the Sun it is 2″.
- **Rotation into the site frame (east, north, up):**
  - Azimuth runs clockwise from north. Elevation is measured from the site's tangent plane.
  - Apparent radii come from distance: about 0.27° for the Sun and 0.9–1.0° for the Earth.
- **At the pole itself,** "north" is defined as the direction of longitude 0°.
- **Libration and orbital variations** are included automatically through the lunar orientation kernel and DE440. The sky view and the explanations make them visible (§7.7, §9.3).
- **Earth station:** its position is computed at request time from its latitude, longitude and altitude on the Earth's reference ellipsoid (SPICE `georec`), rotated with the table's Earth rotation. Any station therefore works without a rebuild. The Earth's orientation after 2026-08-06 is a prediction, so results past that date carry a warning (§7.3).

### 7.2 Horizons, masks and grids

- **Ray-march.** For each observer and direction:
  1. Step outward along the great circle, using 3D vectors so there are no pole special cases.
  2. Read heights from the finest DEM that has a value at each step (20 m, then 80 m, then 240 m), blending the 4 nearest cells.
  3. Compute the elevation angle with exact curvature.
  4. Keep the maximum, and record its distance (the blocking distance).
  5. The skyline never drops below the observer's own tangent-plane floor, `−acos((R + h_ground) / (R + h_ground + height))`, so the ground right next to the lander is never skipped.
- **32-bit formula without cancellation:**

  ```
  el = atan2(Δh − (R + h_t)·2·sin²(θ/2), (R + h_t)·sin θ),   θ = s / R,   Δh = h_t − h_o
  ```

  - GPUs need 32-bit numbers: Apple GPUs have no 64-bit support, and the RTX 4060 runs 64-bit at 1/64 speed.
  - The textbook form subtracts two radii of about 1.7 × 10⁶ m and loses about 0.2 m, which is 0.01° at 1 km.
  - This form only handles small numbers and is accurate to the millimeter.
  - Positions are relative to the site.
- **How far (the physics team's settings, V3):** the reach is **computed for each point** from its terrain altitude `h` above the 1,737.4 km reference sphere: `min(200 km, √(2·R·|h|) + 10 km)`. A feature at that height hides behind the curve beyond √(2R|h|); the 10 km is a margin. Equipment height is not part of `h`. A point at the sphere's level traces 10 km, one 3 km up about 112 km, and anything above about 15 km up the 200 km cap.
  - **No truncation check.** The terrain ceiling and the `HORIZON_TRUNCATED` warning were removed: terrain beyond the reach is simply not traced.
- **How fine (the physics team's settings):**
  - Near window: 40 m steps out to 10 km, read from the 20 m DEM where it has data, otherwise the 80 m DEM.
  - Beyond 10 km: 240 m steps out to the point's reach. A reach under 10 km stops the near steps at the reach.
  - The convergence test stays as a check: widening the near window, or shrinking the steps, must change `sun_pct` and `dte_pct` by less than 0.5 percentage points.
- **Missing terrain:** a direction whose ray crosses a missing DEM cell is **unknown** (NaN), with a `DEM_GAPS` warning. It is never treated as open sky or as blocked (§7.3).
- **Masks (for the numbers):** 720 directions, 0.5° apart.
  - All 10 heights (1–10 m) are computed in one pass (only the observer's height changes). The panel and the antenna each pick their row.
  - Plus a **far-only** mask, using only terrain outside the 6 × 6 km patch. It draws the 3D skyline ring without duplicating nearby ridges.
  - Plus the blocking distances.
  - Plus **low and high** masks for the uncertainty range (§7.3), from the DEM's height-error raster.
  - About 1–2 million lookups: under 1 s even on a weak CPU (*est.*).
  - **Why catalog masks are still built ahead:** search and the globe's recommended sites read all ~30 catalog masks in one request. Computing them on demand would make that first request wait 30–60 s on a weak server (1–2 s per point, including the terrain reads). The build runs anyway for the grids, and the server then needs PyTorch only for clicked points.
- **Grids (for the shadows):** 40,000 ground-level points in 120 directions.
  - Each point's horizon is written in the site frame:
    1. Before marching, turn the site's direction into the point's local azimuth (up to ±11° different near the pole).
    2. After marching, correct for the tilt of the point's "up" (up to 0.14°).
  - A running maximum in distance blocks, plus batches of points, keeps memory within the 4060's 8 GB.
  - About 5–15 billion lookups: **seconds** on the 4060, minutes on a CPU (*est.*).
  - Optional speed-up: compute the far terrain for every 5th point and interpolate.
- **Heightmap and slope:**
  - The heightmap is the 20 m DEM resampled onto the same 200 × 200 points, in the site frame, with the curvature drop included (−2.6 m at 3 km).
  - **Slope (the physics team's method, V3):** read from NASA's published LOLA slope raster (PGDA product 90, 20 m per pixel) at the native pixel that contains the point. Nothing is smoothed or blended with neighboring pixels, and there is **no fallback that fits a plane to the DEM**: a point with no valid value (outside the map, nodata, or outside 0–90°) has an **unavailable slope**. The error raster is stored as context (`slope_error_deg`); the gate uses the nominal slope. The slope is labeled "20 m pixel": it is not lander-footprint safety, and the data can't see rocks smaller than a pixel. Elevations still drive the horizons.
- **Device:** PyTorch picks `cuda`, then `mps`, then `cpu` at startup (`ENGINE_DEVICE=auto`). It is imported only when horizons are needed.
- **Custom points:**
  1. Validate the point and build its canonical id.
  2. Check the cache, then lock the id.
  3. Read a 20 m window and its height-error window from our copy (the 80 m and 240 m terrain and their errors are already in memory).
  4. Compute the masks and heightmap, and read the slope from the slope map (~1–2 s on a CPU, *est.*).
  5. Compute the grid, only on a GPU and one at a time.
  6. Write the result atomically.

  `grid_status` is one of:
  - `ready`
  - `pending`: the numbers come first and the shadows follow
  - `unavailable`: no GPU

### 7.3 Visibility rules

The physics team defines these rules (**P2**, **P3**). They come from their prototype. Each rule is one function in the engine, so a later change touches nothing else.

- **Three states, not two.** At every step each channel is visible, blocked or **unknown**. Unknown comes from missing terrain (a skyline direction is NaN, §7.2) or a missing height error. Unknown time is never counted as darkness or as no contact (§7.4).
- **Sun disk fraction `f`:** the share of the Sun's disk above the terrain, with the skyline at **panel height**.
  - The disk is cut into 128 vertical strips (a small-angle sky plane). Each strip is compared with the skyline **at its own azimuth**, so a skyline that changes within the disk is handled.
  - **Earth eclipses:** the part of the Sun covered by the Earth's disk is subtracted. Earth's atmosphere and limb darkening are not modeled.
  - Directions are CN+S, seen from the panel (§7.1).
- **Sun visible:** f > 0, meaning some part of the Sun clears the terrain. This drives the Sun windows, `sun_pct`, the chips and the shadows.
- **Earth contact** (with one chosen Earth station; the physics team's rule). Both conditions must hold:
  1. **Lunar terrain:** the direction from the antenna to the **station** (a point on the Earth, not the whole disk) is above the skyline at antenna height, at that azimuth.
  2. **Earth side:** the station sees the antenna above its own minimum elevation (its mask).
  - Geometry is instantaneous (no light-time correction, §7.1).
  - **The station** is a point given by latitude, longitude, altitude and minimum elevation. **Default: Houston** (29.7604° N, 95.3698° W, altitude 0 m, minimum elevation 0°). Houston is a city reference chosen for the demonstration, not an operational antenna, and the UI says so.
  - Picking another station (typed coordinates, or a preset) is a Should. The presets are the NASA DSN complexes and the ESA ESTRACK stations, as the physics team's V3 lists them from the NAIF station kernels; ISRO and JAXA stations are not offered until their position kernels are configured. These are geometric positions only: no schedules and no link budget.
  - Contact is line-of-sight only: no scheduling, antenna pointing, link budget or relay (§2).
- **Earth visibility** (reported, not used for contact or the score):
  - `earth_any`: some part of the Earth's disk clears the skyline at antenna height.
  - `earth_whole`: the whole disk clears it.
  - Neither one means the chosen station can see the lander.
- **`vis_el`:** the elevation that must clear the terrain, carried per step in the series, so the browser's shadow overlay compares numbers without doing physics.
  - Sun: `el + radius` (the Sun's top edge).
  - Earth contact: the elevation of the direction to the station. While the station can't see the Moon above its mask, `earth_vis_el` is +90°, so no point counts as in contact. The series' `earth_station_up` flag says why.
- **Data warnings (P8; the physics team's list).** Each result lists the ones that apply:

  | Code | When |
  |---|---|
  | `DEM_GAPS` | Some skyline directions are unknown (a ray crossed missing terrain) |
  | `UNCERTAINTY_UNAVAILABLE` | The height-error raster doesn't cover the whole skyline |
  | `SPARSE_MEASUREMENTS` | The LOLA count layer shows fewer than one measurement per pixel at the site |
  | `EFFECTIVE_RESOLUTION` | The data's effective resolution at the site is coarser than the 20 m slope map |
  | `SLOPE_UNAVAILABLE` | The slope map has no valid value at the site, so the score is unavailable (§7.5) |
  | `EARTH_ORIENTATION_PREDICTED` | The mission runs past 2026-08-06, so the Earth's orientation is predicted, not observed |

  The score adds two more, with the same treatment (§7.5):

  | Code | When |
  |---|---|
  | `NULL_GRADE:<grade>` | A grade with a weight above 0 could not be computed and counts as 0 |
  | `PSR_UNKNOWN` | The PSR map has no value at the site, so the PSR gate wasn't applied |

  Three notes are true of every result. They are not repeated on every card. They are shown on the validation page, in the export, and behind the "Always true" link in the warnings strip (§7.8):
  - `DEM_RESOLUTION`: rocks and relief smaller than a cell are not modeled.
  - `GEOMETRIC_CONTACT`: contact uses instantaneous positions.
  - `DISK_QUADRATURE`: the disks use 128-strip sampling and a small-angle approximation.
- **Steps and precision:**
  - The engine computes every 10 minutes. Times are shown, and the slider moves, in 10-minute steps. A window starts at the first step where its condition holds and ends at the first step where it no longer does.
  - The prototype refines event times to 60 s. It is the reference (§11.1), and tests allow up to one step (10 min) of difference on window edges.
  - Terrain errors dominate: 5 m of height error is 0.29° at 1 km and 0.03° at 10 km. With the Sun skimming the horizon, that shifts a sunrise by minutes to hours.
  - Reporting seconds would be false precision.
- **Uncertainty range (P9; the physics team's method):**
  - The skyline is recomputed with heights moved by the DEM's height error (the `_ERR` raster): terrain down and observer up gives the **low** skyline, terrain up and observer down gives the **high** one.
  - The Sun's numbers are recomputed against both, for example "Sun 62% (58–66%)".
  - These are **sensitivity bounds, not confidence intervals**. They leave out error correlation, map registration, unresolved terrain and ephemeris error, and the UI says so.
  - Where the error raster has no value, the range is unavailable (`UNCERTAINTY_UNAVAILABLE`).

### 7.4 Metrics, verdict and live status

- **Mission window:** [landing − 12 h, landing + mission length].
  - The 12 h before landing is the physics team's landing margin: the actual landing can come a few hours before the planned time, so the window starts early enough to cover it.
  - The margin defaults to 12 h in `config/score.yaml` and is user-configurable as the `margin` URL parameter (0–48 h); 0 gives the old forward-only window.
  - In their prototype the margin is `delta_t_before_s` and the mission length is `delta_t_after_s`.
- **Mission metrics:** computed over the mission window: sunlight at panel height, contact at antenna height. The physics team's default mission length is **30 Earth days** (**P4**); users can set 1–365.

  | Metric | Meaning |
  |---|---|
  | `sun_pct` | Share of mission time with the Sun visible (any part of the disk) |
  | `dte_pct` | Share of mission time with Earth contact |
  | `both_pct` | Share of mission time with both |
  | `sun_disk_mean` (**L**) | The physics team's sunlight measure: the average visible fraction of the Sun's disk, averaged per day and then over the days. A half-hidden Sun counts half |
  | `contact_mean` (**C**) | The physics team's contact measure: the share of each day with contact, averaged over the days |
  | `earth_any_pct`, `earth_whole_pct` | Share of mission time with part of / all of the Earth's disk above the terrain (information only, §7.3) |
  | `longest_dark_h` | Longest period without sunlight. It is cut off at the window edges and flagged if it continues past them. Unknown time is not darkness, so it breaks a dark period. |
  | `longest_no_contact_h` | Longest period without Earth contact, counted the same way |
  | `first_sun_h` | Hours of sunlight from the window start: the length of the sunlit stretch that is under way at the window start (cut off at the window end). 0 if the window starts in darkness. Used by the `landing_sunlight` grade (§7.5) |
  | `first_dark_after_landing_h` | Hours from landing until the first darkness. 0 means the lander arrives in darkness. |
  | `earth_el_range` | The Earth's lowest and highest elevation during the mission, which shows libration |
  | `daily_sun_pct`, `daily_dte_pct`, `daily_sun_disk_mean` | Per day: the share with the Sun visible, the share with contact, and the mean visible disk fraction (the physics team's "% per day") |

- **Days (the physics team's definition):** consecutive **24-hour bins from the window start**, not lunar days or calendar dates. Day edges are set in UTC and converted to the engine's time scale, so the bin count is exact: a 30-day mission with the 12 h margin has 30 full bins plus a last 12 h bin. Full days count equally; a shorter last day counts in proportion to its length.
- **Unknown time:** a percentage, or a day's value, that includes unknown time is **unavailable**, not lowered. The hours known to be visible are still reported.
- **Verdict:** the red/amber/green chips in the card header. There is one chip each for:
  - Sun, from `sun_pct`
  - Earth contact, from `dte_pct`
  - Slope, from `slope_deg`

  The chips are facts about the scenario, so the weights (§7.5) never change them. Thresholds are in `config/rag.yaml`, and the physics team sets all of them (**P6**). Interim values:
  - Percentages: green ≥ 60, amber 30–59, red < 30.
  - Slope: green ≤ 5°, amber 5–10°, red > 10°. The physics team will send the definitions of what's acceptable, with their context.

  Each chip has a tooltip with its reason.
- **Live status at the moment being viewed.** The browser reads it from the series, with no physics:
  - Solar elevation, the terrain horizon in that direction, and the **clearance** (their difference).
  - Whether the Sun is visible, and **"sunset in …" or "sunrise in …"**, from the next change in the series.
  - The same for the Earth: elevation, clearance, and **"Earthset in …" or "Earthrise in …"**.
  - If the next change falls outside the months already loaded, the panel shows "not before <date>".

### 7.5 Score and weights (P5: the physics team's formula)

The physics team owns the score. This is the additive formula from their second prototype (`MenasimMoonV2`, 14 Nov), which replaces the four-factor version of 12 Nov. Their own label applies: the weights, the 6 h sunlight requirement and the 0–15° slope scale are **illustrative, not validated landing criteria**, and the UI says so next to the score.

**Seven grades, each from 0 (bad) to 1 (good), all over the mission window (§7.4):**

| Grade | Name in their code | How it is computed |
|---|---|---|
| **L**, sunlight | `light` | `sun_disk_mean`: the average daily visible fraction of the Sun's disk |
| **C**, Earth contact | `communication` | `contact_mean`: the average daily share of time with contact to the chosen station |
| **DK**, longest darkness | `dark_time` | `1 − longest_dark_h / window length`. A 15-day night in a 30.5-day window gives 0.51 |
| **OT**, longest outage | `outage_time` | `1 − longest_no_contact_h / window length` |
| **LS**, sunlight at landing | `landing_sunlight` | 1 if `first_sun_h` ≥ `required_sunlight_h` (default **6 h**), otherwise 0. It is pass/fail, not graded |
| **S**, slope | `slope` | 1 at or below `slope_good_deg` (0°), falling in a straight line to 0 at or above `slope_bad_deg` (15°) |
| **D**, dust | `dust` | `1 − D`, where D is the simulated dust index (0–1) at the site, so more dust lowers the grade |

**Formula:**

```
score = 100 × Σ w·grade / Σ w        over the 7 grades
```

- **Weights** are relative: only their ratios matter. The default set:

  | Preset | L | C | DK | OT | LS | S | D |
  |---|---|---|---|---|---|---|---|
  | **Default** (the physics team's) | 0.25 | 0.25 | 0.15 | 0.15 | 0.10 | 0.10 | 0 |
  | Sunlight first (their rescoring example) | 0.60 | 0.20 | 0 | 0 | 0 | 0.10 | 0.10 |
  | Custom | user-set | | | | | | |

  Each weight runs from 0 to 1 in steps of 0.05, and at least one must be above 0. A weight of 0 switches its grade off: it neither adds nor costs points, and a missing value for it raises no warning. The user sets every weight (§7.5 "Settings the user can change"). The presets and all defaults live in `config/score.yaml`.
- **Penalties:** each grade loses `100 × w / Σw × (1 − grade)` points. For a site that is not excluded, the penalties add up to `100 − score`.
- **Deciding factor (P12):** the grade with the largest penalty. **Ties are all reported.** The explanation gives that grade's raw value, the grade, its share of the weights, and the points it lost, for example "station contact (average daily contact-time fraction 0.18; weight share 0.25; lost 20.5 points)".
- **The Sun-and-Earth overlap is not in the score.** `both_pct` is still computed and shown (chips, Gantt "both" row, §7.4).
- **Missing data:** a missing grade with a weight above 0 counts as **0**, and the score carries the warning `NULL_GRADE:<grade>` naming it. Sunlight with unknown time in it is an example (§7.4). The score is still given, so a missing value can only lower it, never raise it. The warning is shown in the warnings strip (§7.8) and as a badge on the score.
- **Hard gates.** A gated site gets score **0** and the category "excluded", with the reason shown on the score and in the warnings strip. Two gates:
  - **Inside a PSR (`excluded_reason: "psr"`):** the site lies in a permanently shadowed region according to NASA's PSR map (§6.1). **Every grade is set to 0**, whatever its raw value, so the breakdown shows 0 for all seven and the score is 0. The raw values (for example the sunlight fraction) are still listed next to the grades, so the user can see what was overridden. Each grade then loses its full weight share, and the penalties add up to 100. No deciding factor is named; the reason "inside a PSR" is the headline.
    - The prototype takes this as a flag the user types (`in_psr`). We read it from the map at the site, for catalog, custom and alternatives points alike. A point on the edge of a PSR counts as inside.
    - It is on by default and the user can switch it off (`psr`, §7.5 settings). Switched off, the site is scored normally.
    - Where the map has no value at the site, the gate is not applied and the warning `PSR_UNKNOWN` is added.
  - **Slope (`excluded_reason: "slope"`):** `slope_deg` above the maximum slope (default **15°**). The score is forced to 0; the grades keep their real values. An **unavailable slope makes the whole score unavailable** (`value: null`, category `unknown`, warning `SLOPE_UNAVAILABLE`), even when the slope weight is 0: the score is never computed from a slope we don't have. The other numbers on the card are still shown.
  - If both apply, the reason is "psr".
- **Colors:** green ≥ 70, amber ≥ 40, red below 40 (the physics team's values; their prototype calls amber "yellow"). "Excluded" has its own color.
- **The dust index (simulated; the physics team's model).** A fixed formula over the map position (x, y in the region's projection):

  ```
  D(x, y) = clip(0.5 + mean_k sin(x/L·cos a_k + y/L·sin a_k + p_k) / 2,  0, 1)
  ```

  It uses 6 waves (k = 1…6) and a length scale L = 5 km. The angles `a_k` and then the phases `p_k` are drawn uniformly from [0, 2π) by NumPy's `default_rng(42)`, in that order, so every run gives the same map. D has no unit and is not a measured density. Everywhere it appears, it is labeled "simulated", including the score breakdown ("dust: simulated").
- **Shape:** `score = {value, category, status, weights, factors: [{name, weight, weight_share, raw, grade, points_lost}], deciding: [names], excluded_reason, warnings, explanation, formula}`. `category` is green, amber, red or excluded. `excluded_reason` is `slope` or `psr`, or null. `warnings` holds the `NULL_GRADE:*` and `PSR_UNKNOWN` codes. `status` is "illustrative". The tooltip shows the breakdown, as the product spec asks.
- **Rescoring is free** for everything except the landing margin: changing a weight, a threshold, the PSR switch or the colors needs no new physics. The engine rescores the metrics it already has (the prototype's `score_metrics`); for example, `sun_req` only re-reads `first_sun_h`, and the slope numbers only re-read `slope_deg`. Changing the landing margin moves the window, so the metrics are re-read from the stored series (still no new terrain or ephemeris work).

**Settings the user can change.** Every number the score uses is a setting. `config/score.yaml` holds the defaults and the allowed ranges, `/meta` publishes them (§8.2), and the UI builds its controls from that list, so no number is hard-coded in the browser. The settings are shared by all cards (§4, spacecraft settings) and live in the URL (§8.1).

| Setting | URL key | Default | Range, step | Notes |
|---|---|---|---|---|
| Weights L, C, DK, OT, LS, S, D | `w` | 0.25, 0.25, 0.15, 0.15, 0.10, 0.10, 0 | 0–1, 0.05; at least one above 0 | Presets: Default, Sunlight first, Custom |
| Required sunlight at landing | `sun_req` | 6 h | 0–72 h, 0.5 | Sets LS |
| Slope: fully good at / fully bad at | `slope` (1st, 2nd) | 0°, 15° | 0–90°, 0.5; good ≤ bad | Sets S |
| Maximum slope (hard gate) | `slope` (3rd) | 15° | 0–90°, 0.5 | Set to 90 to switch off |
| Reject sites inside a PSR | `psr` | on | on / off | |
| Landing margin before landing | `margin` | 12 h | 0–48 h, 1 | Moves the window (§7.4) |
| Colors: green from / amber from | `colors` | 70, 40 | 0–100, 1; amber ≤ green | |
| Mission length | `days` | 30 | 1–365 days | Scenario parameter |
| Panel height, antenna height | `panel`, `antenna` | 2 m, 3 m | whole meters, 1–10 | Whole meters because masks are stored per meter (§7.2) |
| Earth station | `station` | Houston, 0 m, 0° | latitude −90–90°, longitude −180–180°, altitude −500–9,000 m, minimum elevation 0–45° | |

The panel offers "Reset to defaults" per setting and for all, marks every changed setting, and shows next to the score "custom settings" when any differ from the defaults. Out-of-range values are refused with 422 `INVALID_PARAM` naming the setting. A settings panel that changes the slope scale or the 6 h requirement keeps the "illustrative" label: the score is the user's own policy, not a validated criterion.
- **Speed:** a formula over numbers the engine already has, and it works on arrays. It is fast enough for everything it feeds: the card color, the Screen 4 score, the landing calendar (every day of 2026–2030, for each site), search and the alternatives map.
- **Still open for the physics team (P5):** does "doesn't want sunlight" mean `w_L` = 0 (and DK and LS at 0), or a preference for darkness? The formula supports only the first.

### 7.6 Search, landing calendar and alternatives

- **Requirements model** (Pydantic; every field optional):
  - where: site ids, categories, or "within a radius of a site"
  - when: the landing window (1 year at most) and the step (1 h by default)
  - mission length, panel height and antenna height
  - spacecraft settings: weights and Earth station
  - hard limits: minimum score, minimum `sun_pct`, minimum `dte_pct`, maximum slope, Sun at landing, Earth at landing
  - sort order and result limit
- **Algorithm:**
  1. **Candidates:** every site at every landing time in the window.
  2. **Running totals:** each site's visibility series is computed **once** over the landing window, widened by the 12 h margin before it and the mission length after it.
     - Running totals give every candidate's `sun_pct`, `dte_pct`, `both_pct`, L and C in O(1). This works for L and C because a duration-weighted average of daily means equals the plain time average over the mission window: L is the mean of `f` over the window, and C equals `dte_pct` / 100.
     - A running count of unknown steps marks candidates whose values are unavailable.
     - The dark and no-contact periods are kept as sorted lists. A candidate's `longest_dark_h` and `longest_no_contact_h` are the periods that lie wholly inside its window, found with a range-maximum table in O(1), plus the two periods cut by its edges, found by binary search. Its `first_sun_h` is one binary search.
     - So every score, DK, OT and LS included, is **exact**.
  3. **Power limits (Could):** checked only on the shortlist.
  4. **Grouping:** consecutive passing landing times at one site become one "landing opportunity", with a start, an end and a best time.
  5. **No dead ends:** if nothing passes, the search returns the closest misses and which limit each one failed.
  6. **Deterministic sort:** score, then shorter `longest_dark_h`, then earlier landing, then site id.
- **Speed:** under 0.5 s for 30 sites over a 1-month window, and under 2 s for a 1-year window (*est.*).
- **Landing calendar (Should):**
  - For one site and its settings, one cell per day from 2026 to 2030.
  - Each cell is colored by the best score from landing that day (hourly candidates), with the current weights.
  - Clicking a cell sets the card's landing time.
- **"Next good landing" (Should):**
  - Finds the earliest good landing time after the card's time, within 3 lunar days. The physics team defines "good" (**P7**); the interim rule is a green score.
  - If there is none, it returns the best time found and labels it as not green.
  - The result opens as a new card if fewer than 3 cards are open. Otherwise it updates the current card, and Back undoes the change.
- **Nearby alternatives (Should; the physics team's design, P11):** a score for every point in an area the user draws, so the user can see whether a spot nearby does better. The physics team asked for this.
  1. **Area:** a polygon the user draws on the map, with vertices given as (longitude, latitude). It must be a simple shape with positive area, and every vertex inside the custom-point area (84–90°S).
  2. **Points:** the polygon's bounding box is covered by square cells, **1 km apart** by default, and every cell center inside the polygon is evaluated. At most **2,500 cells**: if the spacing would give more, it grows until the count fits, and the answer reports the spacing actually used. Nothing is dropped silently.
  3. **The card's site is always included** at its exact coordinates, not replaced by the nearest cell. If it coincides with a cell center at the same heights, it is ranked once.
  4. **Each point is exact:** it gets its own masks at panel and antenna height (§7.2) and the full scenario evaluation, with the card's landing time, mission length and spacecraft settings. There is no approximate screening.
  5. **Score:** the score function (§7.5) runs on all points at once. Changing the weights rescores without new physics.
  6. **Result:** a score map over the cells, plus every point ranked by score, each with its metrics, penalties, deciding factor and warnings. A cell that can't be evaluated at all (no terrain at its center) has no score and is listed with the reason, never dropped; missing grades follow §7.5 (counted as 0, with a warning). Unsampled ground between cells is not certified, and the UI says so.
  7. **Refinement:** a new call with a smaller polygon and a finer spacing (the physics team's example: 300 m).
  - **Cost:** one mask per point. On the GPU, masks for 2,500 points take seconds (*est.*). On a CPU the cap is lowered and set at kickoff from measured speed (§5.3). The physics team's prototype measured about 9 s per point on a CPU, and its demo used 16 cells.
  - Opening a point creates a custom point, which reuses the mask already computed.
- **Site finder (Should):** the search with no "where" filled in. The user gives the mission and spacecraft parameters (landing window, mission length, panel and antenna heights, Earth station, hard limits); the engine searches every catalog site and returns the best landing opportunities. Opening a result fills a mission card with that site and landing time.
  - The parameters it takes and how it looks on Screen 2 are left open until implementation.
- **Recommended sites on the globe (Should):** the catalog ranked for a landing at the moment being viewed.

### 7.7 Insights ("Explain", Should): templates, no AI

**Rules** find facts, rank them by importance (red items first) and fill fixed templates. Each insight returns its text plus the facts it used.

The headline and the "why" sentences use the deciding factor: the factor with the largest weighted penalty, ties included (**P12**, §7.5).

| Insight | Example template (illustrative values) |
|---|---|
| Headline | "Sunlight 78%, Earth contact 64%, both 51% of the mission. Score 66 (amber); contact cost the most, 12.6 points." |
| Landing conditions | "At landing the Sun is up and sets in 31 h; the Earth is up and sets in 4 days." |
| Longest darkness and its cause | "The longest darkness, 38 h from 12 Mar 04:10, comes when the Sun passes behind terrain about 12 km to the east." |
| Earth gap and its cause | "Earth contact is lost for 4 days from 20 Mar, when the Earth sinks below the horizon." The sentence names the cause: lunar terrain in the way, or the station not seeing the Moon. |
| Libration | "During this mission the Earth's height in the sky ranges from −2.1° to +4.3° because of libration." |
| Slope | "Slope 7.4° (amber) over tens of meters." |
| Comparison (Screen 4) | "Landing on 4 Mar instead of 3 Feb raises the score from 41 to 63, mainly from 120 more hours with both Sun and Earth up." |

- **Directions:** blocking distances (§7.2) are turned into compass words, using 16 compass points.
- **Why templates rather than AI:** they are instant, free and deterministic. They always match the numbers, work offline and can be unit-tested.
- **Optional later:** an AI rewording layer. It must pass a check that every number it writes appears in the facts.

### 7.8 Warnings the user must see

The engine's functions return warnings with their results (data warnings, §7.3, and score warnings, §7.5). The rule: **a warning that changes how a number should be read is shown on screen, next to that number.**

- **One list.** Every result carries one `warnings` list, data and score warnings together. Each entry is `{code, text, severity, affects}`:
  - `text` is plain words from `config/warnings.yaml`, with the numbers filled in: for example "Sunlight is unknown for 3 h 20 min at the start, so its grade counts as 0." (`NULL_GRADE:light`).
  - `severity` is `info`, `caution` or `blocking`. `blocking` is only the PSR gate and the slope gate ("excluded").
  - `affects` names what it changes: `score`, `sun`, `contact`, `skyline`, `slope`, `all`.
- **The warnings strip** sits on the card under the verdict chips, always open and never collapsed into an icon alone.
  - It lists the warnings, `blocking` first, each with an icon, a color and a shape (not color alone), and its text.
  - At most 2 show in full; the rest are behind "+N more", which opens the full list. The count is always visible.
  - A link "Always true" opens the three standing notes.
  - With no warnings, the strip shows nothing, not an "OK" badge.
- **On the score.** A score with any warning shows a badge ("score uses missing data" or "excluded: inside a PSR"). The badge is part of the score box, so it is in every screenshot and every place the score appears. The tooltip repeats the full breakdown.
- **On other numbers.** A percentage or window affected by unknown time shows "unavailable" with the reason, never a number (§7.4). A Sun range that can't be computed shows "range unavailable" (`UNCERTAINTY_UNAVAILABLE`).
- **Everywhere a result is listed.**
  - Screen 4: each comparison column has its own strip, and the insights name the warning when it explains a difference.
  - Nearby alternatives: a ranked point with a warning shows a count and an icon, and the same strip opens when it is selected. Cells whose point is excluded or has `NULL_GRADE` are drawn with a hatch on the score map.
  - Landing calendar: a day whose best candidate carries a warning is marked, and the tooltip names it.
  - Search results and "Next good landing": the warning count is in the row.
  - Exports (CSV and Horizons): the warnings are written as comment lines at the top, and the CSV has a `warnings` column.
- **Never silent.** A warning the UI can't display (an unknown code) is shown with its raw code and `text`, rather than dropped. A test fails if a code the engine can return has no entry in `config/warnings.yaml`.

### 7.9 Power model (Could)

- **Solar power:** `power = 1361 W/m² × (1 AU / d)² × panel area × efficiency × f_sun`.
  - Panels always face the Sun.
  - Efficiency is a placeholder of 27%: about 30% for space-grade cells × about 90% for wiring and charging. The physics team should confirm it.
- **Battery presets** (Small Rover, Standard Lander, Large Habitat): each defines a capacity in kWh, a constant power use in W, and a usable share (e.g. 80%). The product teammate and the physics team set the values.
- **Simulation:**
  - The lander arrives fully charged.
  - Every 10 minutes: battery += (power − use) × Δt, clamped to [0, full].
  - Reaching the reserve counts as "ran out".
- **Outputs:**
  - battery % over time and its lowest value
  - whether the battery survives, and when it first runs out
  - energy produced
  - **how long it lasts in the dark**: usable capacity ÷ use. For example, 5 kWh × 80% ÷ 200 W = 20 h, shown next to `longest_dark_h`.
- **Not modeled:** heaters and temperature, light reflected from the ground, dust on the panels, aging, sleep mode.
- **No effect on the score** (§7.5).

### 7.10 AI features (Could and Nice)

- **"Ask the Navigator" command bar (Could):**
  - Claude must fill in our form, which is generated from the Pydantic models. It returns one of:
    - a **setup**: the app state (cards, dates, heights, screen)
    - a **search**: `Requirements`
  - It also returns `interpretation` (one plain sentence), `assumptions` (the defaults it filled in) and `unsupported` (anything it couldn't map).
  - The server validates the answer and retries once with the validation error. If that also fails, the user gets a clear message.
  - The app applies the result as a new URL, so Back undoes it. A search runs automatically, with the filled-in form shown above the results for editing.
- **Context sent with the request:** today's date, the allowed date range, the catalog's names and categories, units and defaults, and what we can't search on.
- **Requirements from a document (Nice):** the same pipeline, taking pasted text or a short PDF. The size is capped, and the file is processed in memory and never stored.
- **Model:** `claude-opus-5-5` by default. It's a setting, so a smaller, faster model (e.g. Haiku 5.5) can be tried if latency matters.
- **Guardrails:**
  - The API key stays on the server.
  - Input length, request rate and output are capped, and the account has a spending limit.
  - Answers are cached by their exact text, and the demo phrases are pre-warmed.
  - The AI can only fill in a form.
- **Quality:** about 25 test sentences, each with its expected form. The demo sentences must parse exactly.
- **Disclosure:** all runtime AI use goes into the Data and AI disclosure.

---

## 8. API contract

- **Base path:** `/api/v1`.
- **Conventions:**
  - Latitude and longitude in degrees. **Lunar longitude is east-positive, 0 to 360 inclusive** (360 is the same as 0 and is returned as 0); negative values are rejected, never converted. Results show it in 0 to less than 360. The **Earth station's** longitude is a separate input and stays signed (−180 to 180; Houston is −95.3698).
  - Times in ISO 8601 UTC.
  - Units in field names.
- **Source of truth:** the Pydantic models. The TypeScript client and the MSW mocks are generated from the OpenAPI schema.

### 8.1 Scenario parameters (canonical query string)

```
site=<id> & t0=<YYYY-MM-DDTHH:MMZ, minutes in steps of 10> & days=<1–365, default 30>
& panel=<1–10 m, default 2> & antenna=<1–10 m, default 3>
& w=<L>,<C>,<DK>,<OT>,<LS>,<S>,<D>                  (weights, 0–1 in steps of 0.05; default 0.25,0.25,0.15,0.15,0.10,0.10,0)
& station=<lat>,<lon>,<alt_m>,<min_el_deg>          (default: Houston 29.7604,-95.3698,0,0)
& sun_req=<h>                                       (sunlight required at landing, for LS; 0–72, default 6)
& slope=<good_deg>,<bad_deg>,<max_deg>              (slope scale and hard limit; default 0,15,15)
& psr=<0|1>                                         (reject sites inside a PSR; default 1)
& margin=<h>                                        (window start before landing; 0–48, default 12)
& colors=<green_from>,<amber_from>                  (default 70,40)
[& panel_area_m2=<m²> & battery=<preset id>]        (power, Could)
& v=<bundle_id>.<engine_sha>
```

Every setting is always written, with its default when unchanged, so the same scenario never has two URLs. The client always writes parameters in the same order with the same rounding, so the same scenario always gives the same URL. That URL is both the cache key and the shareable link.

### 8.2 Endpoints

| Endpoint | Purpose | Priority |
|---|---|---|
| `GET /health` | Wake-up ping; uptime monitor | Must |
| `GET /meta` | <ul><li>Version, landing and data ranges, step, lunar-day length, allowed heights.</li><li>Regions: projection, extent, tile template, tile grid, layers with legends, custom area.</li><li>Red/amber/green thresholds, score config (grades, every score setting with its default, range and step, the "illustrative" status), weight presets, the warning catalog (code, text, severity), the default station and station presets, power presets, capabilities, limits.</li></ul> | Must |
| `GET /sites` | The catalog | Must |
| `GET /sites/{id}` | One site, catalog or custom (a missing custom site is recomputed) | Must |
| `POST /sites/custom {lat, lon}` | Create a custom point. Idempotent; synchronous for the numbers. | Must |
| `GET /sites/{id}/horizon?height=&part=full\|far` | Mask (720 values, nominal plus low and high) and blocking distances at one height, for the sky view and the skyline ring | Must |
| `GET /scenario/summary?<scenario>` | Metrics, verdict, score, windows. Optional parts: `insights` (Should), `uncertainty` (Should), `power` (Could). | Must |
| `GET /scenario/series?<scenario>&month=YYYY-MM` | 10-minute series for one month | Must |
| `GET /scenario/export?<scenario>&format=csv\|horizons` | The series, windows and daily percentages as CSV, or a ready-made JPL Horizons query (batch text plus API URL, built with the recipe in §11.4) for the same site and period, so anyone can check our numbers | Must |
| `GET /scenario/calendar?site=&days=&panel=&antenna=&w=&station=&sun_req=&slope=&psr=&margin=&colors=&v=&year=` | Best score for each landing day of the year | Should |
| `POST /scenario/alternatives {scenario, polygon: [[lon, lat], …], spacing_m}` | The score map of the area the user drew, plus every point ranked (§7.6). A POST because the polygon is too long for a URL; answers are cached by the request body's hash | Should |
| `GET /search?<requirements>` | Ranked landing opportunities, plus the closest misses | Should; powers the calendar and "Next good landing" |
| `GET /compare/insights?s=<scenario>&s=<scenario>` | Comparison sentences for Screen 4 | Should |
| `POST /nl/parse {text}` or a PDF upload | Setup or search, plus interpretation, assumptions and unsupported items | Could (text); Nice (PDF upload) |
| `GET /ephemeris/global?month=` | Hourly unit vectors from the Moon to the Sun and from the Moon to the Earth, in MOON_ME, plus the rotation from the Earth-fixed frame to MOON_ME, for the globe (§9.3) | Should |

### 8.3 Response shapes (abridged)

```jsonc
// GET /sites/{id}
{ "id": "shackleton_rim_a", "name": "…", "source": "catalog", "category": "…",
  "region": "south_pole", "lat": -89.45, "lon": -137.31,            // example values
  "elevation_m": 0, "slope_deg": 0, "slope_resolution_m": 20, "source_url": "…",
  "terrain": {"near": ["lola_20m_south", "lola_80m_south"], "far": "lola_240m_south"},
  "local_area": { "size": [200, 200], "spacing_m": 30,
                  "corners_latlon": [[0,0],[0,0],[0,0],[0,0]],
                  "heightmap_url": "…/heightmap.npy.gz",
                  "grid_url": "…/grid.npy.gz", "grid_status": "ready",   // ready | pending | unavailable
                  "grid_az_step_deg": 3, "grid_scale_deg": 0.01 } }

// GET /scenario/summary
{ "scenario": {…}, "version": "…",
  "metrics": { "sun_pct": 0, "dte_pct": 0, "both_pct": 0,            // null when unknown time is included
               "sun_disk_mean": 0, "contact_mean": 0,                // L and C (§7.5)
               "earth_any_pct": 0, "earth_whole_pct": 0,
               "longest_dark_h": 0, "longest_no_contact_h": 0, "first_sun_h": 0,
               "first_dark_after_landing_h": 0, "window": ["t", "t"],      // landing − 12 h, landing + days
               "earth_el_range": [0, 0], "unknown_h": 0 },
  "rag": { "sun": {"color": "green", "reason": "…"}, "dte": {…}, "slope": {…} },
  "score": { "value": 0, "category": "amber", "status": "illustrative",   // value 0 when excluded
             "weights": {"L": 0.25, "C": 0.25, "DK": 0.15, "OT": 0.15, "LS": 0.1, "S": 0.1, "D": 0},
             "factors": [{"name": "C", "weight": 0.25, "weight_share": 0.25, "raw": 0.18,
                          "grade": 0.18, "points_lost": 20.5}],
             "deciding": ["C"], "excluded_reason": null,                  // "slope" | "psr" | null
             "settings": {"sun_req_h": 6, "slope_deg": [0, 15, 15], "reject_psr": true,
                          "margin_h": 12, "colors": [70, 40], "custom": false},  // as used; custom = differs from defaults
             "warnings": [{"code": "NULL_GRADE:light", "severity": "caution", "affects": "score", "text": "…"}],
             "explanation": "…", "formula": "…" },
  "windows": { "sun": [["t", "t"]], "dte": [], "both": [], "unknown": [] },
  "daily": { "sun_pct": [], "dte_pct": [], "sun_disk_mean": [] },   // one per 24-hour bin; null when unknown
  "warnings": [{"code": "DEM_GAPS", "severity": "caution", "affects": "skyline", "text": "…"}],
                                                      // all data and score warnings, one list (§7.8)
  "insights": [{"text": "…", "facts": {…}}],          // Should
  "uncertainty": {"sun_pct": [0, 0], "sun_disk_mean": [0, 0]},   // Should; sensitivity bounds (P9)
  "power": {…} }                                        // Could; only when enabled

// GET /scenario/series
{ "start": "…", "step_s": 600, "n": 4464,
  "sun_az": [], "sun_el": [], "sun_vis_el": [], "sun_horizon_el": [], "sun_lit_frac": [],
  "earth_az": [], "earth_el": [], "earth_vis_el": [], "earth_horizon_el": [],
  "earth_any": [], "earth_whole": [],
  "contact": [], "station_az": [], "station_el": [], "station_horizon_el": [],
  "earth_station_up": [], "station_moon_el": [],      // the Moon's elevation seen from the station
                                                      // visibility fields: 1, 0, or null for unknown
  "power_w": null, "soc_pct": null }                    // Could

// POST /scenario/alternatives                          // Should
{ "scenario": {…}, "polygon": [[0, 0], …], "spacing_m": 1000,     // spacing actually used
  "grid": { "size": [0, 0], "x0_m": 0, "y0_m": 0, "inside": [] }, // cells in the region's projection
  "scores": [],                       // row by row; null outside the polygon, or when the cell can't be evaluated
  "ranked": [{"id": "grid:3:4", "source": "grid", "lat": 0, "lon": 0, "score": 0, "category": "green",
              "deciding": ["C"], "metrics": {…}, "warnings": []}],       // the card's site: "selected"
  "note": "Points between cells are not certified." }
```

### 8.4 Errors, caching, capabilities

- **Errors** use `application/problem+json` with a stable `code`:
  - `OUT_OF_COVERAGE`, `OUT_OF_TIME_RANGE`, `INVALID_PARAM`
  - `TERRAIN_READ_FAILED`, `RATE_LIMITED`, `FEATURE_DISABLED`
  - `NL_UNAVAILABLE`, `NL_NOT_UNDERSTOOD`
- **Caching:**
  - Versioned GETs return `Cache-Control: public, max-age=31536000, immutable`.
  - `/meta` and `/health` are cached for at most 60 s.
  - POSTs are not cached.
- **Capabilities** (in `/meta`): `custom_points`, `custom_grids`, `insights`, `calendar`, `search`, `alternatives`, `stations`, `dust`, `globe`, `power`, `nl`.
- **Limits** (in `/meta`): `max_cards: 3`, `max_days: 365`, `max_search_window_d: 365`, and for alternatives `max_cells` (2,500 on a GPU; lower on a CPU) and `default_spacing_m: 1000` (**P11**).

---

## 9. Frontend

### 9.1 Stack (locked)

| Library | What it does for us |
|---|---|
| React + Vite + TypeScript | The app and its build |
| OpenAPI-generated client | Typed calls that can't drift from the API |
| TanStack Query | Caches server answers by scenario URL, de-duplicates requests, prefetches, retries while the server wakes up, and keeps old values on screen while new ones load |
| zustand | A small store outside React, for the clock and for hover/drag state |
| zod | The typed URL codec |
| OpenLayers | The map: any projection (here polar stereographic), custom tile grids, drawing layers |
| three.js 0.180.x | One shared copy for react-three-fiber and the globe component (the kit is tested on r180) |
| react-three-fiber (+ drei) | 3D written as React components, with per-frame updates through `useFrame` |
| Tailwind + shadcn/ui | Accessible UI components |
| d3-scale | Scales for the SVG charts (timeline, sky view, calendar) |
| MSW | Sample answers generated from the API schema, so the frontend can start before the backend exists |
| Vitest, Playwright | Tests |

### 9.2 State, time and history

- **The URL holds all shareable state:**
  - cards: site, offset, panel height, antenna height, mission length (and power settings, Could)
  - the spacecraft settings: weights and Earth station
  - the global landing time `T0`
  - the mission elapsed time being viewed, `τ`
  - the current screen and the active layers

  The zod codec turns a broken or outdated link into defaults instead of an error.
- **Time model:**
  - Card *i* lands at `t0_i = T0 + Δ_i` and is shown at `t_i = T0 + τ + Δ_i`.
  - Every card is therefore at the same mission elapsed time, so "day 3 of the mission" lines up across scenarios with different landing dates.
  - "+1 Lunar Day" on a card adds 29.53 days to that card's `Δ_i`. On the top bar it adds 29.53 days to `T0`.
  - All times sit on the engine's 10-minute grid: `T0`, `τ` and the offsets move in 10-minute steps. "+1 Lunar Day" therefore adds 29 d 12 h 40 min (29.53 days rounded to 10 minutes).
  - The Screen 4 timeline uses mission elapsed time on its axis, with real dates in the tooltips.
- **Browser history:**
  - Real actions **add** a history entry, so Back undoes them. These are:
    - adding or removing a card
    - "+1 Lunar Day"
    - changing a site
    - applying a command-bar setup
    - choosing a day in the calendar
  - Dragging the time slider **replaces** the current entry instead, the way panning a map does.
  - During a drag, the URL is written at most twice a second and once more on release. Safari rejects more than 100 history changes in 30 s.
- **The clock lives outside React:**
  - While dragging or playing, `τ` lives in zustand.
  - The map overlay and the 3D views listen every frame and redraw directly, in under 1 ms of work.
  - Text and chips update about 10–15 times a second.
  - Nothing else re-renders.
- **Reading the series:** each card reads its month's series at the step for `t_i`. Because times move in 10-minute steps, no blending is needed. The months before and after are prefetched.
- **Snapshot fallback:** if the API fails, the data layer tries the demo snapshot on the CDN (§10.3).

### 9.3 Screens

#### Start (Screen 2, with a one-line intro)
- Three **example scenarios** (Should), each just a preset URL. For example:
  - "Launch slips by a month at a rim site"
  - "Two rim sites side by side"
  - "Inside a permanently shadowed crater"

#### Screen 2: map and cards
- **Map** (OpenLayers, `south_pole` region):
  - Zoomed out: NASA Moon Trek tiles (color hillshade by default, slope switchable), plus a topographic layer the user can switch on (elevation colors with hill shading; Should).
    - **Moon Trek tiles:** OpenLayers loads them straight from NASA's tile service (WMTS), in the south-polar stereographic projection, so no reprojection is needed if our region uses the same one (*verify* at kickoff).
    - **Fallback:** our own build tiles (§6.3) from the same LOLA DEMs. The app switches to them when a Moon Trek tile fails, and the demo snapshot (§10.3) always uses them, so judging never depends on NASA's server being up.
    - **Credit:** the map shows "NASA Moon Trek / LOLA" in its attribution corner.
  - Zoomed in near a site: the live shadow and Earth-contact overlay.
    - Each frame compares `sun_vis_el` and `earth_vis_el` with the 40,000 grid points and paints a 200 × 200 image.
    - The image is placed using the site's local frame. If that doesn't work, it is placed by the grid's four corners.
  - A dashed circle marks the custom-point area.
  - Catalog sites are shown as pins.
  - With two or more cards, the map splits, and the halves share the same time.
  - **Nearby alternatives (Should):** the user draws a polygon around a site (OpenLayers draw tool, inside the dashed circle). The answer is drawn as score-colored cells, the best points as numbered pins and the card's site as a star. A finer spacing can be asked for inside a smaller polygon. A note says points between cells are not certified.
- **Site finder (Should):** an entry point on Screen 2 where the user enters parameters but no site, and gets suggested sites (§7.6). Its layout is open until implementation.
- **Spacecraft settings** (top bar), applied to every card:
  - The Earth station: Houston by default, labeled "demonstration location, not an operational antenna". Typed coordinates or a preset are a Should.
  - Score settings (Must): a panel built from the `/meta` list (§7.5, "Settings the user can change").
    - Presets (Default, Sunlight first, Custom), and seven weight sliders for sunlight, contact, longest darkness, longest outage, sunlight at landing, slope and dust. The dust slider is marked "simulated".
    - Every other number as a slider with a number field: required sunlight hours, the slope scale and maximum slope, the landing margin, the green and amber limits, and the switch for rejecting PSR sites. Mission length, heights and the station fields sit in the card and the station panel.
    - Changed settings are marked, each has a reset, and a "custom settings" note appears next to the score.
    - The score always carries the physics team's note that the weights and thresholds are illustrative.
- **Mission card contents:**
  - site picker
  - panel height and antenna height sliders
  - landing date and offset, with "+1 Lunar Day"
  - mission length
  - verdict chips, each with an icon as well as a color
  - the warnings strip (Must, §7.8): every data and score warning in plain words, `blocking` ones first
  - live panel: elevation, clearance, countdowns
  - **sky view**
  - **elevation-over-time graph** (Should)
  - buttons (Should): "Explain", "Next good landing", "Nearby", calendar
  - power section (Could)
- **Sky view (Must),** drawn in SVG:
  - The x-axis is azimuth (0–360°). The y-axis is elevation (about −5° to +10°).
  - The terrain silhouette comes from the mask at panel height. When the antenna height differs, its skyline is drawn as a second, thinner line, since contact is checked against it.
  - The Sun's and the Earth's paths across the mission are drawn as lines with time ticks. The Earth's path shows its libration loop.
  - Disks drawn to scale mark the current positions. They move with the slider, with the countdowns beside them.
  - **Why we keep it:** the physics team suggested replacing it with a topographic map. The challenge asks us to "display the positions of the Sun and Earth relative to the horizon at a selected landing site on a chosen date", and only the sky view shows that. The topographic layer goes on the map and the globe instead.
- **Elevation-over-time graph (Should),** drawn in SVG, one per mission card. It shows the Sun, the Earth and the terrain over the whole mission:
  - **Layout:** two stacked panels, Sun on top and Earth below, sharing one x-axis, mission elapsed time in days. Each panel has its own y-axis in degrees, because the Sun swings about ±1.5° at the pole while the Earth swings about ±7°; one shared axis would flatten the Sun.
  - **In each panel:** the body's elevation as a line, and the terrain horizon in that body's direction at that moment as a gray area. Line above gray means visible.
  - **Strips** under the panels: Sun visible, Earth contact, and both. They come from the series' own visibility fields (`sun_lit_frac`, `contact`), so they match the chips and the Gantt exactly. The Sun line is the disk's center, so a strip edge can sit up to the Sun's radius (0.27°) away from where the line crosses the gray, because any part of the Sun counts. Contact is checked for the direction to the station, which lies within about 1° of the Earth's center line. The contact strip is also off while the station can't see the Moon (`earth_station_up`), even with the Earth above the terrain. Those stretches are drawn hatched, and the readout says "no station". Unknown stretches are drawn in a neutral pattern and labeled "unknown (missing terrain)".
  - **Time:** a dashed line marks the slider time. Hovering, or dragging on touch, shows a readout of the time, each body's elevation, terrain height, clearance and visible/hidden. Clicking moves the slider there.
  - **Data:** the series already has everything (`sun_el`, `sun_horizon_el`, `earth_el`, `earth_horizon_el`), so no new endpoint is needed. The graph needs every month of the mission, not just the slider's month. A 1-year mission loads 12 months, about 2–4 MB before gzip. Drawing at most about one point per pixel is the builder's call.
  - **Why:** the sky view shows where the bodies are (direction against height), and the Gantt shows only on/off. This graph shows height against time, so it explains why a dark stretch happens (the Sun dips behind a ridge) and how much margin there is (0.2° versus 2°).
  - The user chose this layout from a mockup over a single "clearance" panel, which was more compact but didn't draw the terrain.

#### Landing calendar (Should)
- A 2026–2030 grid, laid out like a year-by-day heat map and colored by each day's best score.
- Hovering a day shows the best hour and the score. Clicking sets the landing time.
- "Next good landing" jumps to the next green cell.

#### Screen 4: timeline comparison
- Three rows per scenario on an SVG Gantt chart: Sun, Earth contact, both. The x-axis is mission elapsed time.
- A score box with the breakdown in a tooltip.
- Comparison insights (Should).
- CSV and Horizons export, plus "Export Scenario" next to the winning scenario.

#### Screen 3: surface view (Should)
- **Entry point:** `<SurfaceView scenario time />` in `surface3d/`. It loads only when opened.
- **What it draws:**
  - The ground comes from the heightmap.
  - Ground colors come from the same lit/unlit function the map overlay uses.
  - The skyline ring comes from the far-only mask.
  - The Sun and Earth sit at their azimuth and elevation.
  - The lander is a GLB model, and the gauges are React overlays.
- **Axis mapping:** east → x, up → y, north → −z. Check: when facing north, a mountain known to be to the east must appear on the right.

#### Screen 1: globe (Should), written at kickoff
- **The approach, proven by the 3D teammate's pre-event test (the Moon Watchers kit):**
  - A self-contained three.js component: `createMoonOrbit(host, options)`, then `setDirections({sun, earth, earthFixedToMoon?})`, `setView({longitude, latitude})`, `setInteracting(bool)`, `ready` and `dispose()`. It also accepts an `AbortSignal` and ships TypeScript types.
  - It draws a drag-to-rotate Moon from LOLA heights (global plus 240 m polar caps), and a distant sky with the Sun and Earth. Bodies that are off screen get arrows on the frame edge.
  - It has a WebGL2 renderer with a software fallback.
  - At runtime it fetches only its own local assets: no CDN, no telemetry.
- **Why it fits our design:**
  - It takes **unit vectors from the Moon's center to the Sun and the Earth, in MOON_ME**. That is exactly what our ephemeris table holds.
  - `/ephemeris/global` serves those vectors hourly, plus the rotation from the Earth-fixed frame to MOON_ME computed with SPICE. They replace the kit's demo ephemeris, which is sampled every 4 days and is off by up to 0.22° for the Earth. That keeps one physics.
  - `setInteracting` matches our slider design.
  - We pass our shared three.js (r180) through its `three` option.
- **Integration:**
  - A React wrapper creates the component after the host element mounts.
  - The wrapper disposes of it, or aborts it, on unmount.
  - The wrapper calls `setDirections` whenever the clock changes.
- **Gaps the 3D teammate would add:**
  - site and region pins, colored by **our engine's** verdicts
  - picking a pin to open Screen 2
  - Sun and Earth direction lines, if the product spec wants them
  - an "Explore South Pole" button, which belongs to the host UI
  - elevation colors (a topographic view), which the physics team asked for. Whether they replace the lighting or sit beside it is open (§16 #5).
- **Physics caveat.** The kit's terrain shadows come from a sampled approximation, and its README itself says not to use them to judge a landing site.
  - On the globe they serve as visual context only.
  - Pins carry the engine's numbers, and the view is labeled "context view".
  - Whether to keep these shadows or switch them off is an open question (§16). The team previously rejected illustrative shadows for site-level views.
- **Built at kickoff.** The pre-event kit was only a test. The component is written during the event, with the same interface (unit vectors in MOON_ME), which is exactly what our engine supplies.
- **Licenses:**
  - three.js: MIT.
  - LOLA data and Blue Marble: NASA, with credit.
  - Moon Trek tiles: "NASA Moon Trek / LOLA" in the map attribution.
  - The Moon color maps: CC BY-SA 4.0, adapted from Stellarium's LROC-WAC-based map. Their attribution and license are kept with the assets.

#### "How we know it's right" (minimal: Must; full: Should)
A static page in two parts:
1. **Comparisons** with existing tools, generated from the build's validation report (§11.4): JPL Horizons, NASA's PSR map, Moon Trek terrain, QuickMap and GMAT.
2. **How the calculations work:** the rules and formulas in plain language, written by the physics team.

The minimal page has the Horizons and PSR comparisons (the build's gates) and a short method summary.

#### Command bar (Could)
One input at the top. While it works, it shows its interpretation line and a spinner.

### 9.4 Look and feel

- **Theme:** dark mode first.
- **Color roles** (from the product spec):
  - lime: primary actions and the selected item
  - green, amber, red: feasibility only, always with an icon
  - blue: water and ice
  - purple: sensitive sites
- **Numbers:** monospace digits.
- **Progressive disclosure:** the simple view comes first, and the raw values are in tooltips.
- **Showing the extremes:** the sky view and the 3D views make the polar extremes visible: a Sun that skims the horizon and an Earth that wobbles with libration.

### 9.5 Feature flags and folders

- **Feature flags:** the UI shows or hides features from the `/meta` capabilities.
- **Folders, each with one owner:** `state/`, `api/`, `map/`, `sky/`, `timeline/`, `calendar/`, `surface3d/`, `globe/`, `ui/`, `navigator/`.

---

## 10. Non-functional requirements

### 10.1 Speed targets (*est.*, measured at kickoff)

| Action | Target |
|---|---|
| First screen | About 1–2 s. The app and tiles come from the CDN; 3D code loads only when its screen opens. |
| Change a setting | Under 0.5 s. The old values stay visible, dimmed, until the new ones arrive. |
| Drag the slider or press Play | 60 FPS, with no network calls |
| Custom point | Numbers in 1–2 s; shadows a few seconds later (GPU only) |
| Landing calendar or search | Under 2 s |
| Nearby alternatives | Seconds for 2,500 points on a GPU (*est.*); on a CPU, the point cap is set so an answer takes under about 30 s |
| Command bar (Could) | A few seconds; cached demo phrases are instant |

### 10.2 Hosting

- **Two modes** (§5.3): event mode first, then judging mode on a free CPU host. No backup server for now.
- **Cold starts:**
  - The page pings `/health` as soon as it loads, and shows "Waking the server…" while the map is already visible.
  - Where the host's rules allow it, a scheduled ping keeps the server awake.
  - Versioned GETs can be cached by a CDN.
- **`config.json`** on the static host holds the API address, so moving the server needs no rebuild.
- **Monitoring:** a free external uptime monitor emails the team if the server goes down. Redeploying is one command, which pulls the bundle from the GitHub Release.

### 10.3 Demo snapshot

- A deploy script requests the answers for the demo scenarios and stores them as static files on the CDN, keyed by URL.
- If the API fails, the app serves these files, so the demo works with the server down.

### 10.4 Memory and cost

- **PyTorch is large.**
  - The API imports it only when it computes a custom point, and its memory use is measured at kickoff.
  - If it doesn't fit, choose a host with more memory. Candidates to compare at kickoff: Hugging Face Spaces, Render, an Oracle Cloud free VM. Their limits change often.
  - Alternatively, write the horizon code against the subset of features NumPy and PyTorch share, so the CPU host doesn't need PyTorch at all.
- **Cost:** static hosting is free. The Claude API is used only by the command bar and document requirements, under a spending cap and with caching.

### 10.5 Security

- **No accounts, no personal data, no database.**
- **Input validation:** Pydantic checks every input (ranges, lengths, allowed values). Custom ids are parsed before they touch the disk.
- **Rate limits per visitor on the expensive actions:** custom points, search and calendar, nearby alternatives, the command bar and uploads. The numbers are set at kickoff.
- **Server load:** the GPU computes one grid at a time, and every request has a timeout.
- **Secrets:** the API key is only on the server, never in the app's code or the repo.
- **AI:** it can only fill in a form (§7.10).
- **Supply chain:** downloads are verified against checksums, and dependency versions are pinned.
- **Licenses:**
  - The code gets an open-source license.
  - NASA data is credited.
  - Third-party assets keep their attribution, including the globe's CC BY-SA textures.

### 10.6 Accessibility and browsers

- **Chips:** each has an icon as well as a color, and a screen-reader label.
- **Keyboard:** the slider and the cards work from the keyboard.
- **Text alternatives:** insight sentences double as text descriptions of the charts.
- **Browsers:** current versions of Chrome, Edge, Firefox and Safari.
- **3D:** the 3D views need WebGL2. Without it, the user sees a message explaining why. The globe kit also has a software fallback.

---

## 11. Testing and validation

### 11.1 Engine tests (pytest)

- **Geometry:** Sun and Earth azimuth and elevation for 3–5 lunar sites on several dates, compared with **saved JPL Horizons answers** (recipe, fetch rules and what to compare: §11.4). Target: within 0.01°.
- **Geometry sanity checks:**
  - A smooth sphere gives −0.087° for an observer 2 m up (the tangent-plane floor, §7.2).
  - A single mountain gives the angle worked out by hand.
  - A mountain due east blocks the Sun exactly when the Sun is due east.
  - 32-bit and 64-bit results agree within 0.001°.
  - The projection matches pyproj within 1 cm.
  - Results stay stable as the 200 km reach cap or the near window grows, and as the step size shrinks.
- **Rules and metrics:**
  - The disk fraction at 0, ½ and 1, a skyline that changes within the disk, and an Earth eclipse of the Sun.
  - The contact rule: the station direction against the antenna skyline, and no contact while the station sees the Moon below its mask.
  - Unknown terrain gives unknown time, never darkness, and makes the affected percentages unavailable.
  - Daily bins: exactly 31 bins for a 30-day mission with the 12 h margin, the last one 12 h long (the prototype's day-31 regression, now with the margin), and a partial last day weighted by its length.
  - Windows that cross the mission edges.
  - Countdowns.
  - The score: penalties add up to `100 − score`; a weight of 0 removes its grade; ties in the deciding factor are all reported; a missing active grade counts as 0 with `NULL_GRADE`; a slope above the limit gives score 0 and "excluded"; a site inside a PSR sets all seven grades to 0 and the penalties add up to 100, and turning the PSR switch off scores it normally; `PSR_UNKNOWN` when the map has no value; every setting outside its range gives 422; changing a setting changes the URL and the cache key; LS flips from 0 to 1 exactly at `required_sunlight_h`; DK and OT are cut at the window edges.
  - The physics team's demo points A (−89°, 0°) and B (−89°, 8°) with Houston, panel 2 m and antenna 3 m: the reference scores under the new formula are still to come from the physics team (their saved notebook predates it). The old-formula values, 38.56 and 20.98, no longer apply.
  - Warnings: every code the engine can return has an entry in `config/warnings.yaml`; every result carries its warnings in one list; an unknown code is shown raw.
  - Search's running totals against brute force.
  - The calendar against single evaluations.
  - Power energy balance (Could).
- **Insights:** the rules pick the expected facts, and the numbers are formatted correctly.
- **Against the physics team's reference script (P1):** for sample sites and times, the engine's Sun and Earth positions, windows and score match theirs, within tolerances agreed with them.

### 11.2 Invariants (Hypothesis, with random cases)

- A higher panel never reduces sunlight, and a higher antenna never reduces contact.
- Raising the horizon never increases `sun_pct`.
- Azimuths wrap correctly at 360°.
- A custom id converts back to the same coordinates.

### 11.3 "One physics" checks

- The grid's center point matches a mask computed at ground level.
- The engine exports a few hundred cases (point, time, lit or not). A Vitest test checks that the browser's comparison gives the same answers.
- If the globe kit is used, its Sun and Earth directions come from `/ephemeris/global`, never from its demo table.

### 11.4 Validation against NASA sources (feeds "How we know it's right")

- **JPL Horizons:** residuals for each site and date. The answers are fetched once and saved, so tests never depend on Horizons being online. Horizons is a validation source only, not a runtime or build dependency. Why: it handles one site and one target per request, it throttles bursts (6 parallel requests returned four HTTP 503s), it has no published rate limit or SLA, and it needs the network at demo time.
  - **Request recipe** (worked on 13 Nov, with 1-hour steps):
    - `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='<east lon>,<lat>,<height km>'&START_TIME=…&STOP_TIME=…&STEP_SIZE='1h'&QUANTITIES='4'&ANG_FORMAT='DEG'&CSV_FORMAT='YES'&COMMAND='10'`
    - `COMMAND='10'` is the Sun and `'399'` is the Earth. `QUANTITIES='4'` gives azimuth and elevation; add `20` for range and range-rate.
    - `COMMAND='301'` (the Moon as the target) is rejected. The center is always the Moon surface site.
  - **Fetch script (code, so it waits for kickoff):** one request at a time, about 1 s apart, a retry with backoff on 503, and the cost is small (one year at hourly steps took 2.8 s, ten years 6.9 s). A set of 5 sites × 3 years × 2 bodies is about a minute.
  - **Errors:** a failed query can come back as HTTP 200 with the error in the text. The script accepts a response only if the header names the expected target and center (`Target body name: Sun (10)`, `Center body name: Moon (301)`) and the table has the expected number of rows.
  - **What to compare:**
    - Horizons has no terrain: it measures elevation above the smooth reference sphere (radius 1737.4 km, the same radius LOLA uses) and has no refraction. Compare it with the engine's flat-horizon elevation (`mask off`), never with the terrain-masked `sun_vis_el`.
    - Horizons states DE441 for the Sun and Earth. We use `de440s` with the DE440 lunar orientation kernel (§6.1). They should agree closely, but nobody has compared them numerically. If the 0.01° target fails, check in this order: the frame (MOON_ME vs principal axis, §7.1), the light-time setting, then the ephemeris version. Document the cause on the validation page.
  - **Rise and set rows (to verify at kickoff):** `STEP_SIZE='1m GEO'` returns only rise, transit and set rows. Use them as a second check of window edges (sunset and Earthset times). A flag value `e` showed up that we haven't identified.
  - **Export:** the "Horizons query" export (§8.2) uses the same recipe, so a user can reproduce our numbers by hand.
- **NASA PSR map:**
  - The share of sampled points inside PSRs that are never lit during 2026–2030. It must be 100%.
  - The agreement rate outside PSRs.
- **NASA average-illumination map,** if available: the typical difference at sample points, with the expected sources of difference explained (time period, height).
- **QuickMap TerrainShadows:** 3–5 side-by-side images, made by hand on day 2. These are visual pattern checks; we don't automate them because there is no API.
- **Moon Trek terrain (elevation check):**
  - Moon Trek has no illumination or horizon product (its catalog has PSR and Diviner temperature layers only), so there is no lighting comparison. Only terrain can be compared.
  - Sample 20–50 points near the catalog sites. Ask NASA's elevation service (`getSamples`, at most about 200 points per call, GET only) and read the same points from our local 20 m DEM. Report the differences per site.
  - Coordinates go through the service's south-polar stereographic projection, so convert them with pyproj first. A known point (for example (20000, −15000) m, which the service reported as 1062.5) is the test for the converter.
  - Heights are measured from a 1,737,400 m radius, as far as the metadata shows. Confirm that against one reference point before trusting the residuals.
  - Like Horizons, the answers are fetched once and saved, so tests never depend on Moon Trek being online.
  - Expect small differences from resampling, because the 5 m and 20 m grids differ. Document them on the page.
- **GMAT:** the physics team's basic checks of the Sun and Earth positions (§12.3). GMAT is used only for validation.
- **Apollo (Could):** the Sun's elevation at historical Apollo landings against the mission reports. Test only; the kernels cover 1900–2050.
- **Every difference gets an explanation on the page.**

### 11.5 Measuring time saved (for the Impact claim)

On day 2, a teammate times one realistic comparison (one site, two landing dates) using QuickMap and Horizons, then does the same in our app. Both numbers go into the pitch, honestly.

### 11.6 Frontend tests and when tests run

- **Frontend tests:**
  - Vitest: the URL codec, the time model, the clock.
  - Playwright: three flows (compare two sites, "+1 Lunar Day", open a shared link), including a check that the canvas isn't blank.
  - A screenshot test for Screen 3.
- **On every push** (GitHub Actions, CPU only, a few minutes): all fast tests.
- **At the end of every data build:** the validation suite.
  - Geometry and PSR are **gates**: if they fail, no bundle is written.
  - The illumination comparison only reports.
- **Before the demo:** end-to-end tests, plus a rehearsal checklist:
  - the snapshot works with the API off
  - demo phrases come from the cache
  - example links open correctly

---

## 12. Team interfaces and workflow

### 12.1 Owners (proposal)

| Role | Owns | Hands over |
|---|---|---|
| Backend & 2D web (spec author) | Engine, API, data build, Screens 2 and 4, integration | Contracts, sample data, bundle |
| Data/ML | <ul><li>Verified sources (`sources.lock.json`)</li><li>NASA layers as GeoTIFFs</li><li>Command-bar test set and prompt (Could)</li></ul> | Inputs to the build |
| Product | <ul><li>`config/presets.yaml` (battery presets, Could)</li><li>UI wording, glossary, validation-page text</li><li>Demo script, slides or video, submission text</li></ul> | Config and content |
| Visual / 3D | <ul><li>`surface3d/` (Screen 3)</li><li>`globe/` (Screen 1, Should), written at kickoff using the approach from the pre-event test (§9.3)</li><li>A lander model with a checked license</li></ul> | Components |
| Physics team, two people (previously called the GMAT team) | <ul><li>The science: visibility rules, the score and its weight presets, thresholds, time windows (placeholders P1–P12, §12.3)</li><li>The reference script, in Python with SpiceyPy (§12.3)</li><li>`catalog/sites.yaml`: which sites, with coordinates and sources</li><li>`config/rag.yaml` (all thresholds) and `config/score.yaml`</li><li>Validation cases and tolerances; basic GMAT checks; Horizons test data</li><li>The "how the calculations work" text for the validation page</li><li>QuickMap spot checks and the time-saved measurement</li><li>Power-assumption review</li></ul> | Reference script, rules, configs, catalog, test data and reports |

**Biggest team risk:** one person owns both the backend and the 2D web app. If anyone can take Screen 4 or the data build, hand it over.

### 12.2 Shared conventions

- **Time:** UTC, written in ISO 8601.
- **Angles:** degrees. Azimuth runs clockwise from north; elevation is measured upward.
- **Coordinates:** lunar longitude is east-positive in [0, 360]; 360 is returned as 0. Earth-station longitude is signed.
- **Units:** meters, with the unit in the field name.
- **Frame:** `MOON_ME_DE440_ME421` (§7.1).
- **Formats:**
  - JSON for descriptions
  - NPY for large arrays
  - CSV for anything exchanged between people

### 12.3 Physics team contract

**Who does what.** The physics team owns the science: the rules for sunlight and Earth contact, the score and its weights, the thresholds and the time windows. The backend owns the data, the terrain, speed, the API and the UI. The three "services" the physics team proposed map onto our API:

| Their service | In → out | Our API |
|---|---|---|
| Light | Site and time → sunlit windows for the first month, the share of each day that's sunlit, data warnings | `/scenario/summary` (`windows.sun`, `daily.sun_pct`, `warnings`) and `/scenario/series` |
| Contact | Site, time, antenna height and Earth station → contact windows, data warnings | The same endpoints, with `antenna` and `station` |
| Site score | An area and a time → a score for each point, from Sun, contact, slope and dust | `score` in the summary; `/scenario/alternatives` for an area |

**What is computed in advance, and what isn't.** The physics team worried that a table for every point of the pole at every time would take longer than the hackathon. We never build one:
- **In advance:** only terrain skylines (horizon masks and grids), which don't change with time, and only around catalog sites. For the whole catalog that takes minutes on the 4060 (*est.*).
- **On request:** everything that depends on time, in milliseconds, and the skyline of a clicked point, in 1–2 s.

**One implementation of the physics:**
- The physics team writes the rules and the score in Python, with SpiceyPy (the Python library for SPICE), as an example script (**P1**).
- If their functions work on arrays (many points or times in one call), the engine calls them directly. Otherwise the script becomes the reference the engine is tested against (§11.1). Either way, it strengthens our Validity story.
- **Terrain stays separate from the rules.** The functions take the skyline as an input instead of reading the DEM on every call, so the terrain is computed once, on the GPU.
- **The score must be fast** (§7.5): a formula over numbers the engine already has, because it runs for every card, every calendar day and every point of the alternatives map.

**The reference script (P1) has arrived:** the physics team's prototype, now `MenasimMoonV2` (package `lunar_nav`, first retrieved 11–12 Nov, updated 14 Nov, 60 tests). Its public functions are `compute_illumination`, `compute_communication`, `score_point`, `score_metrics` and `score_polygon`. It analyzes one site at a time, calling SPICE per sample (about 9 s per point on a CPU), so the API does not call it. It is the reference the engine is tested against (§11.1), and its outputs (`point_scores.csv`, `point_daily_scores.csv`, `visibility_windows.csv`) are the first golden cases.

**The engine's array functions,** matching the prototype's rules. NumPy arrays go in and out; `horizon_el` is the skyline (720 elevations, 0.5° apart) at panel height for the Sun and at antenna height for contact:

```python
sun_fraction(horizon_el, sun_az, sun_el, sun_radius, earth_az, earth_el, earth_radius) -> f       # P2, eclipses
contact(horizon_el, station_az, station_el, station_moon_el, min_el) -> state                      # P2, P3
score(metrics, slope_deg, dust, weights, policy) -> {value, category, factors, deciding, explanation}  # P5, P12
```

**The physics team's decisions.** Most come from their prototype (`README.md`, `VALIDATION.md` and the notebook's input section, 11–12 Nov). Only P6 and P7 are still open, with the interim values shown.

| # | Question | Used in | Decision | Status |
|---|---|---|---|---|
| P1 | The reference script | Engine tests (§11.1) | The `MenasimMoonV2` prototype | Received 12 Nov, updated 14 Nov |
| P2 | When the Sun counts as visible, and when contact is possible | §7.3 | Sun: any part of the disk, 128-strip disk against the skyline, Earth eclipses included. Contact: the direction to the station clears the skyline at antenna height, and the station sees the Moon above its mask | Decided (prototype) |
| P3 | Earth stations and the minimum elevation | §7.3 | One station, given by coordinates; default Houston (29.7604, −95.3698, 0 m), minimum elevation 0° | Decided (prototype) |
| P4 | The time window of each calculation | §2, §7.4 | From 12 h before landing (landing can come early) to landing + mission length, default 30 Earth days; days are 24-hour bins from the window start; landing years 2026–2030 | Decided (prototype) |
| P5 | The score | §7.5 | `100 × Σ w·grade / Σ w` over L, C, DK, OT, LS, S and 1 − D; weights 0.25, 0.25, 0.15, 0.15, 0.10, 0.10, 0; 6 h sunlight requirement; missing grades count as 0 with a warning; slope > 15° gives score 0 and "excluded"; inside a PSR sets every grade to 0 (score 0, "excluded"); every number is user-configurable; colors 70 and 40; no Sun-and-Earth overlap term. Still open: whether "doesn't want sunlight" means `w_L` = 0 | Decided (prototype V2, 14 Nov), labeled illustrative |
| P6 | Red/amber/green thresholds for the chips | §7.4 | Interim: green ≥ 60%, amber 30–59%, red < 30%. Slope: green ≤ 5°, amber 5–10°, red > 10° | **Open** |
| P7 | What makes a landing time "good" | Calendar, "Next good landing" (§7.6) | Interim: a green score | **Open** |
| P8 | Suspicious elevation data | Data warnings (§7.3) | The warning list in §7.3 | Decided (prototype) |
| P9 | The uncertainty range | §7.3 | Low and high skylines from the `_ERR` rasters, terrain and observer moved in opposite directions; sensitivity bounds, not confidence intervals | Decided (prototype) |
| P10 | One height or two? | §2, §8.1 | Two: panel (default 2 m) and antenna (default 3 m) | Decided (prototype) |
| P11 | The area for nearby alternatives | §7.6 | A user-drawn polygon; 1 km cells by default, at most 2,500; refine with a smaller polygon (300 m) | Decided (prototype) |
| P12 | Which factor decided a result | "Explain" (§7.7), the score breakdown | The largest weighted penalty, all ties reported, with raw value, weight share and points lost | Decided (prototype) |

**Also taken from the prototype:**
- Kernels: the DE440 set and `MOON_ME_DE440_ME421` (§6.1, §7.1).
- CN+S for sunlight, geometric for contact (§7.1).
- Horizon reach and steps: per point `min(200 km, √(2R|h|) + 10 km)`, 40 m then 240 m, no terrain ceiling (§7.2).
- The slope source: NASA's published 20 m slope map, native pixel, no DEM-fit fallback (§7.2).
- Unknown as a third state (§7.3).
- The mock dust formula (§7.5).
- The 60 s event refinement is **not** adopted: the engine keeps its 10-minute grid, and tests allow one step of difference (§7.3).

**GMAT checks (validation only).** The engine computes everything with SPICE. The physics team uses GMAT only to check basic results:
- **`gmat_check.csv`:** Sun and Earth positions in a Moon-fixed frame at agreed times. Columns: `utc, body, x_km, y_km, z_km`. A header line gives the GMAT version and **which Moon frame** was used; the importer handles both PA and ME.
- **Delivery:** into `data/sources/gmat/`, checksummed like every other source and validated by Pydantic on every build. The comparison appears on the validation page (§11.4).

### 12.4 3D hooks (3D teammate ↔ 2D app)

- **Screen 3:** `<SurfaceView scenario time />`, with data hooks for:
  - the heightmap
  - the lit/unlit mask (from the shared function)
  - the far-only mask
  - the Sun and Earth azimuth, elevation and radius at time t
  - the lander's state

  The axis mapping is in §9.3. Sample files for one site are ready from day 1.
- **Screen 1:**
  - `<Globe time />` wraps the orbit component.
  - It is fed by `/ephemeris/global`.
  - Its pins are fed by `/sites` and the verdicts.

### 12.5 Repository and process

- **Repository:** one repo with `engine/`, `api/`, `build/`, `web/`, `data/` and `docs/`.
- **Ownership:** CODEOWNERS gives each folder one owner.
- **Pull requests:** every pull request runs CI, and `main` is always deployable.
- **API changes:** made only through the Pydantic models, followed by regenerating the TypeScript client and the MSW test data.
- **Integration checkpoints:** about every 6 hours.

---

## 13. Plan

### 13.1 Before kickoff (now until 13 Nov, no code)

- **Spec author and assistant:** finish this spec and the implementation plan.
- **Product:** the demo story; UI wording; video or slides.
- **Data/ML:** verify the NASA sources (Appendix B) and list the exact files.
- **Physics team:** the catalog, with a source for each south-polar site; the definitions and values for placeholders P2–P12 (§12.3), in writing; validation cases (sites and times); learn the Horizons API and plan the GMAT checks. The example script (P1) is code, so it waits for kickoff.
- **3D:** choose a lander model and check its license; sketch Screen 3.
- **Everyone:** install the tools, including CUDA on the 4060.
- **Data/ML:** download the NASA data early. This is allowed (§1.4).

### 13.2 Gates (times count from the actual kickoff; hard deadline 15 Nov 23:59)

| Gate | When | Done means |
|---|---|---|
| **G1: Skeleton** | Kickoff + ~4 h | <ul><li>The repo exists and CI is green.</li><li>The API serves sample answers in the agreed format.</li><li>The app shell shows the polar map with one NASA layer.</li><li>The data is downloaded.</li><li>GPU timings are measured, and we know the hosting.</li></ul> |
| **G2: First real numbers** | Kickoff + ~12 h | <ul><li>One catalog site works end to end: real mask → summary and series → a card with its verdict, live panel, sky view and slider.</li><li>The Horizons check passes.</li></ul> |
| **G3: Must complete** | Day 2, morning | <ul><li>All catalog sites are built.</li><li>Screens 2 and 4 work on real data, with score and export, the warnings strip and the score settings panel.</li><li>Custom points return numbers.</li><li>The minimal validation page exists.</li><li>A test URL is online.</li></ul> |
| **G4: Feature freeze** | Day 2, ~15:00 | <ul><li>Each chosen Should and Could is done or cut.</li><li>The app is deployed to the judging host.</li><li>The demo snapshot exists.</li><li>Rehearsal 1 is done.</li></ul> |
| **G5: Submitted** | Day 2, ~21:00 (buffer before 23:59) | <ul><li>All six parts are in.</li><li>Rehearsal 2 and the recording are done.</li></ul> |

### 13.3 Cut order if we fall behind

1. **Nice:** document requirements, the mission brief, the dust map layer (the dust index stays, because the score uses it).
2. **Could:** power, the command bar, the Apollo check.
3. **Should,** in this order:
   1. Uncertainty ranges
   2. The Screen 1 globe
   3. Choosing another Earth station (the score settings panel and the warnings strip are Must and are not cut)
   4. The topographic layer
   5. Nearby alternatives
   6. Screen 3 (the sky view already covers the core need)
   7. "Explain"
   8. The landing calendar and "Next good landing". These are kept longest because the demo uses them.

**Never cut:**
- the Must screens, including the sky view and countdowns
- the demo snapshot
- the minimal validation page

---

## 14. Submission and pitch

| Part | Owner | Content |
|---|---|---|
| Summary | Product | The problem, what we built and why it matters, in criteria order |
| Demo | Product + all | A 30-second video of the slipped-launch story (§3), or 7 slides |
| Public link | Backend | The static app URL. It stays stable even if the API moves, because the API address lives in `config.json`. |
| Project details | Product + backend | Architecture, "one physics", data, validation, limitations |
| Data & AI disclosure | Data/ML | <ul><li>**Data:** generated from the manifest. If we ship the dust layer, it says that the dust data is simulated.</li><li>**AI:** Claude at runtime (the command bar and document requirements); AI coding assistants; AI-drafted content that people reviewed (catalog extraction with sources, test sentences, script drafts).</li></ul> |
| References | Data/ML | Generated from the manifest, plus the papers and tools used |

**7-slide outline, mapped to the criteria:**
1. **The problem:** schedule slips, and existing tools that are hard to use for quick comparisons (Relevance).
2. **Who it's for, and what they can do in seconds:** includes the measured time saved (Impact).
3. **Demo stills:** cards, sky view, timeline, calendar (Presentation).
4. **What's new:** one physics, the calendar, "what blocks the Sun" (Creativity).
5. **How we know it's right:** Horizons, PSR, QuickMap, GMAT (Validity).
6. **The architecture in one picture:** whole-Moon ready and open source (Impact).
7. **The team, and what comes next.**

**README:** screenshots, the architecture diagram, the validation summary, how to run it, and how to add a site or region.

---

## 15. Trade-offs and risks

### 15.1 Trade-offs

| Decision | What we gain | What we give up |
|---|---|---|
| The server computes scenarios | One physics; a lightweight browser | A running server is needed (the snapshot covers the demo) |
| Horizons are precomputed; the browser only compares | Exact physics in every shadow | Shadows for new custom points need a GPU |
| Earth contact = the line to one chosen station clears the terrain, and the station sees the Moon (the physics team's rule) | Matches a real link to a real place | Depends on the station chosen; the Houston default is a demonstration location, not an antenna |
| The physics team's weighted-sum score (§7.5) | One agreed formula, simple to explain, weights users can change, free rescoring | Doesn't reward having the Sun and Earth up at the same time; the weights are illustrative; ignores power; a missing grade lowers the score instead of withholding it |
| Panels always face the Sun | Simpler power math | Too optimistic for landers with fixed panels |
| Times shown in 10-minute steps | Honest precision; the same step as the engine | Nothing |
| No accounts or database; all state in the URL | Simple, secure, shareable | No saved workspaces |
| Insights from templates | Reliable, free, testable | Less natural wording |
| Mock dust in the score, weight 0 by default, labeled "simulated" | Shows the dust capability the physics team wants, without simulated data moving default scores | Only users who raise the dust weight see its effect; disclosed in the breakdown and the Data and AI disclosure |
| No relay satellites | Focus on the challenge's direct-to-Earth question | Missions that rely on a relay aren't modeled |
| Custom points only in 84–90°S | Bounded storage and compute | No clicking outside the cap |
| Exact masks for every alternatives point (the physics team's design) | No approximate screening | Needs a GPU for large areas; capped on a CPU host |
| A fixed 10-minute grid instead of the prototype's 60 s event refinement | Search, calendar and alternatives stay fast | Window edges can differ from the reference by up to 10 minutes |
| A south-polar catalog only | Focus; bounded data work | The challenge's suggestion of Apollo and other non-polar sites isn't covered (regions can be added later) |
| OpenLayers | Polar maps work | Less polished defaults |

### 15.2 Risks

| Risk | Mitigation |
|---|---|
| One person owns both the backend and the 2D web app | Hand Screen 4 or the data build to someone else; contracts and sample data exist from hour 1 |
| Unknown hosting or GPU | Capability flags; measure in hour 1; judging mode as the fallback |
| Surprises in the NASA data (files, coverage, formats) | Verify by reading before kickoff; download in hour 1; fall back to coarser terrain with a label |
| Physics bugs (azimuth, frame, axes) | Write the known-answer tests first; check against Horizons before G2 |
| Polar map setup is harder than expected | A spike in the first 4 hours; fall back to a static image instead of tiles |
| The 3D views slip | Both are Should; the sky view (a Must) covers the core need |
| Scope grows from the criteria-driven additions | The cut order, plus the feature freeze at G4 |
| Physics deliverables (P1–P12) arrive late, or their script is too slow to call directly | Every placeholder has an interim value (§12.3); a slow script becomes the test reference |
| The demo fails live | Snapshot, a recorded video, two rehearsals |
| Fatigue | Sleep in shifts; the cut order lowers pressure |

---

## 16. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| 1 | Catalog: which south-polar sites, with coordinates and sources (inside the 20 m DEM coverage) | Physics team | Before kickoff |
| 2 | Red/amber/green thresholds for the chips (P6); the score is decided (§7.5) | Physics team | Day 1 |
| 3 | Confirm: the card header is the mission verdict, live status is separate, and the timeline is aligned by mission elapsed time | Product | Before kickoff |
| 4 | Screen 1 points of interest: the data source for each. The list itself is approved: water and ice in PSRs, slope hazards, areas with no Earth contact | Product + Data/ML | When the Resources tab opens (13 Nov) |
| 5 | Globe: keep the kit's approximate terrain shadows, with a "context view" label, or switch them off? The physics team answered "✓, plus a topographic elevation map". Still open: do elevation colors replace the lighting, or sit beside it? | Physics team + 3D | Before kickoff |
| 6 | Hosting at the event (is there a GPU?) and the host for the judging period | Organizers / team | Kickoff + 1 h |
| 7 | Resolved 12 Nov: GMAT is for validation only. Updated 14 Nov: Earth contact uses one chosen station, Houston by default (§7.3) | — | — |
| 8 | Which lunar frame does Horizons use for observers on the Moon? | Physics | Day 1 |
| 9 | Resolved 13 Nov: Moon Trek has no lighting product. It gives us basemap tiles and an elevation check (§6.1, §9.3, §11.4) | — | — |
| 10 | Resolved 14 Nov: the mock dust index is the physics team's formula (§7.5) | — | — |
| 11 | Battery presets (only if power is built) | Product + physics | Day 2 |
| 12 | Video or slides | Product | Before kickoff |
| 13 | Owners for Screen 3 and Screen 1 | Team | Before kickoff |
| 14 | Screen 3: keep the product spec's AR pins (water/ice, hazards)? At what priority? | Product + 3D | Before kickoff |
| 15 | Screen 3: when the user moves the standing point, is that visual only (numbers stay with the lander), or does it create a new point with its own numbers? | Product + 3D | Before kickoff |
| 16 | The physics team's open items P6 and P7, and whether "doesn't want sunlight" means `w_L` = 0 (P5) | Physics team | See §12.3 |

---

## 17. Glossary

| Term | Meaning |
|---|---|
| Azimuth | Compass direction in degrees, clockwise: 0° is north, 90° is east |
| Elevation | Height above the horizon, in degrees |
| Clearance | A body's elevation minus the terrain horizon in its direction |
| Blocking distance | How far away the terrain that sets the horizon in a given direction is |
| Bundle | The versioned data package produced by the build |
| Capability | A feature flag reported by `/meta` |
| CDN / static host | A network that serves ready-made files quickly from near the user |
| COG | Cloud-Optimized GeoTIFF: a raster that can be read one window at a time |
| Deciding factor | The factor (sunlight, Earth contact, slope or dust) that cost a result the most points; ties are all named |
| DEM | Digital Elevation Model: a grid of ground heights |
| DSN | NASA's Deep Space Network: antenna complexes at Goldstone, Madrid and Canberra. Possible presets for the Earth station (Should) |
| Earth station | The point on Earth that Earth contact is checked against, with its minimum elevation. Default: Houston, a demonstration location |
| DTE / Earth contact | Direct-to-Earth radio contact, without a relay satellite |
| Event mode / judging mode | Hosting with a GPU / hosting on a free CPU server |
| GMAT | NASA's General Mission Analysis Tool. Here it is used only to check basic results. |
| GPU | Graphics card; very fast at repeating one calculation many times |
| Horizon mask / grid | The skyline of one point (used for numbers) / of 40,000 points (used for shadows) |
| Libration | The Moon's apparent wobble. Seen from the pole, it moves the Earth across the sky by several degrees. |
| LOLA | Lunar Orbiter Laser Altimeter, an instrument on NASA's Lunar Reconnaissance Orbiter |
| Lunar day | 29.53 days, from sunrise to sunrise |
| Mission card | One scenario on Screen 2: a site, a landing date, a mission length, a panel height and an antenna height, with its verdict, live panel and sky view. Up to 3 side by side |
| Mission elapsed time (MET) | Time since landing |
| NPY | NumPy's array file format |
| Parallax | The shift in a body's direction between the Moon's center and its surface |
| P1–P12 | The physics team's decisions (§12.3). Most are decided; the open ones use an interim value |
| PSR | Permanently shadowed region |
| RAG | Red, amber, green |
| Scenario | Site + landing time + mission length + panel height + antenna height (+ power settings). It is scored with the spacecraft settings that all cards share. |
| Simulated (mock) data | Made-up data that demonstrates a feature. It is always labeled as simulated. |
| Site finder | A Screen 2 entry point: mission and spacecraft parameters in, suggested sites and landing dates out |
| Site frame | East, north and up at the site ("the site's compass") |
| Skyline | The horizon actually seen from a point: for each direction, how many degrees above the flat horizon the highest terrain reaches. Stored as a horizon mask (one point) or a horizon grid (many points) |
| Spacecraft settings | The Earth station and the score settings (weights and thresholds); shared by all cards |
| SPICE | NASA/JPL's toolkit and data for planetary positions and orientations |
| SpiceyPy | The Python library for SPICE |
| Topographic layer | A map layer that colors the ground by its elevation |
| `vis_el` | The elevation that must clear the terrain for a body to count as "visible" |
| Weights | How much each grade counts in the score. Default: the physics team's 0.25 / 0.25 / 0.15 / 0.15 / 0.10 / 0.10 / 0 (P5) |
| Unknown time | Time when missing data means visibility can't be decided. Never counted as dark or as no contact |
| L, C, DK, OT, LS, S, D | The score's grades: mean visible Sun-disk fraction, mean daily contact fraction, longest darkness, longest contact outage, sunlight at landing (pass/fail), slope, simulated dust index |
| Mission window | From 12 h before landing to landing + mission length. All metrics and the score use it |
| Window | A stretch of time when something is true: Sun, Earth contact, or both |

---

## Appendix A: Estimates to measure at kickoff

| Quantity | Estimate |
|---|---|
| Mask, one site | About 1 million lookups per height pass (720 directions × about 1,460 steps), plus the low and high variants; under 1 s even on a weak CPU |
| Grid, one site | 5–15 billion lookups; seconds on the RTX 4060, minutes on a CPU |
| Catalog build (about 30 sites) | Minutes on the 4060 |
| Scenario evaluation | About 1 ms per month of mission; tens of ms for 5 years |
| Series, one month | About 4.5k steps; 150–300 KB of JSON, much smaller gzipped |
| Landing calendar, one year | Under 1 s |
| Nearby alternatives | One mask per point: 2,500 points in seconds on the RTX 4060; the CPU cap from measured speed (the prototype took about 9 s per point, one at a time) |
| Near-window size (convergence test) | 10–40 km |
| API memory with PyTorch loaded | A few hundred MB above the base process |
| Custom point | Numbers in 1–2 s; grid in a few seconds (GPU) |

## Appendix B: Facts to verify in the data step

- **LOLA DEMs (20 m and 240 m south-polar products):**
  - file names
  - coverage
  - projection
  - reference radius (1,737.4 km?)
  - whether they are COGs
  - whether an error product exists, which the uncertainty range needs
- **NASA layers** (average illumination, PSR, slope): which products exist, and at what resolution.
- **SPICE kernels:** current versions, and whether newer lunar orientation kernels are recommended.
- **Earth orientation:** resolved 14 Nov: `earth_1962_260806_2126_combined.bpc` covers 2026–2031, observed until 2026-08-06 and predicted after.
- **JPL Horizons:**
  - batch keywords for an observer on the Moon: `CENTER='coord@301'`, `COORD_TYPE`, `SITE_COORD`, `QUANTITIES='4'`
  - which lunar frame it uses
- **Artemis III:** NASA's statement that the candidate regions lie within 6° of the pole.
- **Moon Trek:**
  - the licence and attribution wording for the tile layers and the DEM
  - that its south-polar projection (IAU2000:30120) matches our region's projection
  - which exact tile layer ids to use (from its layer list; the catalog had 347 south-pole layers)
  - the height reference of the elevation service
  - whether `exportImage` can deliver site-sized DEM windows (not tested)
- **Other tools:** how to use QuickMap TerrainShadows. QuickMap has no documented API and blocks embedding in other sites, so the app only links to it ("View in QuickMap"; the link opens `quickmap.lroc.im-ldi.com/?bodyview=moon&map_id=lroc`, with no position parameter found).
- **Free hosts:** memory and sleep limits for judging mode.
- **Globe kit:** its three.js version (r180) is compatible with our pinned three.js and react-three-fiber versions.
