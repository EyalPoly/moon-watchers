import numpy as np
from pyproj import Transformer

from engine.terrain import Dem, project, sample, sample_stack, unproject

PROJ = (
    "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 "
    "+R=1737400 +units=m +no_defs"
)
GEOGRAPHIC = "+proj=longlat +R=1737400 +no_defs"


def test_projection_matches_pyproj() -> None:
    rng = np.random.default_rng(1)
    lat = rng.uniform(-90, -80, 200)
    lon = rng.uniform(-180, 180, 200)
    x, y = project(lat, lon)
    ex, ey = Transformer.from_crs(GEOGRAPHIC, PROJ, always_xy=True).transform(lon, lat)
    assert np.abs(x - ex).max() < 0.01
    assert np.abs(y - ey).max() < 0.01


def test_projection_roundtrip() -> None:
    rng = np.random.default_rng(2)
    lat = rng.uniform(-90, -82, 100)
    lon = rng.uniform(0, 360, 100)
    lat2, lon2 = unproject(*project(lat, lon))
    assert np.abs(lat2 - lat).max() < 1e-8
    assert np.abs(lon2 - lon).max() < 1e-6
    assert lon2.min() >= 0 and lon2.max() < 360


def test_pole_projects_to_origin() -> None:
    x, y = project(-90.0, 123.0)
    assert abs(float(x)) < 1e-6 and abs(float(y)) < 1e-6


def test_lon_wrap() -> None:
    a = project(-85.0, -180.0)
    b = project(-85.0, 180.0)
    assert abs(float(a[0]) - float(b[0])) < 1e-6
    assert abs(float(a[1]) - float(b[1])) < 1e-6


def plane_dem(cell: float = 10.0, n: int = 20) -> Dem:
    cols = np.arange(n, dtype=np.float64)
    rows = np.arange(n, dtype=np.float64)
    x = 100.0 + cols * cell
    y = 500.0 - rows * cell
    data = (0.5 * x[None, :] - 0.25 * y[:, None] + 7.0).astype(np.float32)
    return Dem("plane", data, 100.0, 500.0, cell)


def test_bilinear_on_plane() -> None:
    dem = plane_dem()
    xs = np.array([103.7, 150.2, 250.0])
    ys = np.array([497.1, 420.9, 350.5])
    expected = 0.5 * xs - 0.25 * ys + 7.0
    np.testing.assert_allclose(sample(dem, xs, ys), expected, atol=0.01)


def test_sample_nodata_gives_nan() -> None:
    dem = plane_dem()
    data = dem.data.copy()
    data[3, 4] = np.nan
    holed = Dem("h", data, dem.x0_m, dem.y0_m, dem.cell_m)
    x = 100.0 + 4 * 10.0 + 2.0
    y = 500.0 - 3 * 10.0 - 2.0
    assert np.isnan(sample(holed, np.array([x]), np.array([y]))[0])
    assert np.isfinite(sample(holed, np.array([160.0]), np.array([440.0]))[0])


def test_sample_outside_gives_nan() -> None:
    out = sample(plane_dem(), np.array([-50.0, 100.0, 5000.0]), np.array([300.0, 9000.0, 300.0]))
    assert np.isnan(out).all()


def test_stack_prefers_finest() -> None:
    fine = Dem("fine", np.full((20, 20), 5.0, np.float32), 100.0, 500.0, 10.0)
    fine.data[8:12, 8:12] = np.nan
    coarse = Dem("coarse", np.full((10, 10), 9.0, np.float32), 100.0, 500.0, 20.0)
    xs = np.array([195.0, 185.0, 120.0])
    ys = np.array([405.0, 415.0, 490.0])
    expected = np.array([9.0, 9.0, 5.0], np.float32)
    for order in ((fine, coarse), (coarse, fine)):
        np.testing.assert_array_equal(sample_stack(order, xs, ys), expected)
