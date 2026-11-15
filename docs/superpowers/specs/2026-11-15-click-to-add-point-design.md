# Click the map to add a point: design

A small change on the South pole screen. A click on the map adds a custom point as a new card that shows results immediately.

## Intent

Today a map click places a point only while the active card has no site, and it opens that card in edit mode. The user wants to explore by clicking: each click on the map gives a new card with results for that spot, and "Edit input" is available afterwards.

## Goals, non-goals, anti-goals

**Goals**
- A click on empty map inside the custom-point area (84–90°S) adds a new card for that point.
- The new card copies the active card's landing date, mission length, panel and antenna heights, and Earth station, and opens showing results.
- A click while the active card is blank fills that card instead of adding one.

**Non-goals**
- Server-side custom-point terrain (separate deploy work, see `2026-11-15-custom-points-design.md`).
- Dragging placed points, new map styling, changes to the area tool.

**Anti-goals**
- A click that silently does nothing (at the card limit).
- A pin click that also places a point.

## Constraints

- Custom points work on the real server only after the terrain deploy; `custom` in `web/public/config.json` is still `sample`.
- `MAX_URL_TICKETS` (50) bounds the number of cards, since cards live in the URL.

## Approaches

| Approach | Trade-off |
|---|---|
| **Picked: always-on click that adds a card** (reuses `PlacePoint` and `addTicketsFor`) | Smallest change; one click gives an answer. |
| Drop a pin, then confirm | Extra click between the map and the answer. |
| Separate "add point" mode | Hides a half-built feature behind a toggle. |

## Decisions

1. `PlacePoint` is mounted whenever the area tool is not selecting, not only when the active card has no site.
2. Active card blank: the click sets its site and leaves it in results view (no `editing` flag). Otherwise: `addTicketsFor` with the clicked point, which opens the new card and makes it active.
3. Name stays empty; the card shows the server's custom-point name once the site loads.
4. Pins keep their behavior (focus that card). A test confirms a pin click does not place a point.
5. The map hint reads as an invitation to add a site.
6. At the card limit a click adds nothing and a short message says why. This message wording is the author's call.

## Left to the builder

Exact hint and limit-message text, where the limit message renders, and test layout. Typecheck when done.