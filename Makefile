.PHONY: test typecheck check contract fetch masks

fetch:
	uv run python -m build.fetch_sources $(if $(ONLY),--only $(ONLY))

masks:
	uv run python -m build.make_masks

contract:
	uv run python -m api.contract generate

test:
	uv run pytest
	pnpm --dir web test

typecheck:
	uv run mypy api engine build
	pnpm --dir web exec tsc -p tsconfig.app.json --noEmit

check: test typecheck
