# A site card (Site calculator)

## Header
- **Letter badge** (A, B, C, …) and the **name**, with a tag: "SITE 07" for a catalog site or the card number for a typed or clicked point. Clicking the name selects the site in the explorer. The chevron collapses or opens the card.
- **Rank** "#1" (from a sample ranking function; the best site gets green side lines) and **Weighted Score NN / 100**: the real score under the current Grading Weights.
- **Edit site** (pencil) and **Delete** (trash).
- **Status row**: **Light** (Sunlit / Shaded, with the Sun's elevation), **Earth DTE** (direct-to-Earth contact: Clear / Blocked / no station, with the Earth's elevation), **Slope** (Gentle / Moderate / Steep, with the local slope). Each has a colored dot. Light and Earth DTE are the state **at the viewed mission time**; "Unknown" means the terrain in that direction is missing.

## Editing (Edit site, or a new site)
Changes wait until **Apply site X** is pressed. Each field has a small help button (?).
- **Site Name** (optional, up to 40 characters): to recognize it on the map and in comparisons.
- **Catalog Site**: pick one of the 30 sites, or "Custom site (latitude, longitude)".
- **Latitude / Longitude**: latitude 84° S to 90° S (e.g. `88.75 S`); longitude in degrees east 0–360°.
- **Landing Date** (2026 through 2030) and **Time / UTC** (10-minute steps). **↻ +29.5 d** adds one lunar day (29 d 12 h 40 min): the same Sun angle a month later.
- **Time on the Moon**: days and hours, 1 to 365 days; presets 7 days, 14 days, 1 lunar day (29.53), 2 lunar days, 90 days, 180 days, 1 year.
- **Panel** and **Antenna** heights: 1 to 10 m above the ground. Sunlight is checked at panel height, contact at antenna height. Higher usually clears nearby ridges.
- **Earth stations (direct contact)**: NASA Deep Space Network (Goldstone, Madrid, Canberra), ESA ESTRACK (New Norcia, Cebreros, Malargüe), Houston (a demonstration location, not an operational antenna, and the default), or a **custom location** (latitude, longitude, altitude, lowest Moon elevation the station accepts). Choosing several stations lets the card switch "Results for station" between them.

## Results (an open card)
- **Mission Time** slider with **Play** (6 hours of mission per second), shared by all cards.
- The **Earth station** in use (or "Results for station" when several were chosen).
- **Live panel** for the Sun and the Earth: elevation, terrain height in that direction, **clearance** (elevation minus terrain), Visible/Hidden, and countdowns ("sunset in …", "sunrise in …", "Earthset in …", "Earthrise in …"). "Station cannot see the Moon" means the Earth is up but the chosen station is on the far side of the Earth or below its mask.
- **Score Details** (expand it):
  - **Score box**: score 0–100 with color and icon (✓ good ≥ 70, ! marginal ≥ 40, ✕ poor below 40, ⊘ excluded). Hover for the breakdown. Badges: "excluded: inside a PSR", "excluded: slope above X°", "score uses missing data", "custom settings". Always labeled illustrative.
  - **Chips**: Sun %, Earth %, Slope, each green/amber/red with its reason on hover.
  - **Warnings strip**: the data and score warnings for this scenario (see the "warnings" note); "Always true" lists notes that apply to every result.
  - **Metrics**: Sun + Earth together, Sunlight (L), Station contact (C), Earth above horizon, Longest darkness, Longest comm gap, First sunlight, First dark after landing. "unavailable" means missing terrain made the number unknowable.

Sources: `web/src/ui/PointCard.tsx`, `FieldHelp.tsx`, `MissionLength.tsx`, `HeightControl.tsx`, `StationPicker.tsx`, `stationNetworks.ts`, `LivePanel.tsx`, `VerdictChips.tsx`, `ScoreBox.tsx`, `WarningsStrip.tsx`.
