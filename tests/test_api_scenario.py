"""Contract-only routes for slices S2-S4: they validate their parameters and answer
FEATURE_DISABLED until the engine lands."""

import pytest
from fastapi.testclient import TestClient

from api.main import create_app

SCENARIO = "site=sample_a&t0=2027-03-01T00:00Z&days=29.53&mast=2&w=1.0,1.0,1.0,0.0&station=any"


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def assert_problem(response, status: int, code: str) -> None:  # type: ignore[no-untyped-def]
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == code


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/sites/sample_a/horizon?mast=2",
        f"/api/v1/scenario/summary?{SCENARIO}",
        f"/api/v1/scenario/series?{SCENARIO}&month=2027-03",
    ],
)
def test_contract_routes_answer_feature_disabled(client: TestClient, path: str) -> None:
    assert_problem(client.get(path), 503, "FEATURE_DISABLED")


def test_horizon_unknown_site_is_404(client: TestClient) -> None:
    assert_problem(client.get("/api/v1/sites/nope/horizon"), 404, "INVALID_PARAM")


@pytest.mark.parametrize(
    "query",
    [
        "site=sample_a&t0=2027-03-01T00:05Z",  # off the 10-minute grid
        "site=sample_a&t0=2027-03-01",  # no time
        "site=sample_a&t0=2027-03-01T00:00Z&days=0",
        "site=sample_a&t0=2027-03-01T00:00Z&mast=11",
        "site=sample_a&t0=2027-03-01T00:00Z&w=1,1,1",
        "site=sample_a&t0=2027-03-01T00:00Z&station=houston",
    ],
)
def test_summary_rejects_bad_parameters(client: TestClient, query: str) -> None:
    assert_problem(client.get(f"/api/v1/scenario/summary?{query}"), 422, "INVALID_PARAM")


def test_series_needs_a_month(client: TestClient) -> None:
    assert_problem(client.get(f"/api/v1/scenario/series?{SCENARIO}"), 422, "INVALID_PARAM")
