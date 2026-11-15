# Jobs for the PC that has the terrain files

Two jobs, in this order: publish the terrain (custom points), then build the horizon bundle (the 30 catalog sites). The code and this note travel in git; the large files do not.

## Why

- **Terrain:** custom points are computed by the API from 80 m and 240 m terrain, so the image must contain those files. They are about 1.2 GB, so they go up as a GitHub Release asset and the image build downloads them.
- **Bundle:** the pinned bundle in `deploy/bundle.lock.json` was built with horizon algorithm version 1, but the engine on `main` is version 2, and the API refuses a bundle with another version. The API also refuses a bundle that lacks a catalog site or has one at different coordinates. So a new bundle must be built from the exact `catalog/sites.yaml` that ships with it (already in this branch: 30 sites).

## Setup (once)

1. `git clone https://github.com/EyalPoly/moon-watchers.git`, then `git switch catalog-draft`.
2. Install [uv](https://docs.astral.sh/uv/) and the GitHub CLI, then `gh auth login`. Node and pnpm are not needed.
3. Make the terrain files visible at `data/sources/` (git-ignored): copy or link your existing folder (`mklink /J data\sources <your sources folder>`). The build needs the 20 m, 80 m and 240 m LOLA elevation files under `lola/`, each with its `_ERR` file, and the SPICE kernels under `spice/` (`uv run python -m build.fetch_sources` downloads what is missing).
4. `uv sync`

## Job 1: publish the terrain

From the repo folder (PowerShell or Git Bash):

```
gh release create terrain-80m-20261115 --repo EyalPoly/moon-watchers --title "Terrain for custom points (80 m and 240 m)" --notes "NASA PGDA LOLA product 90: 80 m and 240 m elevation, error rasters, and the 80 m slope map." data/sources/lola/LDEM_80S_80MPP_ADJ.TIF data/sources/lola/LDEM_80S_80MPP_ADJ_ERR.TIF data/sources/lola/LDEM_60S_240MPP_ADJ.TIF data/sources/lola/LDEM_60S_240MPP_ADJ_ERR.TIF data/sources/layers/slope/LDSM_80S_80MPP_ADJ.TIF
```

It uploads about 1.2 GB (the largest file is 267 MB). Then tell the Mac session the tag name; it reads the size and checksum of each asset from GitHub and writes `deploy/terrain.lock.json`. (If the `custom-points` code is already on `main`, you can instead run `uv run python -m build.pack_terrain --repo EyalPoly/moon-watchers --tag terrain-80m-20261115`, which writes that lock itself.)

## Job 2: build the catalog bundle

1. `uv run python -m api.catalog --final`. Expect `30 sites OK`.
2. `uv run python -m build.make_masks` (the `make` command may not exist on Windows). It builds the `20m` bundle. It stops if the 20 m file is missing, or if a site's 12 km near zone falls outside that file. Expect one `bundle/<id>` folder; note the id.
3. Zip it with the folder at the top of the archive: `cd bundle`, then `python -m zipfile -c <id>.zip <id>/`.
4. Publish it: `gh release create bundle-<id> bundle/<id>.zip --title "Horizon bundle <id>" --notes "30-site catalog, 20 m terrain, algorithm version 2"`.
5. Put the asset's URL, its size in bytes and its sha256 (`certutil -hashfile <id>.zip SHA256`) into `deploy/bundle.lock.json` with `bundle_id`, and update its `note`.
6. Commit the lock to this branch and push. Do not run `make deploy`; the Mac session deploys.

## Check before pushing

With the new bundle unpacked at `<path>`: `set BUNDLE_DIR=<path>` and `uv run python -c "from api.main import create_app; create_app(); print('starts')"` must print `starts`. A site that moved, or a missing site, shows as a `BundleError` naming it.
