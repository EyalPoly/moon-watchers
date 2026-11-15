# The Site Calculator screen: buttons and controls

## Top bar
- **Screen tabs**: Orbit, Site Calculator (this screen), Surface ("coming soon"), Timelines.
- **Sample data** badge: shown when some numbers come from built-in sample answers instead of the live server.
- The **score settings** are not in the top bar: they are **Grading Weights**, inside Manual Selection.

## Left: South pole explorer
- **Map view / Ridge graph**: switch every site's panel between the map and the ridge graph.
  - **Map view**: a polar map with NASA Moon Trek / LOLA tiles. Catalog sites are pins; the sites in the calculator show their letter (A, B, …). **Clicking the map adds a site** there (a new card with results), inside the dashed circle (84°S to the pole). Clicking a pin shows that site. At the site limit the hint says "Site limit reached. Delete a site to add another."
  - **Ridge graph**: the local horizon, the highest ridge at each compass bearing (N → E → S → W → N), at panel height (and antenna height as a thinner line), with the Sun's and Earth's paths. A **Lunar Day** slider moves the graph's time, and arrows **move the site's coordinates** a little to compare nearby points. Grey gaps mean unknown (missing) terrain.
  - A help panel explains how the **Sun's and Earth's elevation angles** behave at the south pole: the Sun circles the horizon once per lunar day (about 29.5 days) within about ±1.5°; the Earth stays in one direction and moves in a small libration loop; moving in latitude or longitude shifts these paths.
- **Manual Selection**: opens the region tool and the Grading Weights (see the "region-tool" note).
- **Map Key** box:
  - **Maps Layers** (one at a time, drawn over the relief): **Relief** (terrain elevation with hill shading), **South Pole Geomorphic Map** (geologic units and features from LROC QuickMap; covers only Artemis III areas 001 and 004), **PSR** (permanently shadowed regions of 1 km² or larger, plus inside/outside at the sites), **TerrainSlope** (terrain slope, plus the local slope at the sites). Each has a legend on the map.
  - **Polygons Layers**: None, **Selected region** and **Ranked areas** (from an applied Manual Selection).
  - Markers: PSR (potential water ice), site, steep terrain / no Earth link, sensitive research.

## Right: Site calculator
- The header shows how many sites there are.
- **Show all / Hide all**: which sites appear in the explorer (each card also has a toggle).
- **Sort by rank**: reorders the cards best first, using the rank badges (a sample ranking function).
- **Live conditions / Whole mission**: what every card shows (see the "site-card" note).
- **Site pages**: with more than 3 sites, "Previous / Next" page through them three at a time.
- **+ Add site**: a new empty card, copying the open card's dates, heights and stations.
- **Compare timelines** (with 2+ shown sites that have a location): opens the Timelines screen.

## The AI guide
- The round **helmet button** (Ask the AI guide) opens the guide as a floating window that can be moved (drag the move handle or use the arrow keys), minimized and closed; the conversation is kept.

## Links
- Every change that matters adds a browser history entry: **Back** undoes it. Copy the address bar to share exactly what you see.

Sources: `web/src/App.tsx`, `web/src/ui/TopBar.tsx`, `web/src/ui/ExplorerControls.tsx`, `web/src/ui/SharedSiteMap.tsx`, `web/src/ui/LayersBox.tsx`, `web/src/ui/MapLegend.tsx`, `web/src/ui/GraphControls.tsx`, `web/src/ui/CoordinateHelp.tsx`, `web/src/ui/GuideWindow.tsx`.
