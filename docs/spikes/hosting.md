# Hosting decision

Status: **decided for the API** (Google Cloud Run). GPU hosting is not offered, so heavy computation stays offline.

## API host

- Service `clps-api` on Cloud Run, project `clps-514710`, region `europe-west1`: https://clps-api-982577966589.europe-west1.run.app
- Funded by the Space Apps Google Cloud offer: $300 credit to spend within 90 days, no auto-charge when it ends (offer page, 2026-11-14). The project is owned by a teammate's account; the deploying account has the Editor role.
- Public (unauthenticated) so judges can reach it. Capped at 2 instances and 512 MiB so a traffic spike cannot run up the bill.
- CPU only. The offer pages mention no GPU quota, so anything needing a GPU is computed on the team's Windows PC (RTX 4060) and shipped as data.
- Deploy by hand with `make deploy GCLOUD=<path to gcloud>`: it builds the `Dockerfile` in Cloud Build and rolls out a new revision. No CI job deploys the API.
- The default compute service account needed `roles/cloudbuild.builds.builder` before the first source deploy would build.

## Horizon bundle

The API serves skylines from a bundle (`make masks`), which is not in the repo. It is a GitHub Release asset, pinned by checksum in `deploy/bundle.lock.json`; the `Dockerfile` downloads it while the image is built (`deploy/fetch_bundle.py`: size and sha256 checked, bundle id compared with the lock, unpacked to `/app/bundle`, `BUNDLE_DIR` set). A build with a wrong or missing asset fails instead of shipping an image without horizons.

To ship a new bundle:

1. `make masks`, then `cd bundle && python3 -m zipfile -c <id>.zip <id>/`.
2. `gh release create bundle-<id> bundle/<id>.zip --title "Horizon bundle <id>" --notes "..."`.
3. Put the asset's URL, `sha256sum` and size (`stat -c %s`) into `deploy/bundle.lock.json`, together with the id, and commit.
4. `make deploy`, then check `GET /api/v1/sites/sample_a/horizon` and that `config.json` can switch `horizon` to `real`.

The bundle is 8 MB (masks 0.4 MB, ephemeris and Earth-rotation tables 7.6 MB), so memory stays far below 512 MiB. Terrain for custom points is a separate, later question (spec §6.6).

## Load and memory (15 Nov, the 20 m bundle `20261114-43266f39`, 3 placeholder sites)

`python -m build.api_load` replays what the web app asks for three cards: two 30-day missions at `sample_a`, one lunar day apart, and a 365-day mission at `sample_b`. That is 24 requests, 6 at a time. Run against the API image started with `docker run --memory 512m`:

| | Result |
|---|---|
| Warm round (second), all 24 requests | 1.45 s wall; slowest request 0.63 s |
| Cold round (first) | 3.44 s wall; slowest request 2.0 s (the first summary) |
| Peak memory | about 229 MiB of 512 MiB (sampled with `docker stats`); idle 62 MiB |

Before the fix in `engine/series.py` a single 365-day summary was enough to kill the container (OOM), because the series maths built about 10 KiB of temporaries per 10-minute step (533 MiB for a year). Windows are now computed in 30-day pieces.

## Frontend

- Static previews on GitHub Pages, built by `.github/workflows/deploy.yml` on every push to `main`.
- `/product/` is all `sample`. `/integrated/` uses the committed `web/public/config.json`: `sites` is `real` (served by Cloud Run), `horizon` is `real` since the bundle deploy of 15 Nov (revision `clps-api-00002-l94`); `summary` and `custom` stay `sample` until the API serves them (`custom` has its own switch, so the horizon can be real first).

## Open

- API memory is not measured yet. `create_app()` imports no torch; torch is only imported inside `build/gpu_spike.py`.
- Credit runs out 90 days after signup: confirm the end date in the billing console and decide the judging-period host before then.
- A budget alert on the billing account has not been confirmed.
