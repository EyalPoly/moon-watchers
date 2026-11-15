# Click the map to add a point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A click on the South pole map adds a custom point as a new card that shows results immediately, copying the active card's settings.

**Architecture:** One pure state function, `placePoint`, decides between filling a blank active card, adding a card via `addTicketsFor`, or doing nothing at the card limit. `PlacePoint` stays the map click listener and is mounted whenever the area tool is not selecting. `App.tsx` wires the two together.

**Tech Stack:** React, TypeScript, OpenLayers, vitest (run from `web/`).

**Spec:** `docs/superpowers/specs/2026-11-15-click-to-add-point-design.md`

## Global Constraints

- `MAX_URL_TICKETS` is 50 (`web/src/state/tickets.ts`).
- Custom ids come from `pointId(lat, lon)` in `web/src/api/points.ts`; do not change them.
- Comments only where the why is non-obvious; no references to specs or plans in code.
- Commits carry no `Co-Authored-By` trailer (user rule in `~/.claude/CLAUDE.md`, which overrides the harness reminder).
- Work on a new branch from `main` (`feat/click-to-add-point`), not on `feat/far-step-60m`. Leave the unrelated uncommitted files alone.
- Typecheck when done: `pnpm exec tsc -b` in `web/`.

## Review Focus

- Click exactly at the 50-card limit: no card added, state object unchanged, hint says why.
- Click while the area tool is selecting: no point placed.
- Click on a pin (an overlay element): must not reach the map's click listener.
- Click outside the 84–90°S area: ignored (existing behavior, now covered by a test).
- Active card is hidden or collapsed when a click arrives: the new card must still open and become active.

---

### Task 1: `placePoint` state function

**Files:**
- Modify: `web/src/state/tickets.ts` (next to `addTicketsFor`, around line 89)
- Test: `web/src/state/tickets-names.test.ts` (add tests; it already imports `addTicketsFor`)

**Interfaces:**
- Consumes: `addTicketsFor(s, from, points)`, `updateTicket(s, i, patch)`, `MAX_URL_TICKETS`, `EMPTY_TICKET`.
- Produces: `export function placePoint(s: Screen2State, active: number, site: string): Screen2State`

- [ ] **Step 1: Write the failing tests** in `tickets-names.test.ts`, importing `placePoint` and `MAX_URL_TICKETS`:
  - `placing on a blank active card fills it and shows results`: state with one ticket `{ ...EMPTY_TICKET }` (site null), `placePoint(s, 0, 'pt_s87000_e010000')` gives one ticket with that site, `editing` undefined, `open` 0.
  - `placing with a site already set adds a card that copies the active one`: base `{ ...EMPTY_TICKET, site: 'sample_a', t0: '2027-06-01T00:00Z', days: 14, station: PRESETS[2].point }`; result has 2 tickets, `tickets[1]` equals `{ ...base, site: 'pt_s87000_e010000', name: '', view: 'map', shown: true }`, `open` is 1, `compare` false.
  - `placing at the card limit changes nothing`: state with `MAX_URL_TICKETS` tickets, `expect(placePoint(s, 0, 'pt_s87000_e010000')).toBe(s)`.
  - `placing while the active card is collapsed still opens the new card`: base has `collapsed: true`; result `tickets[1].collapsed` undefined and `open` 1.

- [ ] **Step 2: Run to verify failure**

Run (in `web/`): `pnpm exec vitest run src/state/tickets-names.test.ts`
Expected: FAIL, `placePoint` is not exported.

- [ ] **Step 3: Implement `placePoint`** in `tickets.ts`. Order: return `s` unchanged when `s.tickets.length >= MAX_URL_TICKETS`; if `s.tickets[active]?.site === null`, return `updateTicket(s, active, { site, editing: undefined, collapsed: undefined })` with `open: active`; otherwise `addTicketsFor(s, active, [{ site, name: '' }])`. A one-line comment on why the limit check comes first: cards live in the URL.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/state/tickets-names.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/click-to-add-point main
git add web/src/state/tickets.ts web/src/state/tickets-names.test.ts docs/superpowers/specs/2026-11-15-click-to-add-point-design.md docs/superpowers/plans/2026-11-15-click-to-add-point.md
git commit -m "feat(web): placePoint adds a card for a clicked map point"
```

### Task 2: Map click behavior and wiring

**Files:**
- Create: `web/src/map/PlacePoint.test.tsx`
- Modify: `web/src/ui/SharedSiteMap.tsx` (mount condition, hint, new `atLimit` prop)
- Modify: `web/src/App.tsx:304-310` (`onPlace`, pass `atLimit`)

**Interfaces:**
- Consumes: `placePoint` from Task 1; `PlacePoint({ areaRadiusM, onPlace })`; `useMap` from `PolarMap`.
- Produces: `SharedSiteMap` gains `atLimit: boolean`. Its `onPlace(id)` contract is unchanged; `onSelectPin` still calls it for a catalog pin when the active card is blank.

- [ ] **Step 1: Write the failing tests** in `PlacePoint.test.tsx`, following the mount pattern in `web/src/map/basemap.test.tsx` (`vitest-canvas-mock`, stubbed `ResizeObserver`, `PolarMap` with `onMapReady`, `meta.regions[0]`). Mount `<PolarMap region={region}><PlacePoint areaRadiusM={radius} onPlace={onPlace} /></PolarMap>` with `radius = parallelRadiusM(region, region.custom_area.max_lat_deg)`. Dispatch fake events with `map.dispatchEvent({ type: 'singleclick', coordinate } as never)`:
  - `a click inside the area places that point`: coordinate `[0, 100_000]` calls `onPlace` once with an id starting `pt_s`.
  - `a click outside the area is ignored`: coordinate `[0, radius + 1]` does not call `onPlace`.
  - `pin overlays stop map events`: with `SitePins` mounted for one site, every overlay in `map.getOverlays()` has `getStopEvent() === true`, so a pin click cannot also place a point.

- [ ] **Step 2: Run to verify** `pnpm exec vitest run src/map/PlacePoint.test.tsx`. The first two may already pass, since `PlacePoint` is unchanged. Record which do. The pin test must pass or the plan's assumption is wrong; if it fails, stop and report.

- [ ] **Step 3: Wire it.**
  - `SharedSiteMap.tsx`: mount `<PlacePoint>` when `!selecting` (drop the `!ticket.site` condition). Add the `atLimit` prop. The hint renders when not selecting: `atLimit ? 'Site limit reached. Delete a site to add another.' : 'Click the map to add a site.'`; keep the selecting hint as is. Remove the now-unused "choose a catalog site" hint wording only if nothing else references it.
  - `App.tsx`: `onPlace={(site) => apply((s) => placePoint(s, active, site))}` and `atLimit={screen.tickets.length >= MAX_URL_TICKETS}`; import both from `./state/tickets`.

- [ ] **Step 4: Verify.** In `web/`: `pnpm exec vitest run` (all pass), `pnpm exec tsc -b` (no errors), `pnpm lint` (no new findings).

- [ ] **Step 5: Check in the running app.** Start `pnpm dev`, open the South pole screen on sample data. Confirm: a click on empty map adds the next letter and opens it in results view; clicking a pin still focuses its card; the area tool still outlines regions without placing points. Report what was and was not verified; custom points will not load real data until the server terrain ships.

- [ ] **Step 6: Commit**

```bash
git add web/src/map/PlacePoint.test.tsx web/src/ui/SharedSiteMap.tsx web/src/App.tsx
git commit -m "feat(web): clicking the map adds a site card with results"
```

## Self-review

- Spec coverage: decision 1 (mount condition) and 5 (hint) in Task 2; 2, 3 and 6 in Task 1 plus the `atLimit` hint; 4 (pins) in Task 2's overlay test. The server deploy is out of scope.
- Spec decision 6 said "a short message"; the permanent hint text at the limit is how that is met, my call.
