"""POST /sites/custom: contract only until the engine can build a point's terrain."""

import pytest
from fastapi.testclient import TestClient

from api.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_point_inside_the_area_reaches_the_engine_gate(client: TestClient) -> None:
    response = client.post("/api/v1/sites/custom", json={"lat_deg": -87.5, "lon_deg": 45})
    assert response.status_code == 503
    assert response.json()["code"] == "FEATURE_DISABLED"


@pytest.mark.parametrize("lat", [-83.9, -60, 10])
def test_point_outside_the_area_is_out_of_coverage(client: TestClient, lat: float) -> None:
    response = client.post("/api/v1/sites/custom", json={"lat_deg": lat, "lon_deg": 0})
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "OUT_OF_COVERAGE"


@pytest.mark.parametrize("body", [{}, {"lat_deg": -87}, {"lat_deg": -95, "lon_deg": 0}, {"lat_deg": "x", "lon_deg": 0}])
def test_bad_bodies_are_invalid_param(client: TestClient, body: dict[str, object]) -> None:
    response = client.post("/api/v1/sites/custom", json=body)
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PARAM"
