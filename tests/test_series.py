from datetime import UTC, datetime

import numpy as np
import pytest

from engine.geometry import EARTH_RADIUS_KM, HOUSTON, SUN_RADIUS_KM, angular_radius_deg
from engine.horizons import mask_at_height
from engine.series import STEP_S, SeriesArrays, compute_series, month_times
from tests.ephemeris_helpers import synthetic_ephemeris

START = datetime(2027, 3, 1, tzinfo=UTC)
EPH = synthetic_ephemeris(datetime(2027, 2, 27, tzinfo=UTC), 40)
LAT, LON = -89.0, 10.0
N = 4464
SUN_R = 0.2666


def run(panel: np.ndarray, antenna: np.ndarray | None = None, n: int = N, lat: float = LAT, lon: float = LON,
        panel_m: float = 2.0, antenna_m: float = 3.0, station=HOUSTON) -> SeriesArrays:  # type: ignore[no-untyped-def]
    return compute_series(EPH, lat, lon, 0.0, panel, panel if antenna is None else antenna,
                          panel_m, antenna_m, station, START, n)


def flat(value: float) -> np.ndarray:
    return np.full(720, value)


def test_month_times() -> None:
    assert month_times("2027-03") == (START, 4464)
    assert month_times("2028-02") == (datetime(2028, 2, 1, tzinfo=UTC), 4176)
    assert STEP_S == 600


def earth_sun_separation(s: SeriesArrays) -> np.ndarray:
    def vec(az: np.ndarray, el: np.ndarray) -> np.ndarray:
        a, e = np.radians(az), np.radians(el)
        return np.stack([np.cos(e) * np.sin(a), np.cos(e) * np.cos(a), np.sin(e)], axis=1)

    # Earth is seen from the antenna, the Sun from the panel: 1 m of height changes neither by 1e-6 degrees.
    cos = np.sum(vec(s.sun_az, s.sun_el) * vec(s.earth_az, s.earth_el), axis=1)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def test_vis_el_definitions() -> None:
    s = run(flat(-90.0))
    assert s.sun_vis_el == pytest.approx(s.sun_el + SUN_R, abs=2e-3)
    up = s.earth_station_up
    assert up.any() and (~up).any()
    assert np.array_equal(s.earth_vis_el[up], s.station_el[up])
    assert np.all(s.earth_vis_el[~up] == 90.0)
    assert s.sun_az.shape == (N,) and s.contact.dtype == np.float32 and s.earth_station_up.dtype == bool


def test_flat_low_skyline_all_visible() -> None:
    s = run(flat(-90.0))
    sep = earth_sun_separation(s)
    uncovered = sep > SUN_R + 0.95 + 0.05
    assert uncovered.sum() > N * 0.9
    assert np.all(s.sun_lit_frac[uncovered] == 1.0)
    assert np.all(s.sun_lit_frac[sep < 0.95 - SUN_R - 0.05] == 0.0)
    assert np.array_equal(s.contact == 1, s.earth_station_up)
    assert not np.isnan(s.contact).any()
    assert np.all(s.earth_any == 1) and np.all(s.earth_whole == 1)


def test_mountain_due_east_blocks_sun_when_due_east() -> None:
    az = np.arange(720) * 0.5
    skyline = np.where((az >= 85) & (az <= 95), 5.0, -90.0)
    s = run(skyline)
    sep = earth_sun_separation(s)
    off = np.abs((s.sun_az - 90 + 180) % 360 - 180)
    blocked = (off < 4.5 - SUN_R) & (s.sun_el + SUN_R < 5)
    clear = (off > 5.5 + SUN_R) & (sep > SUN_R + 0.95 + 0.05)
    assert blocked.sum() > 20 and clear.sum() > 1000
    assert np.all(s.sun_lit_frac[blocked] == 0.0)
    assert np.all(s.sun_lit_frac[clear] == 1.0)


def test_higher_antenna_never_reduces_contact() -> None:
    rng = np.random.default_rng(2)
    base = np.convolve(rng.uniform(0, 4, 728), np.ones(9) / 9, mode="valid")
    masks = np.stack([np.stack([base - 0.35 * k for k in range(11)])] * 3).astype(np.float32)
    counts = []
    for height in range(1, 11):
        antenna = mask_at_height(masks, float(height))[0].astype(np.float64)
        counts.append(int(np.sum(run(base, antenna, antenna_m=float(height)).contact == 1)))
    assert counts == sorted(counts) and counts[-1] > counts[0]


def test_unknown_skyline_gives_nan_fraction() -> None:
    skyline = flat(-90.0)
    skyline[200:221] = np.nan  # azimuths 100 to 110
    s = run(skyline)
    nan = np.isnan(s.sun_lit_frac)
    inside = (s.sun_az >= 100) & (s.sun_az <= 110)
    outside = (s.sun_az < 98.5) | (s.sun_az > 112)
    assert inside.sum() > 10 and np.all(nan[inside]) and not nan[outside].any()
    assert np.all(np.isnan(s.sun_horizon_el[inside])) and not np.isnan(s.sun_horizon_el[outside]).any()
    assert not np.isnan(s.contact).any()


def test_unknown_station_direction_gives_nan_contact_only_when_station_up() -> None:
    skyline = flat(np.nan)
    s = run(skyline)
    assert np.all(np.isnan(s.contact[s.earth_station_up]))
    assert np.all(s.contact[~s.earth_station_up] == 0)
    assert np.all(s.earth_vis_el[~s.earth_station_up] == 90.0)


def test_pole_site_has_finite_azimuths() -> None:
    s = run(flat(-90.0), lat=-90.0, lon=0.0, n=300)
    for name in ("sun_az", "earth_az", "station_az"):
        values = getattr(s, name)
        assert np.all(np.isfinite(values)) and np.all((values >= 0) & (values < 360))


def test_pole_is_the_same_sky_rotated() -> None:
    a = run(flat(-90.0), lat=-90.0, lon=0.0, n=50)
    b = run(flat(-90.0), lat=-90.0, lon=90.0, n=50)
    # At the pole the longitude is ignored: north is the direction of longitude 0 either way.
    assert np.allclose(a.sun_az, b.sun_az) and np.allclose(a.sun_el, b.sun_el)


def test_out_of_table_raises() -> None:
    from engine.geometry import OutOfRange

    with pytest.raises(OutOfRange):
        compute_series(EPH, LAT, LON, 0.0, flat(0.0), flat(0.0), 2.0, 3.0, HOUSTON,
                       datetime(2027, 5, 1, tzinfo=UTC), 10)


def test_radii_are_apparent() -> None:
    assert angular_radius_deg(SUN_RADIUS_KM, np.array([[149.6e6, 0, 0]]))[0] == pytest.approx(SUN_R, abs=1e-3)
    assert angular_radius_deg(EARTH_RADIUS_KM, np.array([[384_400.0, 0, 0]]))[0] == pytest.approx(0.9507, abs=1e-3)


LONG_EPH = synthetic_ephemeris(datetime(2027, 2, 27, tzinfo=UTC), 400)
YEAR_STEPS = 365 * 144 + 72
# A hand-made skyline with a bump, so the lit fraction takes values between 0 and 1.
BUMPY = 0.5 + 0.4 * np.sin(np.linspace(0, 12 * np.pi, 720))


def test_series_memory_does_not_grow_with_the_window() -> None:
    import tracemalloc

    tracemalloc.start()
    run_long(BUMPY, n=YEAR_STEPS)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    # A year of results is about 10 MB; the Cloud Run instance has 512 MiB in all.
    assert peak < 150 * 2**20


def run_long(panel: np.ndarray, n: int) -> SeriesArrays:
    return compute_series(LONG_EPH, LAT, LON, 0.0, panel, panel, 2.0, 3.0, HOUSTON, START, n)


def test_series_over_a_long_window_equals_the_same_steps_in_pieces() -> None:
    whole = run_long(BUMPY, n=YEAR_STEPS)
    cut = 4464
    first = run_long(BUMPY, n=cut)
    for name in SeriesArrays.__dataclass_fields__:
        np.testing.assert_array_equal(getattr(whole, name)[:cut], getattr(first, name), err_msg=name)
    assert all(len(getattr(whole, name)) == YEAR_STEPS for name in SeriesArrays.__dataclass_fields__)
