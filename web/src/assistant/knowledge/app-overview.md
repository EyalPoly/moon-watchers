# Moon Watchers: what the app does

Moon Watchers helps plan a landing near the Moon's south pole. For a landing site, a landing time and a mission length, it computes when the site has **sunlight** (for power) and **direct contact with an Earth station** (for communication), and turns that into an illustrative **score** so sites can be compared.

## Screens (tabs in the top bar)
- **South pole** (main screen): the map or ridge graph on the left ("South pole explorer"), and the site cards on the right ("Site calculator").
- **Timelines**: one panel per site with its score and bars for Sun, Earth contact, both and unknown terrain, on a shared mission-day axis; the comparison table is below.
- **Orbit** and **Surface**: not built yet (the tabs are disabled, "coming soon").

## The main ideas
- A **site** is either one of the **30 catalog sites** chosen by the physics team (for example Mons Mouton, Mons Malapert, Shackleton rim areas, crater floors), or a **custom point** typed as latitude/longitude or clicked on the map, anywhere from **84°S to the pole**.
- Each site card is a **scenario**: site, landing date and UTC time, mission length (1–365 days), solar panel height and antenna height (1–10 m), and one or more Earth stations.
- All times are on a **10-minute grid** (UTC).
- **Mission time** (the slider) is time since landing. All sites share it, so "day 3" lines up across sites with different landing dates.
- **Everything is in the link (URL)**: sites, settings, the screen and the viewed time. A link can be shared, reloaded or undone with the browser's Back button.
- Top-bar **Score settings** change how the score weighs sunlight, contact, darkness, outages, landing sunlight, slope and dust. They apply to every site.

## What the numbers are, and are not
- Positions of the Sun and Earth come from NASA/JPL SPICE ephemeris; the terrain from NASA's LOLA laser altimeter maps.
- Sunlight and contact are **line-of-sight geometry**: no link budget, no antenna pointing, no relay satellites, no schedules.
- The score is **illustrative**: its weights and thresholds are the physics team's examples, not validated landing criteria. The app always says so.
- Dust is a **simulated** index, labeled "simulated" everywhere.

Sources: `docs/superpowers/specs/2026-11-10-lunar-landing-site-navigator-design.md` (§0–§4), `web/src/ui/TopBar.tsx`, `catalog/sites.yaml`.
