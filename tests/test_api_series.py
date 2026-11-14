import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.bundle import load_bundle
from api.main import create_app
from api.series_json import series_response
from engine.geometry import Station
from engine.horizons import mask_at_height
from engine.series import SERIES_FIELDS, SeriesArrays, compute_series
from tests.test_api_horizon import bundle_dir, catalog_path, holed_bundle_dir  # noqa: F401
from tests.test_masks_build import CATALOG

SERIES = "/api/v1/scenario/series?site=s1&t0=2027-03-01T00:00Z&month=2027-03"
START = datetime(2027, 3, 1, tzinfo=UTC)


@pytest.fixture(scope="module")
def client(bundle_dir: Path, catalog_path: Path) -> TestClient:  # noqa: F811
    return TestClient(create_app(catalog_path=catalog_path, bundle_dir=bundle_dir))


def test_series_ok(client: TestClient) -> None:
    response = client.get(SERIES)
    body = response.json()
    assert response.status_code == 200
    assert body["n"] == 4464 and body["step_s"] == 600 and body["start"] == "2027-03-01T00:00Z"
    for name in SERIES_FIELDS:
        assert len(body[name]) == 4464, name
    assert set(body["contact"]) <= {0, 1}
    assert body["power_w"] is None


def test_dem_hole_gives_null(holed_bundle_dir: Path, catalog_path: Path) -> None:  # noqa: F811
    client = TestClient(create_app(catalog_path=catalog_path, bundle_dir=holed_bundle_dir))
    response = client.get(SERIES)
    assert "NaN" not in response.text
    body = response.json()
    assert None in body["sun_horizon_el"] and None in body["sun_lit_frac"]
    assert any(v is not None for v in body["sun_horizon_el"])


def arrays(fraction: float) -> SeriesArrays:
    one = np.array([fraction])
    zero = np.zeros(1)
    return SeriesArrays(
        sun_az=zero, sun_el=zero, sun_vis_el=zero, sun_horizon_el=np.array([np.nan]), sun_lit_frac=one,
        earth_az=zero, earth_el=zero, earth_vis_el=zero, earth_horizon_el=zero,
        earth_any=np.array([1.0], np.float32), earth_whole=np.array([np.nan], np.float32),
        contact=np.array([0.0], np.float32), station_az=zero, station_el=zero, station_horizon_el=zero,
        earth_station_up=np.array([True]), station_moon_el=zero,
    )


@pytest.mark.parametrize(("fraction", "expected"), [(1e-6, 0.0001), (0.0, 0.0), (0.123456, 0.1235), (1.0, 1.0)])
def test_tiny_fraction_not_zero(fraction: float, expected: float) -> None:
    body = json.loads(series_response(arrays(fraction), START, 1).model_dump_json())
    assert body["sun_lit_frac"] == [expected]
    assert body["sun_horizon_el"] == [None] and body["earth_whole"] == [None]
    assert body["earth_any"] == [1] and body["contact"] == [0] and body["earth_station_up"] == [True]


@pytest.mark.parametrize("month", ["2027-05", "2025-12", "2032-01", "0000-01"])
def test_month_outside_table(client: TestClient, month: str) -> None:
    response = client.get(f"/api/v1/scenario/series?site=s1&t0=2027-03-01T00:00Z&month={month}")
    assert response.status_code == 422 and response.json()["code"] == "OUT_OF_TIME_RANGE"
    assert response.headers["content-type"].startswith("application/problem+json")


@pytest.mark.parametrize("month", ["2027-13", "27-03", ""])
def test_bad_month(client: TestClient, month: str) -> None:
    response = client.get(f"/api/v1/scenario/series?site=s1&t0=2027-03-01T00:00Z&month={month}")
    assert response.status_code == 422 and response.json()["code"] == "INVALID_PARAM"


def test_unknown_site_404(client: TestClient) -> None:
    response = client.get(SERIES.replace("site=s1", "site=nope"))
    assert response.status_code == 404 and response.json()["code"] == "INVALID_PARAM"


def test_no_bundle_503(catalog_path: Path) -> None:  # noqa: F811
    response = TestClient(create_app(catalog_path=catalog_path)).get(SERIES)
    assert response.status_code == 503 and response.json()["code"] == "FEATURE_DISABLED"


def test_versioned_get_is_immutable(client: TestClient) -> None:
    assert "immutable" in client.get(f"{SERIES}&v=abc").headers["cache-control"]
    assert "immutable" not in client.get(SERIES).headers.get("cache-control", "")


def test_gzip(client: TestClient) -> None:
    response = client.get(SERIES, headers={"Accept-Encoding": "gzip"})
    assert response.headers["content-encoding"] == "gzip"
    assert response.json()["n"] == 4464


def test_bad_station_is_422_not_500(client: TestClient) -> None:
    response = client.get(f"{SERIES}&station=1,2,3")
    assert response.status_code == 422 and response.json()["code"] == "INVALID_PARAM"


def test_station_changes_contact(client: TestClient) -> None:
    houston = client.get(SERIES).json()["earth_station_up"]
    canberra = client.get(f"{SERIES}&station=-35.4014,148.9819,0,0").json()["earth_station_up"]
    masked = client.get(f"{SERIES}&station=29.7604,-95.3698,0,30").json()["earth_station_up"]
    assert houston != canberra and sum(masked) < sum(houston)


def test_series_matches_engine(client: TestClient, bundle_dir: Path) -> None:  # noqa: F811
    body = client.get(f"{SERIES}&panel=2.5&antenna=4.25").json()
    bundle = load_bundle(bundle_dir, CATALOG)
    site = CATALOG["s1"]
    masks = bundle.masks["s1"]
    expected = compute_series(
        bundle.ephemeris, site.lat_deg, site.lon_deg, site.elevation_m,
        mask_at_height(masks, 2.5)[0].astype(np.float64), mask_at_height(masks, 4.25)[0].astype(np.float64),
        2.5, 4.25, Station(29.7604, -95.3698, 0.0, 0.0), START, 4464,
    )
    for name in ("sun_az", "sun_el", "station_el", "station_moon_el", "earth_vis_el"):
        np.testing.assert_allclose(body[name], getattr(expected, name), atol=6e-4)
    fraction = np.array(body["sun_lit_frac"], dtype=float)
    slivers = (expected.sun_lit_frac > 0) & (expected.sun_lit_frac < 5e-5)
    assert np.all(fraction[slivers] == 0.0001)
    np.testing.assert_allclose(fraction[~slivers], expected.sun_lit_frac[~slivers], atol=6e-5)
    assert body["contact"] == [int(v) for v in expected.contact]
    assert body["earth_station_up"] == expected.earth_station_up.tolist()
