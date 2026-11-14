# Build: Lunar Landing Site Navigator demo (NASA Space Apps 2026)

We're competing in the NASA Space Apps 2026 challenge "Lunar Landing Site Navigator": https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

The challenge asks for a tool that lets mission planners, educators and the public compare lunar landing sites and dates quickly. It shows where the Sun and Earth are relative to the local horizon, which governs solar power and direct-to-Earth (DTE) communication. The scenario it stresses: a mission's schedule slips, and the team must quickly re-evaluate other dates at the same site, or other sites nearby.

Build a working demo in this directory:

**I type mission requirements in plain English → the app shows the best sites and landing dates, and explains why the others fail. I can also pick any site and date and see the Sun, Earth, horizon, and time left before sunset and Earthset.**

Example inputs:
- "A 14-day CLPS lander landing sometime between March and August 2027. Needs sunlight at least 70% of the time, can't survive more than 48 hours of darkness, and needs Earth in view for at least half the mission with no comm gap over 72 hours."
- "Our March 2027 landing at the Shackleton connecting ridge slipped by three months. Find the best dates from June to September 2027 there and at nearby south-pole sites. We need at least 5 days of sunlight after touchdown and Earth in view at landing."

Before you start, open the challenge page's Resources tab. If it lists datasets or sites that differ from what's below, tell me before deviating.

The design below is decided. Treat this prompt as the approved spec: save it as `docs/spec.md`, make a short implementation plan, then build. Only ask me if you're genuinely blocked.

## Architecture
- `backend/`: Python 3.12, uv, FastAPI, Pydantic v2, spiceypy, NumPy, rasterio, pyproj, anthropic SDK, pytest, ruff, mypy.
- `frontend/`: React + Vite + TypeScript, TanStack Query, ECharts. API types are generated from the backend's OpenAPI schema with openapi-typescript, never hand-written.
- Separate processes: API on :8000 (CORS for the Vite dev server), web on :5173.
- No database. Data are files under `data/` (git-ignored), produced by an offline build step. The only runtime writes are cached horizon masks for custom sites.
- Two phases:
  1. **Offline data build** (`uv run build-data`): download the SPICE kernels, compute the ephemeris table, read LOLA terrain windows, compute horizon masks for the catalog. Idempotent: reruns skip files that exist.
  2. **Runtime**: the API loads those files at startup and answers with vectorized NumPy. No SPICE calls while handling requests.

## Physics

### Ephemeris table (offline, SPICE)
- Kernels from https://naif.jpl.nasa.gov/pub/naif/generic_kernels/: `lsk/naif0012.tls`, `pck/pck00011.tpc`, `pck/moon_pa_de421_1900-2050.bpc`, `fk/satellites/moon_080317.tf`, `spk/planets/de440s.bsp`.
- Use frame `MOON_ME` from the DE421 kernels. The LOLA terrain models are referenced to it, so terrain and geometry line up with no transformation. The Moon's libration and orbital variations come from these kernels, so Earth's wobble in the sky is real, not modeled.
- Every 10 minutes from 2026-01-01 to 2031-01-01 UTC, store the Sun and Earth position vectors relative to the Moon's center: `spkpos(body, et, "MOON_ME", "LT+S", "MOON")`. Save as `data/ephemeris.npz` (`et`, `sun`, `earth`).

### Per-site sky position (runtime, NumPy)
For a site at latitude φ and east longitude λ on the 1737.4 km sphere, with observer radius = R + ground height + mast height:
- up = (cosφ·cosλ, cosφ·sinλ, sinφ), east = (−sinλ, cosλ, 0), north = up × east
- d = body_vector − observer_radius·up. This subtraction is the parallax, ~0.26° for Earth.
- azimuth = atan2(d·east, d·north) mod 360, clockwise from north
- elevation = atan2(d·up, hypot(d·east, d·north)); distance = |d|

### Terrain horizon masks (LOLA via rasterio)
- The Moon has no atmosphere, so no refraction: the horizon is the local terrain or the edge of the lunar sphere.
- DEMs, best available first:
  - South pole, from NASA GSFC PGDA https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/:
    - `LDEM_80S_20MPP_ADJ.TIF` (20 m/px, ~2.7 GB): near field
    - `LDEM_60S_240MPP_ADJ.TIF` (240 m/px): far field
  - Elsewhere: a global LOLA-based DEM, e.g. SLDEM2015 (within ±60°) or a LOLA GDR global `LDEM_*` grid.
    - Find the official source (PDS Geosciences Node or PGDA) and verify the URL and format.
    - Prefer a GeoTIFF or COG you can range-read.
    - Record the choice in the README.
- Never download whole files. Read windows via `/vsicurl/` HTTP range requests: ±8.5 km of near-field data and ±210 km of far-field data around each site.
- GDAL env: `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR`, `CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.TIF`. The PGDA server doesn't support multi-range requests.
- Take projection details from each file's CRS: polar stereographic for the pole products, equirectangular for global grids. Heights are meters above the 1737.4 km sphere.
  - Sample terrain by converting (lat, lon) → DEM CRS with pyproj, so one ray-marching routine works for every projection.
- Mask: for each of 720 azimuths (0.5° steps), the highest terrain elevation angle along a great-circle ray. Use near-field data out to 8 km and far-field data out to 200 km.
- Use exact curvature: elevation = atan2(r_t·cos(s/R) − r_o, r_t·sin(s/R)), where r_t = R + terrain height, r_o = observer radius, s = ground distance.
- Cache each mask at `data/horizons/{site_id}.npz` together with its DEM sources and resolutions. The UI shows each site's horizon quality, e.g. "20 m terrain" or "~240 m terrain".

### Visibility rules
- **Sun visible:** elevation + asin(695700 km / distance) > mask(azimuth). Any part of the disk above the terrain counts.
- **Earth visible (DTE):** elevation > mask(azimuth) + earth_min_clearance_deg.
- **Solar elevation angle** is the key power metric. Report both:
  - elevation above the geometric horizon, which drives panel incidence
  - clearance above the terrain horizon, which shows how close the Sun is to being blocked

## Sites
- `backend/data/sites.yaml` (versioned) holds a curated catalog of ~20–30 sites, grouped by category:
  - **Apollo**: 11, 12, 14, 15, 16, 17
  - **CLPS and other commercial landers**: e.g. IM-1, Blue Ghost Mission 1, IM-2, and announced future targets
  - **Other countries**: e.g. Chang'e 3/4/5/6, Chandrayaan-3, SLIM
  - **South pole candidates**: Artemis III candidate regions, the Shackleton connecting ridge
- Each entry has: id, name, category, planetocentric latitude, east longitude, `source` (citation or URL), and `exact | approximate`.
- Take coordinates from primary sources; never invent them.
- Far-side sites (e.g. Chang'e 4/6) never see Earth. Keep them in the catalog; they're a good teaching contrast.
- **Custom sites:** the user enters lat/lon; the API computes the horizon mask on demand (a few seconds is fine; show progress) and caches it.

## Requirements parsing (Claude API)
- Pydantic `MissionRequirements`, with units in the field names and defaults where noted:
  - `landing_earliest`, `landing_latest`: UTC, default the next 12 months within the table span
  - `mission_duration_days`: default 14
  - Constraints, all optional (null means no constraint):
    - `min_sun_fraction`, `max_darkness_hours`
    - `min_earth_fraction`, `max_comm_gap_hours`
    - `min_sunlight_after_landing_hours`, `require_earth_at_landing`
  - `earth_min_clearance_deg`: default 0
  - `mast_height_m`: default 2
  - Site selection, both optional:
    - `site_ids`: filter by catalog id
    - `site_categories`: filter by category
    - `custom_sites`: list of {name, lat_deg, lon_east_deg}
  - `assumptions: list[str]`: what the model inferred
  - `unsupported: list[str]`: requests it couldn't map
- `POST /api/v1/requirements/parse {text}` uses the `anthropic` SDK: `client.messages.parse(..., output_format=MissionRequirements)`, model from env `CLAUDE_MODEL` (default `claude-opus-5-5`).
  - Pass the catalog (ids, names, categories) in the prompt so names like "Shackleton ridge" or "nearby south-pole sites" resolve to ids.
  - Use the claude-api skill for current SDK details.
  - Handle API errors and refusals with a clear message.
- The LLM only extracts requirements. **Every number shown in the results comes from the engine.**
- With no API key configured, the UI hides the text box and shows only the form.

## Engine (runtime)
- Per site, compute Sun/Earth az/el and boolean visibility arrays over the whole table span once (vectorized), cached in memory.
- Also precompute, for every table index, the time until the next visibility change. This yields time to sunset/sunrise and to Earthset/Earthrise in O(1) per query.
- **Search:** candidate landing times every 6 h between `landing_earliest` and `landing_latest`. For each, evaluate the window [t, t + duration]:
  - Sun fraction and longest continuous darkness
  - Earth fraction and longest comm gap
  - sunlight remaining after touchdown, and whether Earth is visible at touchdown
  - Use cumulative sums for the fractions.
- A landing time is feasible if every set constraint holds. Per site, report:
  - feasible landing count
  - best landing time: the largest minimum normalized margin across constraints
  - the metrics at that time
  - if never feasible: the constraint that fails most often and its typical shortfall
- Ranking: sites with any feasible date first, then by feasible-date count, then by best margin.
- **Plain-language summaries:** for each snapshot and search result, build one or two sentences from the computed numbers with a template, not the LLM. Example: "The Sun skims 1.4° above the ridge and sets in 3 d 4 h. Earth stays in view for 9 more days."
- Target: under 1 s to search the whole catalog over a 1-year landing range.

## API (`/api/v1`)
- `GET /health`
- `GET /sites`: catalog with category and horizon quality
- `POST /sites/custom` {name, lat_deg, lon_east_deg}: computes or loads the mask and returns the site
- `POST /requirements/parse`
- `POST /search` (body: `MissionRequirements`): ranked results plus the feasibility matrix (site × landing time)
- `GET /sites/{id}/conditions?time=`: snapshot data:
  - Sun and Earth az/el
  - horizon height in each body's direction
  - visibility
  - time to sunset/sunrise and Earthset/Earthrise
  - plain-language summary
- `GET /sites/{id}/timeline?start=&end=`: chart series (az/el, horizon height in each body's direction, visibility flags) plus the list of sunlight and DTE windows (start, end, duration)
- `GET /sites/{id}/horizon`

## UI (one page)
1. **Ask:** requirements text box with 3 clickable example prompts (including the schedule-slip one) and a "Find sites" button.
2. **Requirements:** parsed requirements as an editable form, with the assumptions and unsupported items listed. Editing re-runs the search without calling the LLM.
3. **Results:**
   - ranked table: rank, site, category, feasible dates, best landing date, Sun %, longest darkness, Earth %, longest gap, failing constraint
   - feasibility heatmap: sites × landing dates (green feasible, red not)
4. **Compare:** pick 2–4 sites (from results, catalog or custom coordinates) and one date, shown side by side. Each card shows:
   - Sun elevation and terrain clearance
   - time to sunset (or sunrise)
   - Earth elevation and time to Earthset (or Earthrise)
   - Sun % and Earth % over the mission
   - the plain-language summary
5. **Site detail:** for a selected site and date:
   - **sky view:** horizon profile (mask vs azimuth) with Sun and Earth drawn at their current positions and their tracks over the mission. A time scrubber with play/pause animates it across a lunar day, and the snapshot numbers update live.
   - **timeline:** Sun and Earth elevation against the horizon in their direction, with sunlight and DTE bands
   - sunlight and DTE window list
6. Make "time left before sunset / Earthset" the most prominent number wherever a single time is selected.

## Verification
- Test: table method vs `spiceypy.azlcpo` (exact per-site, `LT+S`, `MOON_ME`) at 3 sites × 100 random times; max error < 1 arcsec.
- Test: flat synthetic terrain gives the geometric horizon dip; an isolated synthetic mountain gives the analytic angle within 0.05°.
- Test: the same synthetic DEM in a polar stereographic CRS and in an equirectangular CRS gives masks that agree within 0.05°.
- Physical sanity tests over the full table span:
  - Apollo 11: Earth always visible
  - Chang'e 4: Earth never visible
  - Shackleton connecting ridge: |Sun elevation| always < 3°
- Tests for the engine: fractions, longest runs, next-transition times, windows cut off at the span edges.
- `ruff`, `mypy`, `pytest` and `tsc --noEmit` all pass.
- Run the app end to end with both example prompts. Report the top 3 sites for each, the response times, and one custom-site mask computation time.

## Out of scope
3D, 2D basemaps or imagery, deployment, Docker, auth, database, GMAT/orbit calculations, mobile polish.

## Reference
`../github-project/CLPS-Lunar-Mission-Browser` is another team's public (MIT) project for the same challenge. It's a useful reference for kernel handling, LOLA window reads and horizon code. Don't copy its architecture: this design differs (offline ephemeris table, requirement-driven search, global catalog). Its `data/kernels/` already has the SPICE kernels; copy them instead of downloading.

Also deliver a README:
- how to run (`build-data`, API, web) and env vars
- assumptions and limitations, including DEM resolution per region and no refraction
- data sources with links
- a "How AI tools were used" section, which the Space Apps submission requires
