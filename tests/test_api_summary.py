import json
from datetime import UTC, datetime
from pathlib import Path

from types import SimpleNamespace

import numpy as np
import pytest
import yaml
from fastapi.testclient import TestClient

import api.summary_json as summary_json
from api.bundle import load_bundle
from api.main import create_app
from api.models import SummaryResponse
from api.score_config import load_configs
from api.warnings import make_warning
from build.make_masks import build_bundle
from engine.geometry import Station
from engine.horizons import mask_at_height
from engine.metrics import compute_metrics
from engine.score import GRADE_IDS, GRADE_NAMES, GradeInputs, ScorePolicy, dust_index, site_score
from engine.series import compute_series
from tests.ephemeris_helpers import synthetic_ephemeris
from tests.test_api_horizon import write_world
from tests.test_masks_build import CATALOG
from engine.terrain import project

SUMMARY = "/api/v1/scenario/summary?site=s1&t0=2027-03-01T00:00Z"
WIDE = synthetic_ephemeris(datetime(2027, 2, 26, tzinfo=UTC), 38)


def make_bundle(root: Path, ephemeris=WIDE, hole: bool = False) -> Path:  # type: ignore[no-untyped-def]
    hole_at = None
    if hole:
        hole_at = (52_000.0, float(project(-89.0, 0.0)[1]))
    write_world(root / "sources", hole_at=hole_at)
    return build_bundle(CATALOG, root / "sources", root / "bundle", ephemeris)


def write_catalog(path: Path, **per_site: dict) -> Path:  # type: ignore[type-arg]
    sites = []
    for site in CATALOG.values():
        entry = site.model_dump()
        entry.update(per_site.get(site.id, {}))
        sites.append(entry)
    path.write_text(yaml.safe_dump({"sites": sites}))
    return path


@pytest.fixture(scope="module")
def bundle_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return make_bundle(tmp_path_factory.mktemp("summary"))


@pytest.fixture(scope="module")
def catalog_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return write_catalog(
        tmp_path_factory.mktemp("cat") / "sites.yaml", s1={"slope_deg": 4.2}, s2={"in_psr": True}
    )


@pytest.fixture(scope="module")
def client(bundle_dir: Path, catalog_path: Path) -> TestClient:
    return TestClient(create_app(catalog_path=catalog_path, bundle_dir=bundle_dir))


def codes(items: list[dict]) -> list[str]:  # type: ignore[type-arg]
    return [item["code"] for item in items]


def test_summary_ok(client: TestClient) -> None:
    response = client.get(SUMMARY)
    body = response.json()
    assert response.status_code == 200
    assert body["metrics"]["window"] == ["2027-02-28T12:00Z", "2027-03-31T00:00Z"]
    assert len(body["daily"]["sun_pct"]) == 31
    assert [f["name"] for f in body["score"]["factors"]] == list(GRADE_IDS)
    assert body["score"]["status"] == "illustrative"
    assert "NaN" not in response.text
    SummaryResponse.model_validate(body)


def test_summary_matches_engine(client: TestClient, bundle_dir: Path) -> None:
    body = client.get(SUMMARY).json()
    bundle = load_bundle(bundle_dir, CATALOG)
    site = CATALOG["s1"]
    masks = bundle.masks["s1"]
    series = compute_series(
        bundle.ephemeris, site.lat_deg, site.lon_deg, site.elevation_m,
        mask_at_height(masks, 2)[0].astype(np.float64), mask_at_height(masks, 3)[0].astype(np.float64),
        2.0, 3.0, Station(29.7604, -95.3698, 0.0, 0.0), datetime(2027, 2, 28, 12, tzinfo=UTC), 4392,
    )
    m = compute_metrics(series, 72)
    for key, digits in (("sun_pct", 2), ("dte_pct", 2), ("both_pct", 2), ("sun_disk_mean", 4),
                        ("contact_mean", 4), ("longest_dark_h", 2), ("longest_no_contact_h", 2),
                        ("first_sun_h", 2), ("unknown_h", 2)):
        assert body["metrics"][key] == round(getattr(m, key), digits), key
    policy = ScorePolicy((0.25, 0.25, 0.15, 0.15, 0.1, 0.1, 0), 6, 0, 15, 15, True, 70, 40)
    dust = float(dust_index(site.lat_deg, site.lon_deg))
    score = site_score(
        GradeInputs(m.sun_disk_mean, m.contact_mean, m.longest_dark_h, m.longest_no_contact_h, m.window_h,
                    m.first_sun_h, 4.2, dust, float("nan")),
        policy,
    )
    assert body["score"]["value"] == score.value
    assert body["score"]["category"] == score.category
    assert body["score"]["deciding"] == score.deciding
    assert [f["points_lost"] for f in body["score"]["factors"]] == [round(f.points_lost, 2) for f in score.factors]


def test_dem_hole_gives_null_and_warning(tmp_path: Path, catalog_path: Path) -> None:
    app = create_app(catalog_path=catalog_path, bundle_dir=make_bundle(tmp_path, hole=True))
    body = TestClient(app).get(SUMMARY).json()
    assert body["metrics"]["sun_pct"] is None
    assert "NULL_GRADE:light" in codes(body["warnings"]) and "DEM_GAPS" in codes(body["warnings"])
    assert isinstance(body["score"]["value"], int | float)
    assert body["rag"]["sun"]["color"] == "unknown"
    assert "unavailable" in body["rag"]["sun"]["reason"]
    assert "Missing grades counted as 0: sunlight" in body["score"]["explanation"]


def test_earth_orientation_warning(client: TestClient, tmp_path: Path, catalog_path: Path) -> None:
    assert "EARTH_ORIENTATION_PREDICTED" in codes(client.get(SUMMARY).json()["warnings"])
    early = make_bundle(tmp_path, synthetic_ephemeris(datetime(2026, 2, 26, tzinfo=UTC), 38))
    other = TestClient(create_app(catalog_path=catalog_path, bundle_dir=early))
    body = other.get("/api/v1/scenario/summary?site=s1&t0=2026-03-01T00:00Z").json()
    assert "EARTH_ORIENTATION_PREDICTED" not in codes(body["warnings"])


def test_psr_unknown_and_switch(client: TestClient) -> None:
    assert "PSR_UNKNOWN" in codes(client.get(SUMMARY).json()["warnings"])
    assert "PSR_UNKNOWN" not in codes(client.get(f"{SUMMARY}&psr=0").json()["warnings"])


def test_psr_site_excluded(client: TestClient) -> None:
    body = client.get(SUMMARY.replace("site=s1", "site=s2")).json()
    assert body["score"]["value"] == 0 and body["score"]["category"] == "excluded"
    assert body["score"]["excluded_reason"] == "psr" and body["score"]["deciding"] == []
    assert body["warnings"][0]["code"] == "EXCLUDED_PSR"
    assert body["score"]["explanation"] == body["warnings"][0]["text"]


def test_slope_gate_from_setting(client: TestClient) -> None:
    body = client.get(f"{SUMMARY}&slope=0,15,4").json()
    assert body["score"]["excluded_reason"] == "slope" and body["score"]["value"] == 0
    slope_warning = next(w for w in body["warnings"] if w["code"] == "EXCLUDED_SLOPE")
    assert "4.2°" in slope_warning["text"] and "4°" in slope_warning["text"]


def test_margin_moves_window(client: TestClient) -> None:
    body = client.get(f"{SUMMARY}&margin=0").json()
    assert body["metrics"]["window"][0] == "2027-03-01T00:00Z"
    assert len(body["daily"]["sun_pct"]) == 30


def test_rescoring_reuses_metrics(
    monkeypatch: pytest.MonkeyPatch, bundle_dir: Path, catalog_path: Path
) -> None:
    calls = []
    real = summary_json.compute_series

    def counting(*args, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(1)
        return real(*args, **kwargs)

    monkeypatch.setattr(summary_json, "compute_series", counting)
    fresh = TestClient(create_app(catalog_path=catalog_path, bundle_dir=bundle_dir))
    assert fresh.get(SUMMARY).status_code == 200
    assert len(calls) == 1
    first = fresh.get(f"{SUMMARY}&w=0.6,0.2,0,0,0,0.1,0.1")
    assert len(calls) == 1
    assert first.json()["score"]["value"] != fresh.get(SUMMARY).json()["score"]["value"]
    fresh.get(f"{SUMMARY}&margin=6")
    assert len(calls) == 2


def test_custom_flag(client: TestClient) -> None:
    default = client.get(SUMMARY).json()["score"]
    assert default["settings"]["custom"] is False
    custom = client.get(f"{SUMMARY}&colors=80,40").json()["score"]
    assert custom["settings"]["custom"] is True
    expected = "green" if custom["value"] >= 80 else "amber" if custom["value"] >= 40 else "red"
    assert custom["category"] == expected


def test_t0_edges(tmp_path: Path, catalog_path: Path) -> None:
    full = make_bundle(tmp_path, synthetic_ephemeris(datetime(2025, 12, 31, tzinfo=UTC), 2193))
    edge = TestClient(create_app(catalog_path=catalog_path, bundle_dir=full))
    base = "/api/v1/scenario/summary?site=s1"
    assert edge.get(f"{base}&t0=2026-01-01T00:00Z").status_code == 200
    late = edge.get(f"{base}&t0=2026-01-01T00:00Z&margin=48")
    assert late.status_code == 422 and late.json()["code"] == "OUT_OF_TIME_RANGE"
    assert "2025-12-30T00:00Z" in late.json()["detail"]
    assert edge.get(f"{base}&t0=2030-12-31T23:50Z&days=365").status_code == 200


def test_unknown_site_404(client: TestClient) -> None:
    response = client.get(SUMMARY.replace("site=s1", "site=nope"))
    assert response.status_code == 404 and response.json()["code"] == "INVALID_PARAM"


def test_no_bundle_503(catalog_path: Path) -> None:
    response = TestClient(create_app(catalog_path=catalog_path)).get(SUMMARY)
    assert response.status_code == 503 and response.json()["code"] == "FEATURE_DISABLED"


def test_versioned_get_is_immutable(client: TestClient) -> None:
    assert "immutable" in client.get(f"{SUMMARY}&v=abc").headers["cache-control"]
    assert "immutable" not in client.get(SUMMARY).headers.get("cache-control", "")


def test_version_names_bundle(client: TestClient, bundle_dir: Path) -> None:
    bundle_id = json.loads((bundle_dir / "manifest.json").read_text())["bundle_id"]
    assert client.get(SUMMARY).json()["version"].startswith(f"{bundle_id}.")


def test_warning_codes_catalogued() -> None:
    catalog = load_configs(Path("config")).warnings
    emitted = ["DEM_GAPS", "UNCERTAINTY_UNAVAILABLE", "EARTH_ORIENTATION_PREDICTED",
               "PSR_UNKNOWN", "EXCLUDED_PSR", "EXCLUDED_SLOPE"]
    emitted += [f"NULL_GRADE:{name}" for name in GRADE_NAMES.values()]
    for code in emitted:
        assert make_warning(code, catalog, label="Sunlight", slope="4.2", max="4").text


def test_summary_route_maps_engine_value_errors_to_422(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(*args: object, **kwargs: object) -> None:
        raise ValueError("year 12000 is out of range")

    monkeypatch.setattr("api.main.mission_series", broken)
    response = client.get(f"{SUMMARY}&days=2")
    assert response.status_code == 422 and response.json()["code"] == "OUT_OF_TIME_RANGE"


def test_unknown_bundle_warning_code_does_not_fail(tmp_path: Path, catalog_path: Path) -> None:
    root = make_bundle(tmp_path)
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["sites"]["s1"]["warnings"].append("FUTURE_CODE")
    manifest_path.write_text(json.dumps(manifest))
    body = TestClient(create_app(catalog_path=catalog_path, bundle_dir=root)).get(SUMMARY).json()
    unknown = next(w for w in body["warnings"] if w["code"] == "FUTURE_CODE")
    assert unknown == {
        "code": "FUTURE_CODE",
        "text": "Data warning FUTURE_CODE: no description available.",
        "severity": "caution",
        "affects": "all",
    }
    assert body["warnings"][-1]["severity"] != "blocking"


def test_chip_color_follows_the_rounded_percentage() -> None:
    configs = load_configs(Path("config"))
    near = SimpleNamespace(sun_pct=59.96, dte_pct=29.96, unknown_h=0.0)
    chips = summary_json.rag_chips(near, 4.2, configs.rag)  # type: ignore[arg-type]
    assert "60.0%" in chips.sun.reason and chips.sun.color == "green"
    assert "30.0%" in chips.dte.reason and chips.dte.color == "amber"


def test_heavy_summary_work_runs_at_most_two_at_a_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import threading
    import time

    import api.main as main

    bundle = make_bundle(tmp_path)
    catalog = tmp_path / "sites.yaml"
    catalog.write_text(yaml.safe_dump({"sites": [s.model_dump() for s in CATALOG.values()]}))
    client = TestClient(create_app(catalog_path=catalog, bundle_dir=bundle))
    real = main.mission_series
    lock = threading.Lock()
    state = {"now": 0, "peak": 0}

    def slow(*args, **kwargs):  # type: ignore[no-untyped-def]
        with lock:
            state["now"] += 1
            state["peak"] = max(state["peak"], state["now"])
        time.sleep(0.05)
        try:
            return real(*args, **kwargs)
        finally:
            with lock:
                state["now"] -= 1

    monkeypatch.setattr(main, "mission_series", slow)
    paths = [f"{SUMMARY}&days={d}" for d in (5, 6, 7, 8, 9, 10, 11, 12)]
    threads = [threading.Thread(target=client.get, args=(p,)) for p in paths]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert 1 <= state["peak"] <= 2
