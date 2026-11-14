from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from api.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_sites_list(client: TestClient) -> None:
    response = client.get("/api/v1/sites")
    assert response.status_code == 200
    assert [s["id"] for s in response.json()["sites"]] == ["sample_a", "sample_b", "sample_c"]


def test_site_by_id(client: TestClient) -> None:
    response = client.get("/api/v1/sites/sample_b")
    assert response.status_code == 200
    assert response.json()["name"] == "Sample site B"


def test_unknown_site_404_problem_json(client: TestClient) -> None:
    response = client.get("/api/v1/sites/nope")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_PARAM"


@pytest.mark.parametrize("hostile", ["../x", "%2e%2e", "a" * 200, "x y", "%00", "..%2f..%2fetc%2fpasswd"])
def test_hostile_ids(client: TestClient, hostile: str) -> None:
    response = client.get(f"/api/v1/sites/{hostile}")
    assert response.status_code in (404, 422)
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_PARAM"


def test_broken_catalog_stops_startup(tmp_path: Path) -> None:
    path = tmp_path / "sites.yaml"
    path.write_text(yaml.safe_dump({"sites": [{"id": "only_id"}]}))
    with pytest.raises(ValueError):
        create_app(catalog_path=path)
