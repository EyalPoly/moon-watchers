import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from api.catalog import CatalogError, catalog_problems, load_catalog
from api.catalog import main as catalog_main
from api.models import Site
from tests.catalog_fixture import FIXTURE_CATALOG

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


def test_fixture_catalog_loads() -> None:
    assert list(load_catalog(FIXTURE_CATALOG)) == ["sample_a", "sample_b", "sample_c"]


def test_committed_catalog_loads() -> None:
    assert len(load_catalog(CATALOG)) >= 1


def test_every_site_sample_equals_its_fixture_entry() -> None:
    catalog = load_catalog(FIXTURE_CATALOG)
    for path in sorted(SAMPLE_SITES.glob("*.json")):
        assert Site.model_validate(json.loads(path.read_text())) == catalog[path.stem]


def test_committed_catalog_agrees_with_samples_it_shares() -> None:
    catalog = load_catalog(CATALOG)
    for path in sorted(SAMPLE_SITES.glob("*.json")):
        if path.stem in catalog:
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


def test_final_check_names_placeholders_and_bad_urls() -> None:
    sites = {
        "a_one": Site.model_validate(entry(id="a_one", is_placeholder=True)),
        "b_two": Site.model_validate(entry(id="b_two", source_url="placeholder: x")),
        "c_three": Site.model_validate(entry(id="c_three")),
    }
    problems = catalog_problems(sites, final=True)
    assert len(problems) == 2
    assert any("a_one" in p for p in problems)
    assert any("b_two" in p for p in problems)
    assert catalog_problems(sites, final=False) == []


def test_check_command_exit_codes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    good = write(tmp_path, {"sites": [entry()]})
    assert catalog_main([str(good)]) == 0
    assert "1 sites OK" in capsys.readouterr().out
    assert catalog_main(["--final", str(FIXTURE_CATALOG)]) == 1
    assert "sample_a" in capsys.readouterr().out
    duplicate = tmp_path / "dup.yaml"
    duplicate.write_text(yaml.safe_dump({"sites": [entry(), entry()]}))
    assert catalog_main([str(duplicate)]) == 1


def test_draft_catalog_is_ready_to_swap_in() -> None:
    sites = load_catalog(Path("catalog/sites.draft.yaml"))
    assert len(sites) >= 25
    assert catalog_problems(sites, final=True) == []
    assert all(site.source_url.startswith("https://") for site in sites.values())
