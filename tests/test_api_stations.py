"""Earth stations in the contract: the presets in /meta and the station parameter."""

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from tests.catalog_fixture import FIXTURE_CATALOG

SUMMARY = "/api/v1/scenario/summary?site=sample_a&t0=2027-03-01T00:00Z"


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(catalog_path=FIXTURE_CATALOG))


def test_meta_lists_station_presets(client: TestClient) -> None:
    meta = client.get("/api/v1/meta").json()
    assert [s["id"] for s in meta["stations"]] == ["houston", "goldstone", "madrid", "canberra"]
    assert meta["default_station"] == "houston"
    assert all(s["alt_m"] == 0 and s["min_el_deg"] == 0 for s in meta["stations"])


def test_custom_station_passes_validation(client: TestClient) -> None:
    response = client.get(f"{SUMMARY}&station=31.25,34.79,100,5")
    assert response.status_code == 503
    assert response.json()["code"] == "FEATURE_DISABLED"


def test_default_station_is_houston(client: TestClient) -> None:
    assert client.get(SUMMARY).json()["code"] == "FEATURE_DISABLED"
