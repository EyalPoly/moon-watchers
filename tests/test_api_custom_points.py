import contextlib
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api.custom_points as custom_points
from api.custom_points import CustomPoints
from api.errors import ApiError
from api.main import MAX_HEAVY_REQUESTS, create_app
from engine.custom_point import NEAR, FAR
from tests.test_api_horizon import catalog_yaml
from tests.test_api_summary import make_bundle
from tests.test_custom_point import make_terrain, punch_hole

POINT = "pt_s89500_e045000"
BODY = {"lat_deg": -89.5, "lon_deg": 45.0}
AREA = (-90.0, -84.0)


@pytest.fixture(scope="module")
def world(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    root = tmp_path_factory.mktemp("custom")
    return {
        "bundle": make_bundle(root / "b"),
        "catalog": catalog_yaml(root / "sites.yaml"),
        "terrain": make_terrain(root / "t"),
    }


def make_client(world: dict[str, Path], terrain: Path | None | str = "default") -> TestClient:
    chosen = world["terrain"] if terrain == "default" else terrain
    return TestClient(create_app(catalog_path=world["catalog"], bundle_dir=world["bundle"], terrain_dir=chosen))  # type: ignore[arg-type]


@pytest.fixture
def counted(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []
    real = custom_points.compute_custom_point

    def spy(lat: float, lon: float, terrain_dir: Path):  # type: ignore[no-untyped-def]
        calls.append(f"{lat},{lon}")
        return real(lat, lon, terrain_dir)

    monkeypatch.setattr(custom_points, "compute_custom_point", spy)
    return calls


def test_post_returns_a_custom_site(world: dict[str, Path]) -> None:
    response = make_client(world).post("/api/v1/sites/custom", json=BODY)
    body = response.json()
    assert response.status_code == 200
    assert body["id"] == POINT and body["source"] == "custom" and body["slope_resolution_m"] == 80
    assert body["in_psr"] is None and body["name"] == "Custom point 89.500°S, 45.000°E"
    assert body["slope_deg"] == pytest.approx(7.0) and body["elevation_m"] == pytest.approx(100.0)


def test_post_is_idempotent_and_cached(world: dict[str, Path], counted: list[str]) -> None:
    client = make_client(world)
    first = client.post("/api/v1/sites/custom", json=BODY).json()
    second = client.post("/api/v1/sites/custom", json=BODY).json()
    assert first == second and len(counted) == 1


def test_get_site_recomputes_after_a_restart(world: dict[str, Path]) -> None:
    posted = make_client(world).post("/api/v1/sites/custom", json=BODY).json()
    fresh = make_client(world).get(f"/api/v1/sites/{POINT}")
    assert fresh.status_code == 200 and fresh.json() == posted


def test_non_canonical_id_returns_the_canonical_site(world: dict[str, Path], counted: list[str]) -> None:
    client = make_client(world)
    body = client.get("/api/v1/sites/pt_s89500_e45000").json()
    assert body["id"] == POINT
    client.get(f"/api/v1/sites/{POINT}")
    assert len(counted) == 1


def test_horizon_series_summary_work_for_a_custom_point(world: dict[str, Path]) -> None:
    client = make_client(world)
    horizon = client.get(f"/api/v1/sites/{POINT}/horizon?mast=2")
    series = client.get(f"/api/v1/scenario/series?site={POINT}&t0=2027-03-01T00:00Z&month=2027-03")
    summary = client.get(f"/api/v1/scenario/summary?site={POINT}&t0=2027-03-01T00:00Z")
    assert (horizon.status_code, series.status_code, summary.status_code) == (200, 200, 200)
    assert horizon.json()["site_id"] == POINT
    assert "CUSTOM_COARSE_TERRAIN" in horizon.json()["warnings"]
    assert "CUSTOM_COARSE_TERRAIN" in [w["code"] for w in summary.json()["warnings"]]


def test_point_without_terrain_is_out_of_coverage(world: dict[str, Path], tmp_path: Path) -> None:
    terrain = make_terrain(tmp_path)
    for name in (NEAR, FAR):
        punch_hole(terrain / name, -89.5, 45.0)
    client = make_client(world, terrain)
    assert client.post("/api/v1/sites/custom", json=BODY).status_code == 422
    response = client.get(f"/api/v1/sites/{POINT}")
    assert response.status_code == 422 and response.json()["code"] == "OUT_OF_COVERAGE"


def test_missing_terrain_file_is_terrain_read_failed(world: dict[str, Path], tmp_path: Path) -> None:
    terrain = make_terrain(tmp_path)
    (terrain / FAR).unlink()
    response = make_client(world, terrain).post("/api/v1/sites/custom", json=BODY)
    assert response.status_code == 503 and response.json()["code"] == "TERRAIN_READ_FAILED"


def test_point_outside_the_area_is_out_of_coverage(world: dict[str, Path]) -> None:
    response = make_client(world).post("/api/v1/sites/custom", json={"lat_deg": -83.9, "lon_deg": 0})
    assert response.status_code == 422 and response.json()["code"] == "OUT_OF_COVERAGE"


@pytest.mark.parametrize("path", ["/api/v1/sites/pt_s..%2f..%2fetc_e000000", "/api/v1/sites/pt_s89500_e045000%2f"])
def test_hostile_ids_are_unknown_sites(world: dict[str, Path], path: str) -> None:
    response = make_client(world).get(path)
    assert response.status_code == 404 and response.json()["code"] == "INVALID_PARAM"


def test_without_terrain_custom_points_are_disabled(world: dict[str, Path]) -> None:
    client = make_client(world, None)
    assert client.post("/api/v1/sites/custom", json=BODY).json()["code"] == "FEATURE_DISABLED"
    assert client.get(f"/api/v1/sites/{POINT}").status_code == 503
    assert client.get("/api/v1/meta").json()["capabilities"]["custom_points"] is False


def test_capability_follows_terrain(world: dict[str, Path]) -> None:
    assert make_client(world).get("/api/v1/meta").json()["capabilities"]["custom_points"] is True


def test_cors_allows_post(world: dict[str, Path]) -> None:
    response = make_client(world).options(
        "/api/v1/sites/custom",
        headers={"Origin": "https://example.github.io", "Access-Control-Request-Method": "POST"},
    )
    assert "POST" in response.headers["access-control-allow-methods"]


def test_rate_limit_through_the_api(world: dict[str, Path], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(custom_points, "NEW_PER_MINUTE", 2)
    client = make_client(world)
    codes = [client.post("/api/v1/sites/custom", json={"lat_deg": -89.5, "lon_deg": lon}).status_code for lon in (10, 20, 30)]
    assert codes == [200, 200, 429]
    assert client.post("/api/v1/sites/custom", json={"lat_deg": -89.5, "lon_deg": 10}).status_code == 200


def test_rate_limit_window_slides(world: dict[str, Path]) -> None:
    now = [0.0]
    store = CustomPoints(world["terrain"], contextlib.nullcontext(), AREA, new_per_minute=2, clock=lambda: now[0])
    store.get("pt_s89500_e010000")
    store.get("pt_s89500_e020000")
    with pytest.raises(ApiError) as caught:
        store.get("pt_s89500_e030000")
    assert caught.value.code == "RATE_LIMITED"
    store.get("pt_s89500_e010000")
    now[0] = 61.0
    store.get("pt_s89500_e030000")


def test_cache_is_bounded(world: dict[str, Path], counted: list[str]) -> None:
    store = CustomPoints(world["terrain"], contextlib.nullcontext(), AREA, capacity=3)
    ids = [f"pt_s89500_e0{lon}000" for lon in (10, 20, 30, 40)]
    for site_id in ids:
        store.get(site_id)
    assert len(counted) == 4
    store.get(ids[1])
    store.get(ids[2])
    store.get(ids[3])
    assert len(counted) == 4
    store.get(ids[0])
    assert len(counted) == 5


def test_concurrent_requests_compute_a_point_once(world: dict[str, Path], monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    real = custom_points.compute_custom_point

    def slow(lat: float, lon: float, terrain_dir: Path):  # type: ignore[no-untyped-def]
        calls.append(1)
        time.sleep(0.2)
        return real(lat, lon, terrain_dir)

    monkeypatch.setattr(custom_points, "compute_custom_point", slow)
    client = make_client(world)
    threads = [threading.Thread(target=client.get, args=(f"/api/v1/sites/{POINT}",)) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(calls) == 1


def test_heavy_work_is_limited(world: dict[str, Path], monkeypatch: pytest.MonkeyPatch) -> None:
    state = {"now": 0, "peak": 0}
    lock = threading.Lock()
    real = custom_points.compute_custom_point

    def slow(lat: float, lon: float, terrain_dir: Path):  # type: ignore[no-untyped-def]
        with lock:
            state["now"] += 1
            state["peak"] = max(state["peak"], state["now"])
        time.sleep(0.1)
        try:
            return real(lat, lon, terrain_dir)
        finally:
            with lock:
                state["now"] -= 1

    monkeypatch.setattr(custom_points, "compute_custom_point", slow)
    client = make_client(world)
    paths = [f"/api/v1/sites/pt_s89500_e0{lon}000" for lon in range(10, 18)]
    threads = [threading.Thread(target=client.get, args=(p,)) for p in paths]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert 1 <= state["peak"] <= MAX_HEAVY_REQUESTS
