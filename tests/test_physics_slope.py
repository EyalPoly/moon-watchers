from pathlib import Path

import pytest

from engine.terrain import project

SLOPE = Path("MenasimMoonV3/data/terrain/slope-3816396d2106.tif")

pytestmark = pytest.mark.skipif(not SLOPE.is_file(), reason="the physics prototype's slope crop is not available")

# Read straight from NASA's 20 m LDSM raster (PGDA product 90) by the physics team with Rasterio,
# independently of their own coordinate code: the native pixel containing each point.
NASA_NATIVE_PIXEL = [(-89.0, 0.0, 4.075995445251465), (-89.0, 8.0, 8.789190292358398)]


@pytest.mark.parametrize(("lat", "lon", "expected"), NASA_NATIVE_PIXEL)
def test_native_slope_pixel_matches_nasa(lat: float, lon: float, expected: float) -> None:
    import rasterio

    x, y = project(lat, lon)
    with rasterio.open(SLOPE) as ds:
        row, col = ds.index(float(x), float(y))
        value = float(ds.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])
    assert value == pytest.approx(expected, abs=1e-5)
