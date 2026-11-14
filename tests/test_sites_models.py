import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from api.models import Site, SitesResponse

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
