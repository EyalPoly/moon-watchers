import numpy as np
import pytest
from numpy.typing import NDArray

from build.converge import converge_layers, max_mask_change
from engine.horizons import march, ray_distances
from tests.test_horizons import ERRORS, SITE, dome_field, point_east, terrain_with


def test_max_mask_change_zero_for_identical() -> None:
    a = np.array([1.0, 2.0, 3.0])
    assert max_mask_change(a, a.copy()) == 0.0


def test_max_mask_change_ignores_nan() -> None:
    a = np.array([1.0, np.nan, 3.0])
    b = np.array([1.5, 9.0, np.nan])
    assert max_mask_change(a, b) == 0.5


def test_converges_on_synthetic_dem() -> None:
    terrain = terrain_with(dome_field(point_east(6_000.0)))
    base: NDArray[np.float32] = march(*SITE, [2.0], terrain, ERRORS, ray_distances()).elevation_deg
    wide = march(*SITE, [2.0], terrain, ERRORS, ray_distances(near_m=20_000.0)).elevation_deg
    assert max_mask_change(base, wide) < 0.001


def test_max_mask_change_without_overlap_is_an_error() -> None:
    with pytest.raises(ValueError, match="no direction"):
        max_mask_change(np.array([np.nan]), np.array([1.0]))


def test_converge_windows_cover_the_widest_schedule() -> None:
    by_dem = {layer.dem: layer.half_width_m for layer in converge_layers()}
    assert by_dem["lola/LDEM_60S_240MPP_ADJ.TIF"] >= 400_000.0
    assert by_dem["lola/LDEM_80S_20MPP_ADJ.TIF"] >= 20_000.0
    assert by_dem["lola/LDEM_80S_80MPP_ADJ.TIF"] >= 20_000.0


def ridge_east(distance_m: float, height_m: float, sigma_m: float):  # type: ignore[no-untyped-def]
    center = point_east(distance_m)

    def field(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float64]:
        d2 = (x - center[0]) ** 2 + (y - center[1]) ** 2
        return height_m * np.exp(-d2 / (2 * sigma_m**2))

    return field


def test_far_step_does_not_miss_a_narrow_distant_ridge() -> None:
    # A ridge 12.28 km out falls between two 240 m samples and is clipped by about 0.15 degrees.
    terrain = terrain_with(ridge_east(12_280.0, 200.0, 200.0))
    default = march(*SITE, [2.0], terrain, ERRORS, ray_distances()).elevation_deg
    fine = march(*SITE, [2.0], terrain, ERRORS, ray_distances(far_step_m=15.0)).elevation_deg
    assert max_mask_change(default, fine) < 0.02


def test_the_old_240_m_far_step_missed_that_ridge() -> None:
    terrain = terrain_with(ridge_east(12_280.0, 200.0, 200.0))
    coarse = march(*SITE, [2.0], terrain, ERRORS, ray_distances(far_step_m=240.0)).elevation_deg
    fine = march(*SITE, [2.0], terrain, ERRORS, ray_distances(far_step_m=15.0)).elevation_deg
    assert max_mask_change(coarse, fine) > 0.05
