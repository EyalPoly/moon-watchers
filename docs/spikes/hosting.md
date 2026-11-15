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

`python -m build.api_load` replays what the web app asks for three cards, all requests at once like the browser: two 30-day missions at `sample_a`, one lunar day apart, and a 365-day mission at `sample_b`. That is 24 requests. Run against the API image started with `docker run --memory 512m --cpus 1`, which is what Cloud Run gives this service:

| | Result |
|---|---|
| Peak memory | about 155 MiB of 512 MiB (`docker stats`, sampled); idle 62 MiB; no OOM |
| First round, 24 requests at once | 6.4 s until the last answer |
| Second round (the same requests again) | 4.0 s; summaries answer in 0.12 s (cached), series about 0.25 s of CPU each |

Two things were fixed on the way:

- **A year-long window needed 533 MiB in one piece** (about 10 KiB of temporaries per 10-minute step), so one 365-day summary killed the container. `engine/series.py` now computes windows in 30-day pieces.
- **Many requests at once multiplied that.** The browser sends every month and every card together, and the server ran them all in parallel threads, so three cards killed the container even with pieces (the reviewer's run: OOM at 24 requests at once). `MAX_HEAVY_REQUESTS = 2` in `api/main.py` queues the heavy series and summary work, two at a time.

The time bars in the plan (3 s for a warm page, 1 s per request) are **not met at 1 vCPU**: a series month costs about 0.25 s of CPU, and a 365-day card needs 13 of them. The browser keeps each month cached, so only the first load pays. Decide whether that is acceptable, or whether the series computation should be made faster.

## Frontend

- Static previews on GitHub Pages, built by `.github/workflows/deploy.yml` on every push to `main`.
- `/product/` is all `sample`. `/integrated/` uses the committed `web/public/config.json`: `sites` is `real` (served by Cloud Run), `horizon`, `summary` and the series (which follows `summary`) are `real` since the redeploy of 15 Nov from `main` (revision `clps-api-00003-b6p`); `custom` stays `sample` until the API serves it (it has its own switch).

## Open

- Memory is measured in the image (see "Load and memory"); the deployed service itself has not been measured. `create_app()` imports no torch; torch is only imported inside `build/gpu_spike.py`.
- Credit runs out 90 days after signup: confirm the end date in the billing console and decide the judging-period host before then.
- A budget alert on the billing account has not been confirmed.
