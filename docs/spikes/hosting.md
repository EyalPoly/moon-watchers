# Hosting decision

Status: **decided for the API** (Google Cloud Run). GPU hosting is not offered, so heavy computation stays offline.

## API host

- Service `clps-api` on Cloud Run, project `clps-514710`, region `europe-west1`: https://clps-api-982577966589.europe-west1.run.app
- Funded by the Space Apps Google Cloud offer: $300 credit to spend within 90 days, no auto-charge when it ends (offer page, 2026-11-14). The project is owned by a teammate's account; the deploying account has the Editor role.
- Public (unauthenticated) so judges can reach it. Capped at 2 instances and 512 MiB so a traffic spike cannot run up the bill.
- CPU only. The offer pages mention no GPU quota, so anything needing a GPU is computed on the team's Windows PC (RTX 4060) and shipped as data.
- Deploy by hand with `make deploy GCLOUD=<path to gcloud>`: it builds the `Dockerfile` in Cloud Build and rolls out a new revision. No CI job deploys the API.
- The default compute service account needed `roles/cloudbuild.builds.builder` before the first source deploy would build.

## Frontend

- Static previews on GitHub Pages, built by `.github/workflows/deploy.yml` on every push to `main`.
- `/product/` is all `sample`. `/integrated/` uses the committed `web/public/config.json`: `sites` is `real` (served by Cloud Run), `horizon` and `summary` stay `sample` until the API serves them.

## Open

- API memory is not measured yet. `create_app()` imports no torch; torch is only imported inside `build/gpu_spike.py`.
- Credit runs out 90 days after signup: confirm the end date in the billing console and decide the judging-period host before then.
- A budget alert on the billing account has not been confirmed.
