"""Earth stations in the contract: the DSN list in /meta and the custom-station parameters."""

import pytest
from fastapi.testclient import TestClient

from api.main import create_app

SUMMARY = "/api/v1/scenario/summary?site=sample_a&t0=2027-03-01T00:00Z"


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


@pytest.mark.parametrize(
    "query",
    [
        "station=custom",
        "station=custom&station_lat=10",
        "station=madrid&station_lat=10&station_lon=10",
        "station=any&station_lon=10",
        "station=custom&station_lat=95&station_lon=10",
    ],
)
def test_station_parameters_must_match(client: TestClient, query: str) -> None:
    response = client.get(f"{SUMMARY}&{query}")
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PARAM"


def test_custom_station_with_coordinates_passes_validation(client: TestClient) -> None:
    response = client.get(f"{SUMMARY}&station=custom&station_lat=31.25&station_lon=34.79")
    assert response.status_code == 503
    assert response.json()["code"] == "FEATURE_DISABLED"


def test_meta_lists_the_dsn_stations(client: TestClient) -> None:
    stations = client.get("/api/v1/meta").json()["stations"]
    assert [s["id"] for s in stations] == ["goldstone", "madrid", "canberra"]
