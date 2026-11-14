import pytest

from build.gpu_spike import origin_bounds


def test_every_ray_stays_inside_the_dem() -> None:
    low, high = origin_bounds(dem_size=1000, n_steps=100)
    assert low - 100 >= 0
    assert high + 100 + 1 <= 999


def test_dem_too_small_for_the_ray_length_is_rejected() -> None:
    with pytest.raises(ValueError):
        origin_bounds(dem_size=200, n_steps=100)
