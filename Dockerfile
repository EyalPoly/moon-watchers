FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PROJECT_ENVIRONMENT=/opt/venv
RUN pip install --no-cache-dir uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY api ./api
COPY engine ./engine
COPY catalog ./catalog
COPY contract/samples ./contract/samples

ENV PATH="/opt/venv/bin:$PATH"
CMD ["sh", "-c", "exec uvicorn api.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8080}"]
