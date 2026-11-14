import json
from pathlib import Path

import numpy as np
import pytest
from numpy.typing import NDArray

from api.models import Site
from build.make_masks import build_bundle
from tests.ephemeris_helpers import default_ephemeris
from engine.horizons import HORIZON_ALGO_VERSION
from engine.terrain import project
from tests.tif_helpers import write_tif

DEM_20 = "lola/LDEM_80S_20MPP_ADJ.TIF"
DEM_80 = "lola/LDEM_80S_80MPP_ADJ.TIF"
DEM_240 = "lola/LDEM_60S_240MPP_ADJ.TIF"


def site(site_id: str, lat: float, lon: float) -> Site:
    return Site(
        id=site_id, name=site_id, source="catalog", category="ridge", region="south_pole",
        lat_deg=lat, lon_deg=lon, elevation_m=0.0, slope_deg=0.0, slope_baseline_m=240.0,
        source_url="test", is_placeholder=True,
    )


CATALOG = {
    "s1": site("s1", -89.0, 0.0),
    "s2": site("s2", -89.0, 90.0),
    "s3": site("s3", -89.5, 200.0 - 360.0),
}


def write_dem(sources: Path, name: str, half_m: float, cell_m: float, value: float = 100.0) -> None:
    n = int(2 * half_m / cell_m)
    data: NDArray[np.float32] = np.full((n, n), value, np.float32)
    write_tif(sources / name, data, -half_m, half_m, cell_m)
    err = np.full((n, n), 1.0, np.float32)
    write_tif(sources / name.replace(".TIF", "_ERR.TIF"), err, -half_m, half_m, cell_m)


def make_sources(tmp_path: Path, with_20m: bool = True) -> Path:
    sources = tmp_path / "sources"
    if with_20m:
        write_dem(sources, DEM_20, 50_000, 100)
    write_dem(sources, DEM_80, 50_000, 200)
    write_dem(sources, DEM_240, 50_000, 500)
    return sources


def test_build_bundle_on_synthetic_dems(tmp_path: Path) -> None:
    sources = make_sources(tmp_path)
    bundle = build_bundle(CATALOG, sources, tmp_path / "bundle", default_ephemeris())
    manifest = json.loads((bundle / "manifest.json").read_text())
    assert manifest["algo_version"] == HORIZON_ALGO_VERSION
    assert bundle.name == manifest["bundle_id"]
    assert set(manifest["sites"]) == set(CATALOG)
    for site_id in CATALOG:
        folder = bundle / "server" / "sites" / site_id
        masks = np.load(folder / "masks.npy")
        blocking = np.load(folder / "blocking.npy")
        assert masks.shape == (3, 11, 720) and masks.dtype == np.float32
        assert blocking.shape == (11, 720) and blocking.dtype == np.float32
    changed = tmp_path / "other"
    other = make_sources(changed)
    write_dem(other, DEM_240, 50_000, 500, value=101.0)
    assert build_bundle(CATALOG, other, tmp_path / "bundle2", default_ephemeris()).name != bundle.name


def test_build_is_deterministic(tmp_path: Path) -> None:
    sources = make_sources(tmp_path)
    first = build_bundle(CATALOG, sources, tmp_path / "b1", default_ephemeris())
    second = build_bundle(CATALOG, sources, tmp_path / "b2", default_ephemeris())
    assert first.name == second.name


def test_build_without_20m_uses_80m(tmp_path: Path) -> None:
    sources = make_sources(tmp_path, with_20m=False)
    bundle = build_bundle(CATALOG, sources, tmp_path / "bundle", default_ephemeris())
    manifest = json.loads((bundle / "manifest.json").read_text())
    assert DEM_20 not in manifest["sources"]
    assert DEM_80 in manifest["sources"] and DEM_240 in manifest["sources"]


def test_build_fails_without_any_dem(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        build_bundle(CATALOG, tmp_path / "empty", tmp_path / "bundle", default_ephemeris())


def test_site_far_from_dems_is_rejected(tmp_path: Path) -> None:
    sources = make_sources(tmp_path)
    far_site = {"x": site("x", -85.0, 0.0)}
    assert project(-85.0, 0.0)[1] > 50_000
    with pytest.raises(ValueError, match="x"):
        build_bundle(far_site, sources, tmp_path / "bundle", default_ephemeris())


def test_moving_a_site_changes_the_bundle_id(tmp_path: Path) -> None:
    sources = make_sources(tmp_path)
    first = build_bundle(CATALOG, sources, tmp_path / "bundle", default_ephemeris())
    moved = {**CATALOG, "s1": site("s1", -89.2, 0.0)}
    second = build_bundle(moved, sources, tmp_path / "bundle", default_ephemeris())
    assert second.name != first.name
