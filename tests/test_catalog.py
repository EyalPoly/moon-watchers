import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from api.catalog import CatalogError, load_catalog
from api.models import Site

CATALOG = Path("catalog/sites.yaml")
SAMPLE_SITES = Path("contract/samples/sites")


def entry(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": "x_one",
        "name": "X one",
        "source": "catalog",
        "category": "ridge",
        "region": "south_pole",
        "lat_deg": -87.0,
        "lon_deg": 10.0,
        "elevation_m": 1.0,
        "slope_deg": 1.0,
        "slope_resolution_m": 20.0,
        "source_url": "https://example.org/x",
        "is_placeholder": False,
    }
    data.update(overrides)
    return data


def write(tmp_path: Path, content: Any) -> Path:
    path = tmp_path / "sites.yaml"
    path.write_text(yaml.safe_dump(content))
    return path


def test_load_catalog_ok() -> None:
    assert len(load_catalog(CATALOG)) == 3


def test_every_site_sample_equals_its_catalog_entry() -> None:
    catalog = load_catalog(CATALOG)
    for path in sorted(SAMPLE_SITES.glob("*.json")):
        assert Site.model_validate(json.loads(path.read_text())) == catalog[path.stem]


def test_duplicate_id_rejected(tmp_path: Path) -> None:
    with pytest.raises(CatalogError, match="x_one"):
        load_catalog(write(tmp_path, {"sites": [entry(), entry()]}))


def test_lat_outside_area_rejected(tmp_path: Path) -> None:
    with pytest.raises(CatalogError, match="x_one"):
        load_catalog(write(tmp_path, {"sites": [entry(lat_deg=-70.0)]}))


def test_missing_source_url_rejected(tmp_path: Path) -> None:
    bad = entry()
    del bad["source_url"]
    with pytest.raises(CatalogError, match="x_one"):
        load_catalog(write(tmp_path, {"sites": [bad]}))


def test_non_mapping_file_rejected(tmp_path: Path) -> None:
    with pytest.raises(CatalogError):
        load_catalog(write(tmp_path, ["not", "a", "mapping"]))
