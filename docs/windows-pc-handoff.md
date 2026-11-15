# Windows PC: after pulling `feat/far-step-60m`

The horizon algorithm version went from 2 to 3 (far step 240 m to 60 m). The API refuses a bundle built with version 2, so the masks must be rebuilt here.

1. `git pull` and check out `feat/far-step-60m` (or `main` once merged); `uv sync`.
2. Check the full-size convergence on the real catalog: `uv run python -m build.converge --sites <catalog site ids>`. The "far step 60 m vs 30 m" line should stay under 0.01° for every site. Send the output to the physics team; they must confirm the 60 m step.
3. Rebuild the masks: `make masks` (all catalog sites, 20 m terrain). Time it and note the duration.
4. Copy the new bundle to where the server reads it (`BUNDLE_DIR`) and redeploy.
5. Before and after for the physics team: sunlight percentage and Earth contact per catalog site with the old and new bundle. Finer sampling changes these numbers on every card.
6. `uv run pytest` and `pnpm --dir web test` should pass.

Evidence and wording for the validation page: `docs/validation-sampling-limits.md`.
