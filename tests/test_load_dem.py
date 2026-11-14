from pathlib import Path

import numpy as np
import pytest

from engine.terrain import load_dem
from tests.tif_helpers import write_tif


def ramp() -> np.ndarray:
    return np.arange(100, dtype=np.float32).reshape(10, 10)


def test_load_dem_reads_cell_centres(tmp_path: Path) -> None:
    write_tif(tmp_path / "a.tif", ramp(), -500.0, 500.0, 100.0)
    dem = load_dem(tmp_path / "a.tif", "a")
    assert dem.cell_m == 100.0
    assert dem.x0_m == -450.0 and dem.y0_m == 450.0
    assert dem.data[0, 0] == 0.0 and dem.data[9, 9] == 99.0


def test_load_dem_window(tmp_path: Path) -> None:
    write_tif(tmp_path / "a.tif", ramp(), -500.0, 500.0, 100.0)
    dem = load_dem(tmp_path / "a.tif", "a", window_m=(-250.0, -150.0, 250.0, 150.0))
    assert dem.data.shape == (4, 6)
    assert dem.x0_m == -250.0 and dem.y0_m == 150.0
    assert dem.data[0, 0] == ramp()[3, 2]


def test_load_dem_window_is_clipped(tmp_path: Path) -> None:
    write_tif(tmp_path / "a.tif", ramp(), -500.0, 500.0, 100.0)
    dem = load_dem(tmp_path / "a.tif", "a", window_m=(-9000.0, -9000.0, 0.0, 0.0))
    assert dem.data.shape == (5, 5)


def test_load_dem_window_outside_file(tmp_path: Path) -> None:
    write_tif(tmp_path / "a.tif", ramp(), -500.0, 500.0, 100.0)
    with pytest.raises(ValueError, match="outside"):
        load_dem(tmp_path / "a.tif", "a", window_m=(5000.0, 5000.0, 6000.0, 6000.0))


def test_load_dem_rejects_wrong_crs(tmp_path: Path) -> None:
    write_tif(tmp_path / "a.tif", ramp(), -5.0, 5.0, 1.0, crs="EPSG:4326")
    with pytest.raises(ValueError, match="CRS"):
        load_dem(tmp_path / "a.tif", "a")


def test_load_dem_nodata_is_nan(tmp_path: Path) -> None:
    data = ramp()
    data[2, 3] = -32768.0
    write_tif(tmp_path / "a.tif", data, -500.0, 500.0, 100.0, nodata=-32768.0)
    dem = load_dem(tmp_path / "a.tif", "a")
    assert np.isnan(dem.data[2, 3])
    assert np.isfinite(dem.data).sum() == 99
