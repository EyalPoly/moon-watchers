# Find Best Areas on Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Manual Selection tool's **Choose On Map** button grades each grid cell inside the polygon with the server's real score for the active card's mission, instead of the made-up grade.

**Architecture:** `web/src/api/areas.ts` keeps the grid math and gains a capped, 2-at-a-time grading loop that takes an injected `grade(center)` function. A small module in `web/src/state/` builds that function from the existing API client (`createCustomSite` then `getSummary`, score `value`). `AreaTool` passes the active ticket, config and search through, shows progress, over-cap and failure messages. No server or contract change.

**Tech Stack:** TypeScript, React 19, vitest, Playwright (e2e), proj4, OpenLayers, openapi-fetch.

**Spec:** `docs/superpowers/specs/2026-11-15-real-best-areas-design.md`

## Global Constraints

- At most **16 cells** per run (`MAX_AREA_CELLS`); over the cap nothing runs.
- Grade a cell with `createCustomSite(center)` then `getSummary(toScenario(site.id, ticket, ticket.station, settings))`; the grade is `summary.score.value`.
- **2 cells at a time** (`AREA_CONCURRENCY`).
- A cell's point is its center rounded to 0.001° (the id's precision, via `pointId`/`parsePointId`).
- Cells that cannot be graded are reported, never silently dropped; if every cell fails the error is shown instead of an empty list.
- The dummy sine-wave grade is deleted.
- No comments that point at specs or plans; comment only non-obvious "why".
- Typecheck (`pnpm build` runs `tsc -b`), `pnpm lint` and `pnpm test` pass at the end. Commit messages carry no Co-Authored-By trailer (the user's global rule, which overrides the harness reminder).

## Review Focus

- A polygon yielding exactly 16 cells runs; 17 refuses with the count (boundary of the cap).
- A cell whose grade call rejects (429, 422 out of coverage, timeout) doesn't stop the others and is counted in the failure report.
- Every cell failing shows the error, not "No grid cell fits inside this outline".
- Pressing the button twice, or changing spacing while grading, doesn't start a second run.
- Two cells at the same rounded point (id) are graded once.
- A zero-cell polygon (no center inside) keeps today's "No grid cell fits" message and makes no requests.

## File Structure

- Modify `web/src/api/areas.ts`: pure grid (`areaCells`), cap, pooled grading (`rankAreas`), error type; remove the dummy.
- Modify `web/src/api/areas.test.ts`: rewrite for the new behavior.
- Create `web/src/state/areaGrade.ts` + `areaGrade.test.ts`: `cellGrader` builds `grade(center)` from the API client.
- Modify `web/src/map/AreaTool.tsx`: new props, progress, messages, hint text.
- Modify `web/src/ui/SharedSiteMap.tsx`: pass `ticket`, `config`, `search` to `AreaTool`.
- Modify `web/e2e/tools.spec.ts`: keep the freehand test passing; add an over-cap test.

---

### Task 1: Capped, pooled grading in `areas.ts`

**Files:**
- Modify: `web/src/api/areas.ts`
- Test: `web/src/api/areas.test.ts` (rewrite)

**Interfaces:**
- Consumes: `LatLon` from `./points`; `proj4`.
- Produces (all exported from `web/src/api/areas.ts`):
  - `MAX_AREA_CELLS = 16`, `AREA_CONCURRENCY = 2`
  - `interface AreaCell { id: string; center: LatLon; corners: LatLon[] }` (id like `c12_-7`, corners counter-clockwise)
  - `interface RankedArea extends AreaCell { rank: number; grade: number }` (unchanged shape)
  - `areaCells(polygon: LatLon[], spacingKm: number): AreaCell[]`: cells whose center is inside the polygon, sorted by id; `[]` for fewer than 3 vertices; centers rounded to 0.001° and cells with the same rounded center appear once.
  - `class TooManyCellsError extends Error { count: number; max: number }`
  - `interface AreaResult { areas: RankedArea[]; cells: number; failed: number; firstFailure: string | null }`
  - `rankAreas(req: { polygon: LatLon[]; spacingKm: number; grade: (center: LatLon) => Promise<number>; onProgress?: (done: number, total: number) => void }): Promise<AreaResult>`: throws `TooManyCellsError` when cells > 16 (no `grade` calls); runs `grade` for at most 2 cells at once; a rejected grade counts in `failed` and the first rejection's `message` is `firstFailure`; if cells > 0 and every cell failed, throws `Error(firstFailure)`; `areas` sorted by grade descending then id, ranked from 1; `cells` is the number of cells attempted; `onProgress(done, total)` is called after each cell finishes (success or failure).
  - `insidePolygon` stays exported unchanged.

- [ ] **Step 1: Rewrite `areas.test.ts` with failing tests.** Keep the 20 km `square` near 87.5°S and the `insidePolygon` test. Add (using a fake `grade` such as `async (c) => 100 + c.lat`):
  - `areaCells(square, 5)` returns cells all inside the square, ids unique, and `[]` for 2 vertices.
  - `areaCells` called twice gives equal results.
  - `rankAreas` with the fake grade returns ranks `1..n`, grades non-increasing, `failed` 0, `firstFailure` null.
  - Exactly-at-cap: choose a spacing/polygon whose `areaCells(...).length` is 16 and assert it runs; one whose count is 17+ rejects with `TooManyCellsError` carrying `count` and `max: 16`, and `grade` is never called (`vi.fn()` call count 0). If no natural square gives exactly 16, build the polygon from the 4×4 grid of the 5 km spacing by computing it in the test.
  - Concurrency: a `grade` that increments an in-flight counter, awaits a macrotask, decrements, and records the max; assert max in-flight is 2.
  - Partial failure: `grade` rejects for one specific center; result has `failed: 1`, `firstFailure` equal to its message, and the other cells ranked.
  - All fail: `grade` always rejects with `new Error('boom')`; `rankAreas` rejects with message `boom`.
  - `onProgress` is called `cells` times, last call `(cells, cells)`.
  - Zero cells (polygon too small for the spacing, e.g. a 1 km square at 10 km): resolves `{areas: [], cells: 0, failed: 0, firstFailure: null}` and `grade` is never called.

- [ ] **Step 2: Run to verify they fail.** Run: `cd web && pnpm vitest run src/api/areas.test.ts`. Expected: FAIL (`areaCells` / `TooManyCellsError` not exported).

- [ ] **Step 3: Implement in `areas.ts`.** Reuse the existing projection helpers and cell loop (move the cell construction into `areaCells`; center and corners via the existing `toLatLon`, with the center additionally rounded to 0.001°). Delete `dummyGrade`, the artificial 250 ms delay and the DUMMY header comment. Implement the pool as N workers pulling the next index from a shared counter; catch each `grade` rejection per cell.

- [ ] **Step 4: Run tests.** Run: `cd web && pnpm vitest run src/api/areas.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/api/areas.ts web/src/api/areas.test.ts
git commit -m "feat(web): rankAreas grades cells through an injected function, capped at 16, two at a time"
```

---

### Task 2: The real cell grader

**Files:**
- Create: `web/src/state/areaGrade.ts`
- Test: `web/src/state/areaGrade.test.ts`

**Interfaces:**
- Consumes: `LatLon` (`../api/points`); `toScenario` (`./scenario`); `Ticket` (`./tickets`); `ScoreSettings` (`../api/scoreSettings`); `Site`, `Summary` types (`../api/types`).
- Produces: `cellGrader(api: { createCustomSite(lat: number, lon: number): Promise<Site>; getSummary(s: Scenario): Promise<Summary> }, ticket: Pick<Ticket, 't0' | 'days' | 'panel' | 'antenna' | 'station'>, settings: ScoreSettings): (center: LatLon) => Promise<number>`; matches the `grade` parameter of `rankAreas`.

- [ ] **Step 1: Write the failing test** with a fake `api` (`vi.fn()`s): `createCustomSite` resolves `{ id: 'pt_s87500_e045000' }`-shaped site; `getSummary` resolves `{ score: { value: 63.5 } }`.
  - `grade({lat: -87.5, lon: 45})` resolves `63.5`.
  - `createCustomSite` was called with `(-87.5, 45)`.
  - `getSummary` was called with exactly `toScenario('pt_s87500_e045000', ticket, ticket.station, settings)` (so t0, days, panel, antenna, station and the weights come from the ticket and settings).
  - If `createCustomSite` rejects, `grade` rejects with the same error and `getSummary` is not called.

- [ ] **Step 2: Run to verify it fails.** Run: `cd web && pnpm vitest run src/state/areaGrade.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `cellGrader`** as described; two awaited calls, return `summary.score.value`.

- [ ] **Step 4: Run tests.** Run: `cd web && pnpm vitest run src/state/areaGrade.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/state/areaGrade.ts web/src/state/areaGrade.test.ts
git commit -m "feat(web): cellGrader grades a map point with the real custom-point and summary endpoints"
```

---

### Task 3: Wire the tool, messages and e2e

**Files:**
- Modify: `web/src/map/AreaTool.tsx` (props at lines 18-30, `findAreas` at ~170, hint at ~301)
- Modify: `web/src/ui/SharedSiteMap.tsx:76`
- Modify: `web/e2e/tools.spec.ts` (test at line 118; add one)

**Interfaces:**
- Consumes: `rankAreas`, `TooManyCellsError`, `AreaResult`, `MAX_AREA_CELLS` (Task 1); `cellGrader` (Task 2); `createApi(config, search)` (`../api/client`); `resolveSource` (`../api/config`).
- Produces: `AreaToolProps` gains `config: AppConfig`, `search: string`, `ticket: Ticket`.

- [ ] **Step 1: Pass the inputs.** In `SharedSiteMap.tsx` give `<AreaTool>` `config={config} search={search} ticket={ticket}`. In `AreaTool` add the props; build `grade = cellGrader(createApi(config, search), ticket, settings)` inside `findAreas`.

- [ ] **Step 2: Progress and results in `findAreas`.** Replace the `rankAreas` call: pass `grade` and `onProgress`; keep progress as state (`{ done, total } | null`) and show the button label `Grading n of N…` while busy (`aria-live="polite"` paragraph is fine). Guard re-entry: `findAreas` returns immediately when already busy. Keep the existing `disabled` rules so spacing, undo and clear stay disabled while busy.

- [ ] **Step 3: Messages.**
  - `TooManyCellsError`: a `field-error` paragraph (`role="alert"`) reading `This outline has {count} grid cells; the most we can grade at once is {max}. Draw a smaller outline or pick a larger grid.` Results stay cleared.
  - Partial failure (`failed > 0`): an `area-hint` under the list: `{failed} of {cells} cells could not be graded ({firstFailure}).`
  - Total failure (rankAreas throws other errors): the same `field-error` style showing the error message, not the "No grid cell fits" hint.
  - Keep "No grid cell fits inside this outline…" only for `cells === 0`.
  - Replace the hint "Sample grades from a stand-in function, best first." with: when `resolveSource(config, 'summary', search)` is `sample`, `Sample grades (stand-in data), best first.`; otherwise `Graded by the server for this card's mission, best first.`

- [ ] **Step 4: Typecheck, lint, unit tests.** Run: `cd web && pnpm build && pnpm lint && pnpm test`. Expected: all pass. (`pnpm build` also writes `dist`; it is gitignored.)

- [ ] **Step 5: E2E.** Run `cd web && pnpm exec playwright test e2e/tools.spec.ts`. The existing freehand test runs in sample mode, so grades come from the mock handlers; if its drawn polygon now exceeds 16 cells at the default 5 km spacing, switch that test to the 10 km grid (`tool.getByLabel('Grid spacing').selectOption('10')`) before drawing rather than shrinking assertions. Add a test: draw the same polygon at 2 km spacing and expect `tool.getByRole('alert')` to contain `grid cells` and `Draw a smaller outline`, and no `Best areas` list. Expected: both pass.

- [ ] **Step 6: Measure against the real server (spec decision 7).** With `web/public/config.json` pointing at the live API (`summary` and `custom` real), run `pnpm dev`, outline a small polygon (about 10 cells) and time one cold cell in the network tab. If a cell's slowest request approaches the 8 s `REQUEST_TIMEOUT_MS` in `web/src/api/client.ts`, raise the timeout for `createCustomSite` only and add a one-line "why" comment; otherwise leave it. Report the measured cold and warm times in the commit body or final message.

- [ ] **Step 7: Commit.**

```bash
git add web/src/map/AreaTool.tsx web/src/ui/SharedSiteMap.tsx web/e2e/tools.spec.ts
git commit -m "feat(web): Choose On Map grades cells on real data, with a 16-cell cap and progress"
```

---

## Self-Review

- **Spec coverage:** cap 16 (Task 1, 3), cells/grid unchanged (1), grading via custom point + summary with ticket mission and weights (2), 2 at a time (1), interface change and props (3), progress and re-entry guard (3), failures reported and total failure shown (1, 3), timeout measurement (3 step 6), dummy removed (1), mock mode works through the same client (3 step 5).
- **Types:** `grade: (center: LatLon) => Promise<number>` is the same in Tasks 1 and 2; `AreaResult` fields used in Task 3 match Task 1; `RankedArea` shape unchanged, so the existing `onOpen` and `RegionOverlay` code is untouched.
- **Open point for the builder:** `summary.score.value` is assumed to be on the same 0–100 scale as `gradeColor` expects; check one real response and, if it isn't, scale at the grader (not in the UI).
