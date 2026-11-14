.PHONY: test typecheck check contract fetch masks ephemeris deploy

fetch:
	uv run python -m build.fetch_sources $(if $(ONLY),--only $(ONLY))

masks:
	uv run python -m build.make_masks $(if $(TERRAIN),--terrain $(TERRAIN))

ephemeris:
	uv run python -m build.make_masks --ephemeris-only

contract:
	uv run python -m api.contract generate

test:
	uv run pytest
	pnpm --dir web test

typecheck:
	uv run mypy api engine build
	pnpm --dir web exec tsc -p tsconfig.app.json --noEmit

check: test typecheck

GCLOUD ?= gcloud
GCP_PROJECT ?= clps-514710
GCP_REGION ?= europe-west1

deploy:
	$(GCLOUD) run deploy clps-api --source . --project $(GCP_PROJECT) --region $(GCP_REGION) \
		--allow-unauthenticated --max-instances 2 --memory 512Mi
