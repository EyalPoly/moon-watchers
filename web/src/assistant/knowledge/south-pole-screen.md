# The South pole screen: buttons and controls

## Top bar
- **Screen tabs**: South pole, Timelines (Orbit and Surface are "coming soon").
- **Sample data** badge: shown when some numbers come from built-in sample answers instead of the live server.
- **Score settings**: opens the panel that sets the score's weights and thresholds (see the "score" document). "Score settings (custom)" means something differs from the defaults.

## Left: South pole explorer
- **Map view / Ridge graph**: switch every site's panel between the map and the ridge graph.
  - **Map view**: a polar map of LOLA terrain. Catalog sites are pins; the sites in the calculator show their letter (A, B, …). Clicking a pin selects that site's card, or fills an empty site with it. While a site has no location, **clicking the map places it** there (inside the dashed circle: 84°S to the pole).
  - **Ridge graph** ("Local horizon"): the highest ridge at each compass bearing, N 000° → E → S 180° → W → N 000°, at panel height (and antenna height as a thinner line). The Sun's and Earth's paths over the mission are drawn on it; a strip marks where the site is "facing the Sun". Grey gaps mean unknown (missing) terrain.
- **Select region**: opens the region tool on the map (see the "region-tool" document).
- **Visible layers** box: Relief is the terrain map. Illumination, Earth DTE, Slope and Dust layers show "not available yet" where their data isn't loaded. The **map key** explains the markers: PSR (permanently shadowed region, potential water ice), landing site, steep terrain / no Earth link, sensitive research.

## Right: Site calculator
- The header shows how many sites there are ("02 SITES", or "1 SAVED / 1 DRAFT" while a site has no location).
- **Show all / Hide all**: which sites appear in the explorer (each card also has an eye toggle).
- **Sort by rank**: reorders the cards best first, using the rank badges. The ranking refreshes every 15 s.
- **Live conditions / Whole mission**: what every card shows below its header (see the "site-card" document).
- **Site pages**: with more than 3 sites, "Previous / Next" page through them three at a time.
- **+ Add site**: a new empty card ("draft"), copying the open card's dates, heights and stations.
- **Ask the AI guide**: opens this guide.
- **Compare timelines** (with 2+ shown sites that have a location): opens the Timelines screen.

## Keyboard and links
- Every change that matters adds a browser history entry: **Back** undoes it. Dragging the time slider does not flood history.
- Copy the address bar to share exactly what you see.

Sources: `web/src/App.tsx`, `web/src/ui/ExplorerControls.tsx`, `web/src/ui/SharedSiteMap.tsx`, `web/src/ui/LayersBox.tsx`, `web/src/ui/TicketPanel.tsx`, `web/src/ui/TopBar.tsx`.
