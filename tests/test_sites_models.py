import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from api.models import EarthStation, HorizonResponse, Meta, SeriesResponse, Site, SitesResponse

SAMPLES = Path("contract/samples")


def site_data(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": "sample_a",
        "name": "Sample site A",
        "source": "catalog",
        "category": "ridge",
        "region": "south_pole",
        "lat_deg": -87.0,
        "lon_deg": 10.0,
        "elevation_m": 1200.0,
        "slope_deg": 3.0,
        "slope_baseline_m": 240.0,
        "source_url": "placeholder",
        "is_placeholder": True,
    }
    data.update(overrides)
    return data


def test_site_accepts_valid_data() -> None:
    assert Site.model_validate(site_data()).id == "sample_a"


def test_site_rejects_northern_lat() -> None:
    with pytest.raises(ValidationError):
        Site.model_validate(site_data(lat_deg=10.0))


def test_site_rejects_lat_outside_custom_area() -> None:
    with pytest.raises(ValidationError):
        Site.model_validate(site_data(lat_deg=-80.0))


def test_site_rejects_lon_of_180() -> None:
    with pytest.raises(ValidationError):
        Site.model_validate(site_data(lon_deg=180.0))


@pytest.mark.parametrize("bad_id", ["../x", "", "a" * 65, "Has Caps", "x y"])
def test_site_rejects_bad_id(bad_id: str) -> None:
    with pytest.raises(ValidationError):
        Site.model_validate(site_data(id=bad_id))


def test_sites_sample_validates_and_ids_unique() -> None:
    sites = SitesResponse.model_validate_json((SAMPLES / "sites.json").read_text()).sites
    ids = [s.id for s in sites]
    assert ids == ["sample_a", "sample_b", "sample_c"]
    assert len(set(ids)) == len(ids)
    assert all(s.is_placeholder for s in sites)


def test_each_site_sample_matches_the_list() -> None:
    listed = {
        s.id: s
        for s in SitesResponse.model_validate_json((SAMPLES / "sites.json").read_text()).sites
    }
    for path in sorted((SAMPLES / "sites").glob("*.json")):
        assert Site.model_validate(json.loads(path.read_text())) == listed[path.stem]


def horizon_data(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "site_id": "sample_a",
        "mast_m": 2,
        "part": "full",
        "az_step_deg": 0.5,
        "elevation_deg": [0.0] * 720,
        "distance_km": [1.0] * 720,
    }
    data.update(overrides)
    return data


@pytest.mark.parametrize("name", ["sample_a", "sample_b", "sample_c"])
def test_horizon_sample_validates(name: str) -> None:
    text = (SAMPLES / "horizon" / f"{name}.json").read_text()
    assert len(HorizonResponse.model_validate_json(text).elevation_deg) == 720


def test_horizon_requires_720_values() -> None:
    with pytest.raises(ValidationError):
        HorizonResponse.model_validate(horizon_data(elevation_deg=[0.0] * 719))


def test_horizon_bounds_and_warnings_are_optional() -> None:
    model = HorizonResponse.model_validate(horizon_data())
    assert model.low_deg is None and model.warnings is None
    with pytest.raises(ValidationError):
        HorizonResponse.model_validate(horizon_data(low_deg=[0.0] * 10))


def test_unknown_direction_is_null() -> None:
    values: list[float | None] = [0.0] * 720
    values[3] = None
    dumped = HorizonResponse.model_validate(horizon_data(elevation_deg=values)).model_dump_json()
    assert json.loads(dumped)["elevation_deg"][3] is None


@pytest.mark.parametrize("name", ["sample_a", "sample_b", "sample_c"])
def test_series_sample_validates(name: str) -> None:
    series = SeriesResponse.model_validate_json((SAMPLES / "series" / f"{name}.json").read_text())
    assert series.n == 144 and series.step_s == 600


def series_data() -> dict[str, Any]:
    return json.loads((SAMPLES / "series" / "sample_a.json").read_text())


def test_series_lists_must_match_n() -> None:
    data = series_data()
    data["contact"] = data["contact"][:-1]
    with pytest.raises(ValidationError):
        SeriesResponse.model_validate(data)


def test_series_null_visibility_serializes_as_null() -> None:
    data = series_data()
    data["contact"][0] = None
    data["sun_lit_frac"][0] = None
    dumped = json.loads(SeriesResponse.model_validate(data).model_dump_json())
    assert dumped["contact"][0] is None and dumped["sun_lit_frac"][0] is None


def test_series_rejects_other_visibility_values() -> None:
    data = series_data()
    data["contact"][0] = 2
    with pytest.raises(ValidationError):
        SeriesResponse.model_validate(data)


def test_meta_default_station_must_be_a_preset() -> None:
    meta = json.loads((SAMPLES / "meta.json").read_text())
    meta["default_station"] = "nowhere"
    with pytest.raises(ValidationError):
        Meta.model_validate(meta)


def test_station_preset_ranges() -> None:
    with pytest.raises(ValidationError):
        EarthStation(id="x", name="x", lat_deg=0, lon_deg=0, alt_m=0, min_el_deg=50)


def test_in_psr_optional() -> None:
    assert Site.model_validate(site_data()).in_psr is None
