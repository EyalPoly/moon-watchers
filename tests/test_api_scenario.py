"""Contract-only routes for slices S2-S4: they validate their parameters and answer
FEATURE_DISABLED until the engine lands."""

from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from api.main import create_app
from api.models import StationPoint
from api.scenario import parse_station, station_text

SCENARIO = (
    "site=sample_a&t0=2027-03-01T00:00Z&days=30&panel=2&antenna=3"
    "&w=0.25,0.25,0.15,0.15,0.1,0.1,0&sun_req=6&slope=0,15,15&psr=1&margin=12&colors=70,40"
    "&station=29.7604,-95.3698,0,0"
)


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
        "site=sample_a&t0=2027-03-01T00:00Z&w=1,1,1,0",
    ],
)
def test_summary_rejects_bad_parameters(client: TestClient, query: str) -> None:
    assert_problem(client.get(f"/api/v1/scenario/summary?{query}"), 422, "INVALID_PARAM")


def test_series_needs_a_month(client: TestClient) -> None:
    assert_problem(client.get(f"/api/v1/scenario/series?{SCENARIO}"), 422, "INVALID_PARAM")


SUMMARY_BASE = "site=sample_a&t0=2027-03-01T00:00Z"
SUMMARY = f"/api/v1/scenario/summary?{SUMMARY_BASE}"


def test_parse_station_roundtrip() -> None:
    text = "29.7604,-95.3698,0,0"
    assert station_text(parse_station(text)) == text
    assert parse_station(text) == StationPoint(lat_deg=29.7604, lon_deg=-95.3698, alt_m=0, min_el_deg=0)


@pytest.mark.parametrize(
    "station", ["1,2,3", "abc", "95,0,0,0", "0,181,0,0", "0,0,-600,0", "0,0,0,50", "0,0,0,nan", ""]
)
def test_station_rejected(client: TestClient, station: str) -> None:
    assert_problem(client.get(f"{SUMMARY}&station={station}"), 422, "INVALID_PARAM")


@pytest.mark.parametrize(
    "query",
    ["panel=2.555", "panel=0.99", "panel=0", "antenna=10.01", "antenna=11", "panel=abc", "panel="],
)
def test_heights_rejected(client: TestClient, query: str) -> None:
    assert_problem(client.get(f"{SUMMARY}&{query}"), 422, "INVALID_PARAM")


@pytest.mark.parametrize("query", ["panel=2.5", "antenna=2.55", "panel=1", "antenna=10"])
def test_centimetre_heights_accepted(client: TestClient, query: str) -> None:
    assert_problem(client.get(f"{SUMMARY}&{query}"), 503, "FEATURE_DISABLED")


def test_horizon_mast_takes_centimetres_only(client: TestClient) -> None:
    assert_problem(client.get("/api/v1/sites/sample_a/horizon?mast=2.555"), 422, "INVALID_PARAM")


BAD_SETTINGS = [
    "w=1,1,1,0",
    "w=0,0,0,0,0,0,0",
    "w=0.33,0.25,0.15,0.15,0.1,0.1,0",
    "w=1.05,0,0,0,0,0,0",
    "slope=20,10,15",
    "slope=0,15",
    "slope=0,15,90.5",
    "colors=40,70",
    "colors=70.5,40",
    "psr=2",
    "margin=12.5",
    "margin=49",
    "sun_req=0.3",
    "sun_req=73",
    "sun_req=",
]


@pytest.mark.parametrize("setting", BAD_SETTINGS)
@pytest.mark.parametrize("route", ["summary", "series"])
def test_settings_rejected(client: TestClient, route: str, setting: str) -> None:
    extra = "&month=2027-03" if route == "series" else ""
    response = client.get(f"/api/v1/scenario/{route}?{SUMMARY_BASE}{extra}&{setting}")
    assert_problem(response, 422, "INVALID_PARAM")
    assert setting.split("=")[0] in response.json()["detail"]


@pytest.mark.parametrize(
    "setting",
    [
        "slope=10,10,90",
        "w=0,0,0,0,0,0,1",
        "margin=0",
        "colors=50,50",
        "sun_req=0",
        "w=0.250,0.25,0.15,0.15,0.10,0.1,0.0",
    ],
)
def test_settings_accepted(client: TestClient, setting: str) -> None:
    assert_problem(client.get(f"{SUMMARY}&{setting}"), 503, "FEATURE_DISABLED")


@pytest.mark.parametrize(
    ("t0", "code"),
    [
        ("2027-02-30T00:00Z", "INVALID_PARAM"),
        ("2025-12-31T23:50Z", "OUT_OF_TIME_RANGE"),
        ("2031-01-01T00:00Z", "OUT_OF_TIME_RANGE"),
    ],
)
def test_t0_rejected(client: TestClient, t0: str, code: str) -> None:
    assert_problem(client.get(f"/api/v1/scenario/summary?site=sample_a&t0={t0}"), 422, code)


def test_query_defaults_match_config(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    parameters = {p["name"]: p for p in schema["paths"]["/api/v1/scenario/summary"]["get"]["parameters"]}
    score = yaml.safe_load(Path("config/score.yaml").read_text())
    for spec in score["settings"]:
        canonical = ",".join(format(v, "g") for v in spec["default"])
        default = parameters[spec["key"]]["schema"]["default"]
        assert (default if isinstance(default, str) else format(default, "g")) == canonical


def test_meta_publishes_score_config(client: TestClient) -> None:
    meta = client.get("/api/v1/meta").json()
    assert len(meta["score"]["grades"]) == 7
    entry = next(e for e in meta["warning_catalog"] if e["code"] == "EXCLUDED_PSR")
    assert entry["severity"] == "blocking"
