.PHONY: test typecheck check contract fetch deploy

fetch:
	uv run python -m build.fetch_sources

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
