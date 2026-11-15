# Timelines screen (Screen 4), first version: design

Date: 15 Nov 2026 · Status: approved by the web owner in conversation

## Intent
Show, for every site on Screen 2, *when* during the mission it has sunlight and Earth contact, side by side and aligned by mission day, with its score. The layout follows the team's Gantt sketch: one panel per site with a large score box, row labels, and bars on a shared time grid.

## Goals
- One panel per shown site with a location, in Screen 2's order and colors.
- A score box per site (the summary score, colored by category, "illustrative" with the breakdown on hover).
- Four rows from the summary's `windows`: Sun visible, Earth contact, Sun + Earth, unknown terrain (hatched).
- The x-axis is mission elapsed time in days, so different landing dates line up. Hover shows real UTC dates and the length.
- A dashed line at the viewed time, moved by the shared time slider; clicking a track moves it there.
- The existing comparison table sits under the chart.

## Non-goals (this version)
- Mission steps, dependencies (the sketch's arrows and brackets) and a scheduler: no data exists for them yet.
- "No station" hatching (needs the series month by month).
- Export (CSV and Horizons query).

## Approaches considered
- **A. A new Timelines screen (chosen).** Turn on the Timelines tab; "Compare timelines" opens it; the table moves under the chart. The screen is kept in the URL (`screen=timelines`), so links and Back work. One summary call per site, real data for catalog sites.
- **B. A plus "no station" hatching from the series.** More accurate for contact, but about one series call per site per month. A later step.
- **C. The chart inside Screen 2's Compare view.** Quicker, but doesn't match the separate screen in the sketch, and the tab stays dead.

## How it works
- `state/screen.ts`: `screen=timelines` in the query string; absent means the South pole screen. Other parameters (sites, time, settings) are shared.
- `timeline/bars.ts`: turns summary windows (UTC) into minutes after landing, clipped to the mission; picks day ticks.
- `ui/TimelineScreen.tsx`: the panels, rows, axis, legend and the time slider; reuses `ScoreBox`, `useSummaries`, `CompareView`.
- Old `view=compare` links keep opening the table on Screen 2.

## Left to the builder
Tick spacing, colors (the existing Sun / Earth / both colors), and the empty and loading states.
