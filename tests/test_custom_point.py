from pathlib import Path

import numpy as np
import pytest

from build.make_masks import build_bundle
from engine.custom_point import SLOPE_RESOLUTION_M, TERRAIN_FILES, TerrainMissing, compute_custom_point
from engine.terrain import project
from tests.ephemeris_helpers import default_ephemeris
from tests.test_masks_build import CATALOG, DEM_80, DEM_240, make_sources
from tests.tif_helpers import write_tif

SLOPE = "layers/slope/LDSM_80S_80MPP_ADJ.TIF"
LAT, LON = -89.0, 0.0


def make_terrain(tmp_path: Path, slope_deg: float = 7.0) -> Path:
    sources = make_sources(tmp_path, with_20m=False)
    n = int(2 * 50_000 / 200)
    write_tif(sources / SLOPE, np.full((n, n), slope_deg, np.float32), -50_000, 50_000, 200)
    return sources


def punch_hole(path: Path, lat: float, lon: float) -> None:
    import rasterio

    x, y = project(lat, lon)
    with rasterio.open(path, "r+") as ds:
        row, col = ds.index(float(x), float(y))
        ds.write(np.full((6, 6), np.nan, np.float32), 1, window=((row - 3, row + 3), (col - 3, col + 3)))


def test_the_terrain_files_are_the_ones_the_plan_names() -> None:
    assert "lola/LDEM_80S_80MPP_ADJ.TIF" in TERRAIN_FILES and SLOPE in TERRAIN_FILES
    assert len(TERRAIN_FILES) == 5 and SLOPE_RESOLUTION_M == 80.0


def test_shapes_and_values(tmp_path: Path) -> None:
    point = compute_custom_point(LAT, LON, make_terrain(tmp_path))
    assert point.masks.shape == (3, 11, 720) and point.masks.dtype == np.float32
    assert point.blocking.shape == (11, 720) and point.blocking.dtype == np.float32
    assert point.elevation_m == pytest.approx(100.0)
    assert point.slope_deg == pytest.approx(7.0)
    assert (point.lat_deg, point.lon_deg) == (LAT, LON)


def test_matches_the_catalog_build_on_the_same_terrain(tmp_path: Path) -> None:
    sources = make_terrain(tmp_path)
    bundle = build_bundle(CATALOG, sources, tmp_path / "bundle", default_ephemeris(), terrain="80m")
    folder = bundle / "server" / "sites" / "s1"
    point = compute_custom_point(CATALOG["s1"].lat_deg, CATALOG["s1"].lon_deg, sources)
    np.testing.assert_array_equal(point.masks, np.load(folder / "masks.npy"))
    np.testing.assert_array_equal(point.blocking, np.load(folder / "blocking.npy"))


def test_missing_file_raises(tmp_path: Path) -> None:
    sources = make_terrain(tmp_path)
    (sources / DEM_240).unlink()
    with pytest.raises(TerrainMissing, match="LDEM_60S_240MPP_ADJ.TIF"):
        compute_custom_point(LAT, LON, sources)


def test_point_without_elevation_raises(tmp_path: Path) -> None:
    sources = make_terrain(tmp_path)
    punch_hole(sources / DEM_80, LAT, LON)
    punch_hole(sources / DEM_240, LAT, LON)
    with pytest.raises(ValueError, match="no terrain elevation"):
        compute_custom_point(LAT, LON, sources)


def test_point_without_slope_raises(tmp_path: Path) -> None:
    sources = make_terrain(tmp_path)
    punch_hole(sources / SLOPE, LAT, LON)
    with pytest.raises(ValueError, match="no slope"):
        compute_custom_point(LAT, LON, sources)
