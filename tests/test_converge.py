import numpy as np
from numpy.typing import NDArray

from build.converge import max_mask_change
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
