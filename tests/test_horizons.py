from collections.abc import Callable

import numpy as np
import pytest
from numpy.typing import NDArray

from engine.horizons import (
    HEIGHTS_M,
    compute_site_masks,
    march,
    mask_at_height,
    ray_distances,
    reach_for_ground,
)
from engine.terrain import MOON_RADIUS_M, Dem, project, sample_stack

R = MOON_RADIUS_M
SITE = (-89.0, 0.0)

SITE_XY = (0.0, float(project(*SITE)[1]))

Field = Callable[[NDArray[np.float64], NDArray[np.float64]], NDArray[np.float64]]


def make_dem(
    fn: Field, half_m: float, cell_m: float, dem_id: str = "d", center: tuple[float, float] = (0.0, 0.0)
) -> Dem:
    n = int(round(2 * half_m / cell_m)) + 1
    xs = center[0] - half_m + cell_m * np.arange(n)
    ys = center[1] + half_m - cell_m * np.arange(n)
    gx, gy = np.meshgrid(xs, ys)
    data = np.asarray(fn(gx, gy), dtype=np.float32)
    return Dem(dem_id, data, center[0] - half_m, center[1] + half_m, cell_m)


def destination(
    lat_deg: float, lon_deg: float, az_deg: NDArray[np.float64], dist_m: NDArray[np.float64]
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    phi, lam = np.radians(lat_deg), np.radians(lon_deg)
    az = np.radians(az_deg)[:, None]
    th = (dist_m / R)[None, :]
    lat2 = np.arcsin(np.sin(phi) * np.cos(th) + np.cos(phi) * np.sin(th) * np.cos(az))
    lon2 = lam + np.arctan2(
        np.sin(az) * np.sin(th) * np.cos(phi), np.cos(th) - np.sin(phi) * np.sin(lat2)
    )
    return np.degrees(lat2), np.degrees(lon2)


def reference_skyline(
    terrain: list[Dem], height_m: float, distances: NDArray[np.float64], n_az: int = 720
) -> NDArray[np.float64]:
    """Independent float64 skyline: destination-point formula, vertical/horizontal split."""
    az = np.arange(n_az) * 360.0 / n_az
    lat, lon = destination(*SITE, az, distances)
    x, y = project(lat, lon)
    h = sample_stack(terrain, x, y).astype(np.float64)
    sx, sy = project(*SITE)
    ground = float(sample_stack(terrain, np.atleast_1d(sx), np.atleast_1d(sy))[0])
    th = (distances / R)[None, :]
    vertical = (R + h) * np.cos(th) - (R + ground + height_m)
    horizontal = (R + h) * np.sin(th)
    el = np.degrees(np.arctan2(vertical, horizontal)).max(axis=1)
    floor = -np.degrees(np.arccos((R + ground) / (R + ground + height_m)))
    return np.maximum(el, floor)


def point_east(distance_m: float) -> tuple[float, float]:
    lat, lon = destination(*SITE, np.array([90.0]), np.array([distance_m]))
    px, py = project(lat[0, 0], lon[0, 0])
    return float(px), float(py)


def dome_field(center: tuple[float, float], height_m: float = 500.0) -> Field:
    def field(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        d2 = (x - center[0]) ** 2 + (y - center[1]) ** 2
        return height_m * np.exp(-d2 / 1500.0**2)

    return field


def dome_field_wide(center: tuple[float, float]) -> Field:
    def field(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        d2 = (x - center[0]) ** 2 + (y - center[1]) ** 2
        return 6000.0 * np.exp(-d2 / 15_000.0**2)

    return field


def flat(value: float) -> Field:
    return lambda x, y: np.full_like(x, value)


def terrain_with(near: Field, far: Field | None = None) -> list[Dem]:
    return [
        make_dem(near, 20_000, 50, "fine", center=SITE_XY),
        make_dem(far or near, 400_000, 4000, "coarse"),
    ]


ERRORS = [make_dem(flat(1.0), 400_000, 4000, "err")]
DISTANCES = ray_distances()
TANGENT_FLOOR_2M = -np.degrees(np.arccos(R / (R + 2.0)))


def test_ray_distances_schedule() -> None:
    d = ray_distances()
    assert d[0] == 20.0 and d[-1] == 200_000.0
    assert np.all(np.diff(d) > 0)
    assert np.isclose(np.diff(d[:250]), 40.0).all()


def test_smooth_sphere_2m() -> None:
    result = march(*SITE, [2.0], terrain_with(flat(0.0)), ERRORS, DISTANCES)
    assert result.elevation_deg.shape == (1, 720)
    assert np.allclose(result.elevation_deg, TANGENT_FLOOR_2M, atol=0.001)
    assert TANGENT_FLOOR_2M == pytest.approx(-0.087, abs=0.001)
    assert result.warnings == []


def test_single_mountain_matches_hand_calc() -> None:
    center = point_east(10_000.0)
    terrain = terrain_with(dome_field(center))
    result = march(*SITE, [2.0], terrain, ERRORS, DISTANCES)
    expected = reference_skyline(terrain, 2.0, DISTANCES)
    assert result.elevation_deg[0, 180] == pytest.approx(expected[180], abs=0.001)
    assert result.elevation_deg[0, 180] > 2.0
    assert result.blocking_km[0, 180] == pytest.approx(10.0, abs=0.2)
    assert result.elevation_deg[0, 540] == pytest.approx(TANGENT_FLOOR_2M, abs=0.001)


def test_higher_observer_never_raises_skyline() -> None:
    terrain = terrain_with(dome_field(point_east(10_000.0)))
    result = march(*SITE, [float(h) for h in range(1, 11)], terrain, ERRORS, DISTANCES)
    assert (np.diff(result.elevation_deg, axis=0) <= 1e-6).all()


def test_float32_matches_float64() -> None:
    def rough(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        return 300.0 + 250.0 * np.sin(x / 700.0) * np.cos(y / 900.0)

    terrain = terrain_with(rough, flat(300.0))
    result = march(*SITE, [2.0], terrain, ERRORS, DISTANCES)
    expected = reference_skyline(terrain, 2.0, DISTANCES)
    finite = np.isfinite(result.elevation_deg[0])
    assert finite.sum() > 700
    assert np.abs(result.elevation_deg[0][finite] - expected[finite]).max() < 0.001


def test_pole_site_finite() -> None:
    terrain = [make_dem(flat(0.0), 400_000, 4000, "coarse")]
    result = march(-90.0, 0.0, [2.0], terrain, ERRORS, DISTANCES)
    assert np.isfinite(result.elevation_deg).all()


def test_missing_cell_makes_direction_unknown() -> None:
    terrain = [make_dem(flat(0.0), 400_000, 4000, "coarse")]
    px, py = point_east(52_000.0)
    dem = terrain[0]
    col = round((px - dem.x0_m) / dem.cell_m)
    row = round((dem.y0_m - py) / dem.cell_m)
    data = dem.data.copy()
    data[row, col] = np.nan
    holed = [Dem("holed", data, dem.x0_m, dem.y0_m, dem.cell_m)]
    result = march(*SITE, [2.0], holed, ERRORS, DISTANCES)
    assert np.isnan(result.elevation_deg[0, 180])
    assert np.isfinite(result.elevation_deg[0, 540])
    assert "DEM_GAPS" in result.warnings


def test_ray_leaving_coverage_is_unknown() -> None:
    terrain = [make_dem(flat(0.0), 50_000, 500, "small")]
    result = march(*SITE, [2.0], terrain, ERRORS, DISTANCES)
    assert np.isnan(result.elevation_deg).all()
    assert "DEM_GAPS" in result.warnings


def test_reach_follows_the_ground_height() -> None:
    assert reach_for_ground(0.0) == 10_000.0
    assert reach_for_ground(-1000.0) == reach_for_ground(1000.0)
    assert reach_for_ground(1000.0) == pytest.approx(np.sqrt(2 * R * 1000.0) + 10_000.0)
    assert reach_for_ground(15_000.0) == 200_000.0


def test_short_reach_stops_inside_the_near_window() -> None:
    d = ray_distances(reach_m=5_000.0)
    assert d[-1] == 5_000.0 and np.all(np.diff(d) > 0)


def test_far_terrain_beyond_the_reach_raises_no_warning() -> None:
    result = march(*SITE, [5000.0], terrain_with(flat(0.0)), ERRORS, DISTANCES)
    assert np.isfinite(result.elevation_deg).all()
    assert result.warnings == []


def test_low_nominal_high_ordered() -> None:
    terrain = terrain_with(dome_field(point_east(10_000.0)))
    errors = [make_dem(flat(5.0), 400_000, 4000, "err")]
    r = march(*SITE, [2.0], terrain, errors, DISTANCES)
    assert (r.low_deg <= r.elevation_deg + 1e-6).all()
    assert (r.elevation_deg <= r.high_deg + 1e-6).all()
    assert r.high_deg[0, 180] - r.low_deg[0, 180] > 0.01


def test_missing_error_gives_nan_bounds() -> None:
    r = march(*SITE, [2.0], terrain_with(flat(0.0)), [], DISTANCES)
    assert np.isnan(r.low_deg).all() and np.isnan(r.high_deg).all()
    assert np.isfinite(r.elevation_deg).all()
    assert "UNCERTAINTY_UNAVAILABLE" in r.warnings


def test_shape_and_rows() -> None:
    masks = compute_site_masks(*SITE, terrain_with(flat(0.0)), ERRORS)
    assert masks.masks_deg.shape == (3, 11, 720)
    assert masks.blocking_km.shape == (11, 720)
    assert masks.masks_deg.dtype == np.float32 and masks.blocking_km.dtype == np.float32
    assert HEIGHTS_M == tuple(float(h) for h in range(1, 11))


def test_far_only_ignores_nearby_ridge() -> None:
    sx, sy = SITE_XY

    def ridge(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        wall = (np.abs(x - (sx + 1000.0)) < 60.0) & (np.abs(y - sy) < 3000.0)
        return np.where(wall, 30.0, 0.0)

    masks = compute_site_masks(*SITE, terrain_with(ridge, flat(0.0)), ERRORS)
    assert masks.masks_deg[0, :10, 180].min() > 0.5
    assert masks.masks_deg[0, 10, 180] == pytest.approx(TANGENT_FLOOR_2M, abs=0.001)


def test_far_mountain_seen() -> None:
    px, py = point_east(100_000.0)
    summit = dome_field_wide((px, py))
    terrain = terrain_with(flat(3000.0), lambda x, y: 3000.0 + summit(x, y))
    masks = compute_site_masks(*SITE, terrain, ERRORS)
    assert masks.masks_deg[0, 1, 180] > 0.5
    assert masks.masks_deg[0, 10, 180] > 0.5
    assert masks.masks_deg[0, 1, 540] == pytest.approx(
        -np.degrees(np.arccos(R / (R + 2.0))), abs=0.001
    )


def test_warnings_merged() -> None:
    terrain = [make_dem(flat(3000.0), 50_000, 500, "small")]
    masks = compute_site_masks(*SITE, terrain, ERRORS)
    assert masks.warnings.count("DEM_GAPS") == 1


def rough_field(center: tuple[float, float]) -> Field:
    """Bumpy ground of +-3 m within 200 m of the site, like the relief an antenna mast sees."""

    def field(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        near = (x - center[0]) ** 2 + (y - center[1]) ** 2 < 200.0**2
        noise = (np.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1.0
        return np.where(near, (noise - 0.5) * 6.0, 0.0)

    return field


BLEND_FIELDS = {
    "mountain": lambda: terrain_with(dome_field(point_east(10_000.0))),
    "rough": lambda: terrain_with(rough_field(SITE_XY)),
}
# Where the skyline switches between a near bump and a far ridge as the height changes, the
# blend overshoots the true value. On smooth terrain that stays under 0.01 degrees; on bumpy
# ground within a few metres of the mast it reaches about 0.2 degrees, always on the safe side.
BLEND_TOLERANCE_DEG = {"mountain": 0.01, "rough": 0.25}


@pytest.fixture(scope="module", params=sorted(BLEND_FIELDS))
def blend_case(request: pytest.FixtureRequest):  # type: ignore[no-untyped-def]
    terrain = BLEND_FIELDS[request.param]()
    return terrain, compute_site_masks(*SITE, terrain, ERRORS), BLEND_TOLERANCE_DEG[request.param]


def test_mask_at_whole_metre_is_exact(blend_case) -> None:  # type: ignore[no-untyped-def]
    _, masks, _ = blend_case
    for height in range(1, 11):
        assert np.array_equal(
            mask_at_height(masks.masks_deg, float(height)), masks.masks_deg[:, height - 1]
        )


@pytest.mark.parametrize("height", [1.5, 2.25, 2.5, 2.55, 9.99])
def test_mask_at_height_close_to_march_and_conservative(blend_case, height: float) -> None:  # type: ignore[no-untyped-def]
    terrain, masks, tolerance = blend_case
    direct = march(*SITE, [height], terrain, ERRORS, DISTANCES).elevation_deg[0]
    blend = mask_at_height(masks.masks_deg, height)[0]
    finite = np.isfinite(direct)
    assert np.abs(blend[finite] - direct[finite]).max() < tolerance
    assert (blend[finite] - direct[finite]).min() > -1e-3


def test_mask_at_height_nan_propagates() -> None:
    masks = np.zeros((3, 11, 720), np.float32)
    masks[0, 2, 100] = np.nan
    blended = mask_at_height(masks, 2.5)
    assert np.isnan(blended[0, 100]) and np.isfinite(blended[0, 101])
    assert np.isnan(mask_at_height(masks, 3.5)[0, 100])
    assert np.isfinite(mask_at_height(masks, 1.5)[0, 100])


def test_mask_at_height_never_reads_the_far_row() -> None:
    masks = np.zeros((3, 11, 720), np.float32)
    masks[:, 10] = np.nan
    assert np.isfinite(mask_at_height(masks, 10.0)).all()
    assert np.isfinite(mask_at_height(masks, 9.5)).all()


def test_mask_at_ten_metres_ignores_unknown_in_the_nine_metre_row() -> None:
    masks = np.zeros((3, 11, 720), np.float32)
    masks[:, 8, 5] = np.nan
    assert np.isfinite(mask_at_height(masks, 10.0)).all()
    assert np.isnan(mask_at_height(masks, 9.5)[0, 5])
