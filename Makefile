.PHONY: test typecheck check

test:
	uv run pytest
	pnpm --dir web test

typecheck:
	uv run mypy api engine build
	pnpm --dir web exec tsc -p tsconfig.app.json --noEmit

check: test typecheck
