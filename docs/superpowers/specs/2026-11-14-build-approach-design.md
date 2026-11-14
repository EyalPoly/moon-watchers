# Build Approach: Two Tracks, Feature Slices, Contract First

Companion to `2026-11-10-lunar-landing-site-navigator-design.md` (the product spec, "the spec" below). The spec says **what** we build. This document says **how the build runs** during the hackathon: who builds what, in which order, and how each piece is tested before the next one starts. It changes no product decision.

## 1. Intent

- **The web app runs without a server.** From the first hours, the product team can click through the real UI on sample answers, at a hosted link, with nothing to install.
- **The server is tested on its own with the physics team.** They check the engine's numbers against their rules and their reference script (P1), without needing the UI.
- **Small steps.** Each step is small enough to test carefully and to change on the spot when the product or physics team reacts.
- **Fast overall.** The two tracks run in parallel, so small steps don't make the whole build slow. The hard deadline is 15 Nov 23:59, with the spec's gates G1–G5 (§13.2).

## 2. Goals, non-goals, anti-goals

**Goals**
- Product team feedback on real screens within the first ~4 hours (G1), and on every new slice after that.
- Physics team sign-off on each engine result before the UI switches from sample to real answers for it.
- Any slice can be reshaped mid-hackathon at the cost of that slice only.

**Non-goals**
- Re-deciding product scope, stack or priorities. Those are in the spec.
- A general process for after the hackathon.

**Anti-goals** (failure even if it technically works)
- The web app and the server disagreeing about the shape of an answer, discovered late.
- The product team testing on numbers that look real but aren't, without knowing it. Sample answers are always labeled.
- One person becoming a review queue that stalls both tracks.
- Big-bang integration on day 2.

## 3. Constraints

- **One human owner per track.** The **server owner** (the user) owns the engine, the API, hosting, the physics-team commands and the P-items. The **web owner** (a second programmer) owns the 2D web app: app shell, map, cards, timeline, MSW and the two previews. Each owner can run Claude as a parallel background builder inside their track, reviews and merges their own branches. The 3D teammate builds Screens 1 and 3 against the same contract (spec §12.4).
- **The server owner builds S0 alone,** so the web owner starts on a working skeleton (repo, CI, app shell, previews).
- **Physics placeholders P2–P12 are still open** (spec §12.3). Every slice uses the interim value from the spec until the physics team's answer arrives.
- **The P1 reference script** arrives about 4 h after kickoff at the earliest.
- **Where the work runs:** the builders develop and test on the Mac, with the horizon code on MPS or CPU and small areas. Full builds that need the RTX 4060 (catalog masks at full size, horizon grids, the GPU timing spike) are run by the user on the Windows PC when a slice needs them; the slice's plan says exactly which command to run. Kernels and DEMs live in one shared `data/sources/` outside git, linked into every worktree.
- **Where the work runs:** the builders develop and test on the Mac, with the horizon code on MPS or CPU and small areas. Full builds that need the RTX 4060 (catalog masks at full size, horizon grids, the GPU timing spike) are run by the user on the Windows PC when a slice needs them; the slice's plan says exactly which command to run. Kernels and DEMs live in one shared `data/sources/` outside git, linked into every worktree.
- **Event hosting is unknown until kickoff** (spec §5.3, §10.2).
- **The repository doesn't exist yet.** It is created in the first slice, and this document and the spec are its first commit.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **1 (picked)** | **Feature slices, contract first.** One ordered list of small features. Each starts with its piece of the contract and a sample answer, then web and server build it in parallel. | The user reviews two small pieces per slice, about every 1–2 h. In return a change costs one slice, and mismatches show up within the hour. |
| 2 | Two separate to-do lists, meeting every ~6 h (the spec's integration checkpoints). | Less review, but the contract drifts between meetings and mistakes surface in big batches. Works against careful step-by-step testing. |
| 3 | Freeze the whole contract in hour one, then each side builds freely. | Fastest start, but it locks decisions the physics team hasn't made (P2–P12, especially the score P5), forcing contract rewrites mid-build. |

**Why 1:** it is the only approach where small, testable steps and two parallel tracks support each other instead of competing. The contract for each feature is fixed only when that feature is built, so the physics team's open items stay open as long as possible.

**Who builds the web app:** a dedicated web owner, the second programmer. The server owner keeps the server track. Claude can run as a parallel builder inside either track. This replaces the earlier plan of one person owning both tracks, which was chosen only because nobody else could build React from the first hour.

## 5. How a slice runs

Each slice is one user-visible feature, sized at about 1–2 hours, broken into steps of about 30 minutes that each end with a test passing and something visible.

1. **Contract step** (minutes, done first, drafted by the server owner or their Claude builder):
   - Add or change the Pydantic models for the slice's endpoint (spec §8).
   - Write a **sample answer**: a JSON file with realistic values, validated against the models.
   - Regenerate the OpenAPI schema, the TypeScript client and the MSW handler.
   - **Both owners approve** the contract and the sample answer: the server owner for what the engine can produce, the web owner for what the UI needs. This is the one gate inside a slice.
2. **Two tracks, in parallel**, each in its own git worktree and branch:
   - **Web track (web owner):** builds the UI piece against the sample answer (MSW). Done when it works in the mock preview and its tests pass.
   - **Server track (server owner):** builds the engine function and the endpoint for real. Done when its pytest suite passes and the endpoint's real answers validate against the same models.
3. **Review and merge:** each owner reviews and merges their own track's branch (small diffs) to `main`. `main` stays deployable. A contract change is merged by the server owner and must not break the web track's build; CI enforces it (§8).
4. **Physics check:** the server builder's result comes with a command the physics team can run (§7). They compare it with their expectations or P1.
5. **Switch to real:** the user flips the slice's endpoint switch from `sample` to `real` (§6) once the engine's own checks pass: its pytest suite, plus the JPL Horizons check for anything with Sun or Earth positions. Until the physics team signs off, cards using that endpoint show a small "pending physics review" tag; their sign-off removes it. Physics review therefore never blocks a gate.

**Changes on the go** start at step 1 again: update the contract and the sample answer first, so the product team sees the change in the mock preview immediately, then both builders follow.

**Keeping anyone from becoming the bottleneck:**
- Each owner's touch points per slice are the contract approval and their own merge. Everything between happens without waiting.
- The next slice's contract step can run while the current slice's tracks work, so neither track waits for a contract.
- If an owner is away, the other track keeps working; the contract can still be approved by the owner who is present, and the absent owner confirms afterwards. A change that can't wait is flagged in the pull request.
- The web track is the larger one (§9). If the server track runs ahead, the server owner picks up web slices, coordinating with the web owner on which.
- Shared web pieces (app shell, URL state, `config.json` switch) belong to the web owner, so the 3D teammate asks them before changing these.

## 6. Running without the server

- **Per-endpoint switch** in `config.json` on the static host (spec §10.2 already puts the API address there):
  ```json
  { "api_base": "https://…", "sources": { "sites": "real", "horizon": "sample", "summary": "sample" } }
  ```
  `sample` means MSW serves the sample answer in the browser. `real` means the call goes to the API. A URL override (`?data=sample`) forces every endpoint to sample, for product testing even after integration.
- **Labeling:** while any visible number comes from a sample answer, the app shows a "Sample data" banner, and each card that uses one shows a small tag. This prevents the "looks real but isn't" anti-goal.
- **How many sample answers** (Claude's call): each endpoint gets answers for 3 sample sites, so comparing cards (S5, S6) shows real differences. Time-dependent answers (series, summary, calendar) come from a small synthetic generator: plausible Sun and Earth curves for a polar site at any `t0` and length, clearly fake but shaped right. MSW matches on the endpoint and the scenario parameters and **ignores `v`**, so recorded answers keep working across commits. An unknown site falls back to the nearest sample site.
- **How many sample answers** (Claude's call): each endpoint gets answers for 3 sample sites, so comparing cards (S5, S6) shows real differences. Time-dependent answers (series, summary, calendar) come from a small synthetic generator: plausible Sun and Earth curves for a polar site at any `t0` and length, clearly fake but shaped right. MSW matches on the endpoint and the scenario parameters and **ignores `v`**, so recorded answers keep working across commits. An unknown site falls back to the nearest sample site.
- **Two hosted previews,** redeployed on every push to `main`:
  - **Product preview:** everything on sample answers. Always works, even with no server. This is what the product team tests.
  - **Integrated preview:** the switches as set in `config.json`. This is what gets demoed and becomes the public link.
- **Sample answers become the demo snapshot.** Once an endpoint is real, its sample answers for the demo scenarios are re-recorded from the real API. The same files then serve as the demo snapshot (spec §10.3), so one mechanism covers both "no server yet" and "server down during judging".

## 7. Testing the server with the physics team

- **The engine is a plain Python library** (spec §5.1: pure functions, arrays in and out). The physics team calls it directly; they don't need the HTTP API.
- **The physics team reviews files, not code.** Every server slice attaches its CSV outputs for the 3 sample sites to its pull request, so the physics team can check results without installing anything. They set up a local copy only if they want to run their own cases.
- **Every server slice also ships one command** that produces those CSVs, for anyone who wants to rerun them, for example:
  ```
  python -m engine.cli summary --site shackleton_rim_a --t0 2027-03-01T00:00Z --days 29.53 --mast 2 --out summary.csv
  ```
  The output is CSV (spec §12.2: CSV for anything exchanged between people).
- **When P1 arrives:** a pytest comparison runs the engine and their script on the same sites and times, within tolerances agreed with them (spec §11.1). From then on it runs in CI on every push.
- **Sign-off** is a short note per slice from the physics team ("summary for 3 sites matches within X"), recorded in the slice's pull request. It removes the "pending physics review" tag (§5 step 5); it doesn't gate the switch to `real`.
- **Placeholders:** when a P-item answer arrives, it lands as a config or rule change on the server track. The contract changes only if the answer's shape changes (P5, the score, is the likely one).

## 8. Guards against drift

- CI regenerates the OpenAPI schema and the TypeScript client and fails if they differ from what's committed.
- CI validates every sample answer against the Pydantic models.
- Server tests validate real answers against the same models.
- A contract change without its sample answer and regenerated client fails CI.

## 9. Slice order

The order follows the spec's gates (§13.2) and cut order (§13.3). Each row is one slice. "Web" (web owner) and "Server" (server owner) run in parallel after the contract step.

| # | Slice | Web | Server | Gate |
|---|---|---|---|---|
| S0 | Skeleton | Repo, CI, app shell, polar map with one Moon Trek layer, MSW wiring, both previews deployed | `/health`, `/meta` (sample), kernel and DEM download, GPU timing spike, hosting decision | G1 |
| S1 | Catalog | Site pins on the map, site picker on a card | `/sites`, `/sites/{id}` from `catalog/sites.yaml` | G1 |
| S2 | Horizon mask | Sky view: terrain silhouette | `horizons` ray-march for one site, `/sites/{id}/horizon` | G2 |
| S3 | Series | Sky view Sun/Earth paths, time slider, live panel | `geometry` ephemeris table, `/scenario/series` | G2 |
| S4 | Summary | Verdict chips, countdowns | `visibility`, `metrics`, interim `score`, `/scenario/summary`; Horizons check | G2 |
| S5 | Multi-card | Up to 3 cards, URL state, "+1 Lunar Day", split map | All catalog sites built | G3 |
| S6 | Timeline | Screen 4 Gantt, score box, export buttons | `/scenario/export` (CSV and Horizons query) | G3 |
| S7 | Custom points | Click on map, typed lat/lon | `POST /sites/custom` | G3 |
| S8 | Shadows | Live shadow overlay from grids | Horizon grids for catalog sites | G3 |
| S9 | Validation + snapshot | Minimal "How we know it's right" page | Validation report from the build; demo snapshot recorded | G3 |
| S10+ | Shoulds | In reverse cut order: landing calendar and "Next good landing", "Explain", elevation-over-time graph, nearby alternatives, site finder, topographic layer | Matching endpoints | G4 |

- **Site finder:** before its contract step, the user decides how it looks (it was left open in the spec).
- **3D screens** (Screens 1 and 3) are the 3D teammate's, built against the same contract and sample answers from S2–S4 on.
- **If a gate slips,** the cut order in spec §13.3 applies; this list doesn't change it.

## 10. Left to the builder

- The tool used to generate MSW handlers from the OpenAPI schema.
- The preview host for the static app (any free static host that redeploys on push).
- Branch and worktree naming, and how each slice's steps are split.
- Test granularity within each step, as long as every step ends with a passing test and something visible.
