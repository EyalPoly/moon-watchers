import pytest

import build.make_masks as build_masks
from engine.terrain import project
from engine.windows import map_half_width_m, window_around


def test_map_half_width_matches_the_catalog_build() -> None:
    assert map_half_width_m(-85.5, 200_000.0) == build_masks.map_half_width_m(-85.5, 200_000.0)
    assert map_half_width_m(-85.5, 200_000.0) > 201_800.0


def test_window_is_centred_on_the_point() -> None:
    x_min, y_min, x_max, y_max = window_around(-89.0, 90.0, 12_000.0)
    x, y = project(-89.0, 90.0)
    assert (x_min + x_max) / 2 == pytest.approx(float(x), abs=1e-6)
    assert (y_min + y_max) / 2 == pytest.approx(float(y), abs=1e-6)
    assert x_max - x_min == pytest.approx(y_max - y_min)
