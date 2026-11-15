# Bundle build on the PC with the terrain files

For whoever (or whichever Claude Code session) builds the horizon bundle on the Windows PC. The code and this note travel in git; the large terrain files do not.

## Why a new bundle is needed

- The pinned bundle in `deploy/bundle.lock.json` was built with horizon algorithm version 1. The engine on `main` is version 2, and the API refuses a bundle with another version, so deploying `main` with the pinned bundle would not start.
- The API also refuses a bundle that lacks a catalog site, or has one at different coordinates. The bundle must be built from the exact `catalog/sites.yaml` that ships with it.

## Steps

1. Get the code: `git clone https://github.com/EyalPoly/moon-watchers.git` and `git switch catalog-draft` (or the branch the pull request names).
2. Install [uv](https://docs.astral.sh/uv/) and the GitHub CLI (`gh auth login`). Node and pnpm are not needed.
3. Make the terrain files visible at `data/sources/`, which is git-ignored. Copy your existing folder there, or link it (`mklink /J data\sources <your sources folder>`). It needs:
   - the 20 m, 80 m and 240 m LOLA elevation files under `lola/`, each with its `_ERR` file
   - the SPICE kernels under `spice/` (`uv run python -m build.fetch_sources` downloads what is missing)
4. `uv sync`
5. Check the catalog: `uv run python -m api.catalog --final`. Expect `N sites OK`.
6. Build: `uv run python -m build.make_masks` (the `make` command may not exist on Windows). It builds the `20m` bundle and stops if the 20 m file is missing, or if a site's 12 km near zone falls outside that file. Expect one `bundle/<id>` folder; note the id.
7. Zip it, with the folder at the top of the archive: `cd bundle` then `python -m zipfile -c <id>.zip <id>/`.
8. Publish it as a release asset: `gh release create bundle-<id> bundle/<id>.zip --title "Horizon bundle <id>" --notes "<catalog name and site count>"`.
9. Put the asset's URL, its size in bytes and its sha256 (`certutil -hashfile <id>.zip SHA256`) into `deploy/bundle.lock.json`, together with `bundle_id`, and update its `note`.
10. Open a pull request with the catalog and the lock file. Do not run `make deploy`.

## Check before the pull request

With the new bundle unpacked at `<path>`: `set BUNDLE_DIR=<path>` and `uv run python -c "from api.main import create_app; create_app(); print('starts')"` must print `starts`. A site that moved, or a missing site, shows as `BundleError` naming it.
