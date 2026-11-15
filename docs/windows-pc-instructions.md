# Instructions for the Windows PC session (RTX 4060)

You are picking up work started on the Mac. The horizon code changed, and the shipped horizon bundle has to be rebuilt here. Do the steps in order and stop at every "Ask the user" line.

## Why

- The far-ray step went from 240 m to 60 m (`engine/horizons.py`, `FAR_STEP_M`), and `HORIZON_ALGO_VERSION` went from "2" to "3".
- The API refuses any bundle with the old version, so the current bundle (`20261114-43266f39`, pinned in `deploy/bundle.lock.json`) no longer loads on this code.
- On the physics team's site B, a 240 m step overstated one day of sunlight by 1.75 h (17.12 h against 15.37 h). Details and tables: `docs/validation-sampling-limits.md`. Design: spec §7.2.

## 0. Get the code

```powershell
git fetch origin
git checkout feat/far-step-60m
git pull
uv sync
```

If the branch is not on origin, ask the user to push it from the Mac. `make` may not exist on Windows; every `make` target below is shown as the `uv run` command it wraps.

## 1. Check the sources are present

The default terrain set is `20m`: it needs `data/sources/lola/LDEM_80S_20MPP_ADJ.TIF` and its `_ERR.TIF`, plus the 80 m and 240 m files and the SPICE kernels in `data/sources/spice`.

```powershell
Get-ChildItem data\sources\lola, data\sources\spice
```

If the 20 m files or kernels are missing, run `uv run python -m build.fetch_sources` (this is `make fetch`). It downloads several hundred MB and a 20 m file larger than 1 GB: ask the user first.

## 2. Run the tests that need real data

```powershell
uv run pytest tests/test_converge.py tests/test_reference_horizon.py tests/test_trek_sun.py tests/test_physics_slope.py -q
```

`test_reference_horizon.py`, `test_trek_sun.py` and `test_physics_slope.py` skip themselves if their data is missing. A skip is not a pass: if any of them skipped, say so.

## 3. Convergence on the real catalog

```powershell
uv run python -m build.converge --sites <catalog site ids from catalog/sites.yaml>
```

Read the "far step 60 m vs 30 m" line for each site. Expected: under 0.01°. If any site is above 0.02°, stop and report it. Do not change `FAR_STEP_M` yourself.

Save the output to a file and show it to the user; the physics team has to confirm the 60 m step.

## 4. Build the bundle

```powershell
uv run python -m build.make_masks
```

This writes `bundle/<id>/`. Time it and note the duration. Check that the manifest says `"algo_version": "3"` and that every catalog site is listed with its warnings:

```powershell
Get-Content bundle\<id>\manifest.json | Select-String algo_version
```

If the run stops on a site, read the message. `check_near_coverage` and "no terrain elevation at the site" mean the 20 m file does not cover it: report the site, do not work around it.

## 5. Before and after for the physics team

Finer sampling changes the Sun and Earth-contact numbers on every card.

1. Start the API on the new bundle: `$env:BUNDLE_DIR = "bundle\<id>"; uv run uvicorn api.main:app --factory`.
2. For each catalog site, for the mission the user names, fetch `/api/v1/scenario/summary` (see `tests/test_api_summary.py` for the parameters) and record `sun_pct` and Earth-contact percent.
3. Do the same on the old bundle: download the old asset from the release named in `deploy/bundle.lock.json`, check out `main`, start the API on it, and record the same numbers.
4. Put both in a table (site, old, new, difference) and give it to the user.

## 6. Ship the bundle (only after the user says the physics team agreed)

Follow `docs/spikes/hosting.md`, "To ship a new bundle":

```powershell
cd bundle
python -m zipfile -c <id>.zip <id>/
(Get-FileHash <id>.zip -Algorithm SHA256).Hash.ToLower()
(Get-Item <id>.zip).Length
cd ..
gh release create bundle-<id> bundle\<id>.zip --title "Horizon bundle <id>" --notes "algo_version 3: far step 60 m"
```

Then put the asset URL, sha256, size and id in `deploy/bundle.lock.json`, commit and push.

**Ask the user** before `gh release create`, before pushing, and before `make deploy` (Cloud Run). Each of them is visible outside this machine.

## 7. Final check

```powershell
uv run pytest -q
uv run mypy api engine build deploy
pnpm --dir web test
pnpm --dir web exec tsc -p tsconfig.app.json --noEmit
```

Report: test counts with skips named, the convergence output, the build time, the before-and-after table, and anything you did not do.

## Do not

- Do not edit `engine/horizons.py` settings, the spec or the tests to make a step pass.
- Do not commit `bundle/`, `data/sources/` or the `.zip`.
- Do not add a `Co-Authored-By` trailer to commits.
