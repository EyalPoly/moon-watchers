import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from tests.catalog_fixture import FIXTURE_CATALOG

SAMPLES = Path("contract/samples")


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(catalog_path=FIXTURE_CATALOG))


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "max-age=60" in response.headers["cache-control"]


def test_meta_matches_sample(client: TestClient) -> None:
    response = client.get("/api/v1/meta")
    assert response.status_code == 200
    assert response.json() == json.loads((SAMPLES / "meta.json").read_text())
    assert "max-age=60" in response.headers["cache-control"]


def test_unknown_route_is_problem_json(client: TestClient) -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_PARAM"


def test_meta_is_validated_against_model(tmp_path: Path) -> None:
    shutil.copytree(SAMPLES, tmp_path / "samples")
    (tmp_path / "samples" / "meta.json").write_text('{"version": 1}')
    with pytest.raises(ValueError):
        create_app(sample_dir=tmp_path / "samples")


def test_cors_allows_read_only_cross_origin_gets(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"Origin": "https://example.github.io"})
    assert response.headers["access-control-allow-origin"] == "*"
    preflight = client.options(
        "/api/v1/health",
        headers={"Origin": "https://example.github.io", "Access-Control-Request-Method": "POST"},
    )
    assert "POST" not in preflight.headers.get("access-control-allow-methods", "")
