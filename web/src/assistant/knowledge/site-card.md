# A site card (Site calculator)

## Header
- **Letter badge** (A, B, C, …) and the **name**, with a tag: "SITE 07" for a catalog site, "CUSTOM" for a typed or clicked point. Clicking the name selects the site in the explorer.
- **Rank badge** "#1 78": rank and grade from the ranking function; the best site gets green side lines. (The ranking function is still a stand-in; the score box below is the real calculation.)
- **Edit input**, **eye** (show/hide in the explorer), **trash** (delete), **chevron** (collapse/open).
- **Status row**: LIGHT (Sunlit / Shaded), EARTH DTE (direct-to-Earth contact: Clear / Blocked / no station), SLOPE (Gentle / Moderate / Steep). Each has a colored dot. LIGHT and EARTH DTE are the state **at the viewed mission time**; "Unknown" means the terrain in that direction is missing.

## Editing (Edit input, or a new site)
Changes wait until **Apply site X** is pressed.
- **Site name** (optional, up to 40 characters).
- **Catalog site**: pick one of the 30 sites, or "Custom site (latitude, longitude)".
- **Latitude / Longitude**: typed like `87.5° S` and `45° E`. Longitude is east-positive 0–360° (a west value is converted). Custom points must be between 84°S and 90°S.
- **Landing date** (2026-01-01 to 2030-12-31) and **Time / UTC** (10-minute steps). **↻ +29.5 d** adds one lunar day (29 d 12 h 40 min): the same Sun angle a month later.
- **Time on the Moon**: days and hours, 1 to 365 days; presets 7 days, 14 days, 1 lunar day (29.53), 2 lunar days, 90 days, 180 days, 1 year.
- **Panel** and **Antenna** heights: 1 to 10 m above the ground. Sunlight is checked at panel height, contact at antenna height. Higher usually clears nearby ridges.
- **Earth stations (direct contact)**: NASA Deep Space Network (Goldstone, Madrid, Canberra), ESA ESTRACK (New Norcia, Cebreros, Malargüe), Houston (a demonstration location, not an operational antenna, and the default), or a **custom location** (latitude, longitude, altitude, lowest Moon elevation the station accepts). Choosing several stations lets the card switch "Results for station" between them.

## Results: Live conditions
- **SUN ELEV. / EARTH ELEV.**: elevation in degrees at the viewed time. **LOCAL SLOPE**: the site's slope (20 m slope map). **DUST**: n/a.
- **Mission time** slider with **Play** (6 hours of mission per second). It is shared by all cards.
- **Live panel** for the Sun and the Earth: elevation, terrain height in that direction, **clearance** (elevation minus terrain), Visible/Hidden, and countdowns ("sunset in …", "sunrise in …", "Earthset in …", "Earthrise in …"). "Station cannot see the Moon" means the Earth is up but the chosen station is on the far side of the Earth or below its mask.

## Results: Whole mission
- **Score box**: score 0–100 with color and icon (✓ good ≥ 70, ! marginal ≥ 40, ✕ poor below 40, ⊘ excluded). Hover for the breakdown. Badges: "excluded: inside a PSR", "excluded: slope above X°", "score uses missing data", "custom settings". It is always labeled illustrative.
- **Chips**: Sun %, Earth %, Slope, each green/amber/red with its reason on hover.
- **Warnings strip**: the data and score warnings for this scenario (see the "warnings" document); "Always true" lists notes that apply to every result.
- **Metrics**: Sun + Earth together, Sunlight (L), Station contact (C), Earth above horizon, Longest darkness, Longest comm gap, First sunlight, First dark after landing. "unavailable" means missing terrain made the number unknowable.

Sources: `web/src/ui/PointCard.tsx`, `MissionLength.tsx`, `HeightControl.tsx`, `StationPicker.tsx`, `stationNetworks.ts`, `LivePanel.tsx`, `VerdictChips.tsx`, `ScoreBox.tsx`, `WarningsStrip.tsx`.
