import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from api.models import Meta
from build.layer_tiles import hillshade, legend_png, slope_ramp, tile_bounds, tiles_in_extent
from build.make_layers import build_elevation_tiles, build_slope_tiles
from tests.tif_helpers import write_tif

REGION = Meta.model_validate_json(Path("contract/samples/meta.json").read_text()).regions[0]
GRID = REGION.tile_grid
EXTENT = (-20000.0, -20000.0, 20000.0, 20000.0)
TOP = len(GRID.resolutions_m) - 1


def alpha_at(out: Path, x_m: float, y_m: float) -> int:
    for x, y in tiles_in_extent(GRID, TOP, EXTENT):
        x_min, y_min, x_max, y_max = tile_bounds(GRID, TOP, x, y)
        if x_min <= x_m < x_max and y_min < y_m <= y_max:
            image = Image.open(out / str(TOP) / str(x) / f"{y}.png").convert("RGBA")
            res = GRID.resolutions_m[TOP]
            return int(image.getpixel((int((x_m - x_min) / res), int((y_max - y_m) / res)))[3])  # type: ignore[index]
    raise AssertionError("point is outside every tile")


def test_slope_tiles_colour_covered_pixels_only(tmp_path: Path) -> None:
    write_tif(tmp_path / "s.tif", np.full((40, 40), 10.0, dtype=np.float32), -1600.0, 1600.0, 80.0)
    build_slope_tiles(tmp_path / "s.tif", tmp_path / "out", GRID, EXTENT)
    assert alpha_at(tmp_path / "out", 0.0, 0.0) == 255
    assert alpha_at(tmp_path / "out", 10000.0, 10000.0) == 0


def test_slope_nodata_is_transparent(tmp_path: Path) -> None:
    data = np.full((40, 40), 10.0, dtype=np.float32)
    data[10:30, 10:30] = np.nan
    write_tif(tmp_path / "s.tif", data, -1600.0, 1600.0, 80.0)
    build_slope_tiles(tmp_path / "s.tif", tmp_path / "out", GRID, EXTENT)
    assert alpha_at(tmp_path / "out", 0.0, 0.0) == 0


def test_elevation_falls_back_to_coarser_dem(tmp_path: Path) -> None:
    write_tif(tmp_path / "fine.tif", np.zeros((40, 40), dtype=np.float32), -1600.0, 1600.0, 80.0)
    write_tif(tmp_path / "coarse.tif", np.full((120, 120), 100.0, dtype=np.float32), -14400.0, 14400.0, 240.0)
    build_elevation_tiles(
        [(tmp_path / "fine.tif", "fine"), (tmp_path / "coarse.tif", "coarse")], tmp_path / "out", GRID, EXTENT
    )
    assert alpha_at(tmp_path / "out", 5000.0, 0.0) == 255
    assert alpha_at(tmp_path / "out", 18000.0, 0.0) == 0


def test_wrong_crs_raises_with_path(tmp_path: Path) -> None:
    write_tif(tmp_path / "bad.tif", np.zeros((4, 4), dtype=np.float32), 0.0, 4.0, 1.0, crs="EPSG:4326")
    with pytest.raises(ValueError, match="bad.tif"):
        build_slope_tiles(tmp_path / "bad.tif", tmp_path / "out", GRID, EXTENT)


def test_hillshade_flat_is_constant() -> None:
    shade = hillshade(np.full((8, 8), 50.0, dtype=np.float32), 80.0)
    assert np.ptp(shade) == 0.0
    assert 0.0 <= float(shade[0, 0]) <= 1.0


def test_hillshade_keeps_nan() -> None:
    values = np.zeros((6, 6), dtype=np.float32)
    values[3, 3] = np.nan
    assert np.isnan(hillshade(values, 80.0)[3, 3])


def test_legend_is_an_opaque_strip() -> None:
    image = Image.open(io.BytesIO(legend_png(slope_ramp, 0.0, 30.0))).convert("RGBA")
    assert image.size == (256, 16)
    assert image.getpixel((0, 0))[3] == 255  # type: ignore[index]
