# CLPS Lunar Mission Browser

Lunar Landing Site Navigator for the south pole (NASA Space Apps 2026).

## Previews

Deployed from `main` by GitHub Pages (after the repo is public and Pages is set to "GitHub Actions"):

- Product (always sample data): https://eyalpoly.github.io/moon-watchers/product/
- Integrated (uses the committed `web/public/config.json`): https://eyalpoly.github.io/moon-watchers/integrated/

## Develop

- `make check` runs the Python and web tests and both typechecks.
- Python: `uv sync`; web: `pnpm --dir web install`.
