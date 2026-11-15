# Find best areas on real data: design

Small change, web only. Replaces the dummy grading behind the **Find best areas** button in the Manual Selection tool with grades computed by the server, using endpoints that already exist.

## Intent

After the user outlines a polygon on the map and presses **Find best areas**, each grid cell inside it gets the same score a site card would show for that point, under the active card's mission. The ranked list and the colored cells on the map then mean what the rest of the app means by a score.

## Goals, non-goals, anti-goals

**Goals**
- Grades come from the real server (custom point + summary score), in the same way as a card's score.
- The grade follows the active card's mission (landing time, length, panel and antenna heights, Earth station) and the current grading weights.
- Works in mock mode too, because it goes through the existing API client and its mock handlers.

**Non-goals**
- A new server endpoint (`POST /scenario/areas` from the main spec). No server or contract change.
- Big areas. The cap below is the answer to "too big".
- Caching grades across clicks beyond what the server and react-query already do.

**Anti-goals**
- Silently dropping cells, or showing a half-finished ranking as if it were complete.
- A run that ties up the server's two heavy-work slots for other users.

## Constraints (checked in the code)

- `POST /sites/custom` computes a point on first use (about 1–2 s per the custom-points spec); then `GET /scenario/summary` returns `score`. `toScenario(siteId, ticket, station, settings)` already builds the scenario.
- The server allows 20 *new* points per minute per client (`NEW_PER_MINUTE`), 200 per instance, and two heavy computations at once. Points already in its 256-entry cache don't count.
- The API client aborts a request after 8 s (`REQUEST_TIMEOUT_MS`).
- A point's id rounds to 0.001° (`pointId`), so two cells can't collide at the spacings offered (2, 5, 10 km).

## Approaches

| | Approach | Trade-off |
|---|---|---|
| A | New server endpoint doing grid, points and scores in one request. | One request and one place for the cap, but new server code and a contract change. Not picked. |
| **B (picked)** | **The web app builds the cells and calls the existing custom-point and summary endpoints for each.** | No server change. About two requests per cell, and the cap lives in the browser. |
| C | Coarse screening, then exact on the best few. | More machinery than a small cap needs. Rejected. |

## Decisions

1. **Cap.** At most **16 cells** per run, under the 20-per-minute limit. If the polygon holds more at the chosen spacing, nothing runs and the tool says how many cells it has and asks for a smaller polygon or a larger spacing. *(My call: 16.)*
2. **Cells.** Same grid as today (cells of the chosen spacing in the region's projection, kept when the center is inside the polygon). The grid code stays in `web/src/api/areas.ts`; only the grading changes. A cell's point is its center, rounded to 0.001°.
3. **Grading a cell.** `createCustomSite(center)`, then `getSummary` with the active ticket's scenario and that site's id. The grade is the summary's score. Up to **2 cells at a time**, matching the server's two heavy slots. *(My call.)*
4. **Interface.** `rankAreas` takes the active scenario inputs (ticket, station, settings) as well as the polygon and spacing, returns the same `RankedArea[]`, and `AreaTool` receives those inputs from `SharedSiteMap`/`App`. The results list and map drawing don't change.
5. **Progress.** The button shows "n of N cells graded" while it runs, and a second press is ignored while busy.
6. **Failures.** A cell that can't be graded (no terrain at its center, 429, timeout) is not ranked and not hidden: the tool reports "k of N cells could not be graded" with the first reason. If every cell fails, it shows the error instead of an empty list.
7. **Timeouts.** The builder measures a cold custom point on the live server. If it can exceed 8 s, this call gets a longer timeout. Other calls keep 8 s.
8. **Removing the dummy.** The sine-wave grade is deleted. Mock mode returns whatever the mock handlers give for custom points and summaries.

## Left to the builder

Exact wording of the over-cap and failure messages, how progress is shown, the tests (cap, failure reporting, ordering, concurrency limit, mock-mode path), and the e2e update. Typecheck when done.
