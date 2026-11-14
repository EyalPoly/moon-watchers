import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from engine.visibility import (
    contact_state,
    disk_fraction,
    skyline_at,
    sun_fraction,
    visible_state,
)

R = 0.267


def flat(value: float) -> np.ndarray:
    return np.full(720, value)


def f(horizon: np.ndarray, az: float, el: float, radius: float = R, **kw) -> float:  # type: ignore[no-untyped-def]
    return float(disk_fraction(horizon, np.array([az]), np.array([el]), np.array([radius]), **kw)[0])


def test_skyline_at_interpolates_periodically() -> None:
    h = np.arange(720, dtype=float)
    assert skyline_at(h, np.array([0.25]))[0] == pytest.approx(0.5)
    assert skyline_at(h, np.array([359.75]))[0] == pytest.approx((719 + 0) / 2)
    assert np.isnan(skyline_at(np.where(np.arange(720) == 10, np.nan, 0.0), np.array([4.8]))[0])


def test_disk_flat_skyline() -> None:
    assert f(flat(1.0), 100, 1.0) == pytest.approx(0.5, abs=1e-12)
    assert f(flat(1.0), 100, 1.0 + 2 * R) == 1.0
    assert f(flat(1.0), 100, 1.0 - 2 * R) == 0.0


def test_skyline_changes_within_disk() -> None:
    az = np.arange(720) * 0.5
    h = np.where(az < 180, 90.0, -90.0)
    # The skyline blends across 0.5° between samples, so the step sits at 179.75°; a 5° disk centred on it.
    assert f(h, 179.75, 0.0, radius=5.0) == pytest.approx(0.5, abs=1 / 128)


def test_eclipse() -> None:
    sky = flat(-90.0)
    one = np.array([1.0])
    center = (np.array([100.0]), np.array([10.0]), np.array([2 * R]))
    assert float(disk_fraction(sky, np.array([100.0]), np.array([10.0]), np.array([R]), occultor=center)[0]) == 0.0
    offset = (np.array([100.0 + R / np.cos(np.radians(10.0))]), np.array([10.0]), np.array([R]))
    partial = float(disk_fraction(sky, np.array([100.0]), np.array([10.0]), np.array([R]), occultor=offset)[0])
    assert 0.0 < partial < 1.0
    assert one[0] == 1.0


def test_unknown_inside_disk_is_nan() -> None:
    h = flat(-90.0)
    h[180] = np.nan  # azimuth 90°
    assert np.isnan(f(h, 90.0, 5.0))
    assert np.isfinite(f(h, 100.0, 5.0))


def test_wrap_at_north() -> None:
    rng = np.random.default_rng(5)
    h = np.convolve(rng.uniform(-1, 1, 720 + 8), np.ones(9) / 9, mode="valid")
    rotated = np.roll(h, -360)
    for el in (0.0, 0.3, -0.2):
        assert f(h, 359.9, el) == pytest.approx(f(rotated, 179.9, el), abs=1e-10)


def test_visible_state_thresholds() -> None:
    fractions = np.array([0.0, 1e-11, 1e-9, np.nan, 1 - 1e-11, 1.0])
    out = visible_state(fractions)
    assert out[0] == 0 and out[1] == 0 and out[2] == 1 and np.isnan(out[3]) and out[5] == 1
    whole = visible_state(fractions, whole=True)
    assert whole[4] == 1 and whole[1] == 0 and np.isnan(whole[3]) and whole[5] == 1
    assert out.dtype == np.float32


def test_contact_rule() -> None:
    h = flat(1.0)
    az = np.array([10.0] * 5)
    el = np.array([5.0, 0.5, 5.0, 5.0, 5.0])
    moon = np.array([30.0, 30.0, -1.0, 30.0, 0.0])
    skyline = h.copy()
    skyline[20] = np.nan
    result = contact_state(h, az, el, moon, 0.0)
    assert list(result) == [1, 0, 0, 1, 1]
    nan_az = np.array([10.0, 10.0, 10.0])
    nan_result = contact_state(skyline, nan_az, np.array([5.0, 5.0, 5.0]), np.array([-1.0, 30.0, 0.0]), 0.0)
    assert nan_result[0] == 0 and np.isnan(nan_result[1]) and np.isnan(nan_result[2])
    assert contact_state(h, az[:1], el[:1], np.array([10.0]), 10.0)[0] == 1


def test_sun_fraction_is_disk_with_earth_occultor() -> None:
    sky = flat(-90.0)
    sun = (np.array([100.0]), np.array([10.0]), np.array([R]))
    earth = (np.array([100.0]), np.array([10.0]), np.array([0.95]))
    assert sun_fraction(sky, *sun, *earth)[0] == 0.0
    far = (np.array([150.0]), np.array([10.0]), np.array([0.95]))
    assert sun_fraction(sky, *sun, *far)[0] == 1.0


def test_matches_prototype_disk() -> None:
    sys.path.insert(0, str(Path("MenasimMoonV2")))
    try:
        geometry = pytest.importorskip("lunar_nav.geometry")
    finally:
        sys.path.pop(0)
    rng = np.random.default_rng(21)
    h = np.convolve(rng.uniform(-2, 3, 720 + 8), np.ones(9) / 9, mode="valid")
    grid = np.arange(720) * 0.5
    proto = SimpleNamespace(at=lambda az, which: np.interp(az, grid, h, period=360))
    n = 500
    az = rng.uniform(0, 360, n)
    el = rng.uniform(-1, 4, n)
    radius = np.full(n, R)
    occultor = (az + rng.uniform(-0.6, 0.6, n), el + rng.uniform(-0.6, 0.6, n), np.full(n, 0.95))
    expected, _, _ = geometry.disk_visibility(az, el, radius, proto, 128, occultor=occultor)
    ours = disk_fraction(h, az, el, radius, occultor=occultor)
    assert ours == pytest.approx(expected, abs=1e-12)
