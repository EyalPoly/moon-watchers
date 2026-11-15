FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv
RUN pip install --no-cache-dir uv

# rasterio's wheel bundles GDAL but not libexpat, which the slim image lacks.
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY api ./api
COPY engine ./engine
COPY catalog ./catalog
COPY config ./config
COPY contract/samples ./contract/samples

# The horizon bundle is a GitHub Release asset pinned by checksum, not part of the repo.
COPY deploy ./deploy
RUN python deploy/fetch_bundle.py --out /app/bundle
ENV BUNDLE_DIR=/app/bundle

ENV PATH="/opt/venv/bin:$PATH"
CMD ["sh", "-c", "exec uvicorn api.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8080}"]
