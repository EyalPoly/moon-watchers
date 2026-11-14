from datetime import UTC, datetime

import numpy as np
import pytest

from engine.geometry import (
    EARTH_POLAR_RADIUS_KM,
    EARTH_RADIUS_KM,
    HOUSTON,
    Ephemeris,
    OutOfRange,
    SkyState,
    Station,
    angular_radius_deg,
    az_el,
    interpolate,
    observer_km,
    site_basis,
    station_fixed_km,
    station_sky,
)
from tests.ephemeris_helpers import synthetic_ephemeris

START = datetime(2027, 3, 1, tzinfo=UTC)


def test_az_el_cardinal() -> None:
    up, east, north = site_basis(-89.0, 30.0)
    az, el = az_el(np.array([north, east, up]), -89.0, 30.0)
    assert az[0] == pytest.approx(0, abs=1e-9)
    assert az[1] == pytest.approx(90, abs=1e-9)
    assert el == pytest.approx([0, 0, 90], abs=1e-9)


def test_pole_north_is_lon0() -> None:
    az, el = az_el(np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]), -90.0, 77.0)
    assert az == pytest.approx([0, 90], abs=1e-9)
    assert el == pytest.approx([0, 0], abs=1e-9)


@pytest.mark.parametrize(("lat", "lon"), [(-80.0, 40.0), (-90.0, 0.0), (-89.99, -170.0)])
def test_azimuth_range(lat: float, lon: float) -> None:
    rng = np.random.default_rng(7)
    az, el = az_el(rng.normal(size=(1000, 3)), lat, lon)
    assert np.all(np.isfinite(az)) and np.all(np.isfinite(el))
    assert np.all(az >= 0) and np.all(az < 360)


def cubic_ephemeris() -> Ephemeris:
    rows = 12
    t = np.arange(rows, dtype=float)
    base = np.stack([0.5 * t**3 - 2 * t**2 + 3 * t + k for k in range(9)], axis=1)
    rotation = np.stack([np.eye(3) * (1 + 0.1 * x**3) for x in t])
    return Ephemeris(start=START, step_s=1, vectors_km=base, earth_rotation=rotation)


def test_interpolate_exact_on_rows() -> None:
    eph = synthetic_ephemeris(START, 2)
    t = np.array([3600.0, 5 * 3600.0, 20 * 3600.0])
    sky = interpolate(eph, t)
    assert sky.sun_cns_km == pytest.approx(eph.vectors_km[[1, 5, 20], 0:3], abs=1e-9)
    assert sky.earth_geo_km == pytest.approx(eph.vectors_km[[1, 5, 20], 6:9], abs=1e-9)
    assert sky.earth_rotation == pytest.approx(eph.earth_rotation[[1, 5, 20]], abs=1e-12)


def test_interpolate_reproduces_cubic() -> None:
    eph = cubic_ephemeris()
    t = np.array([1.3, 4.5, 7.99, 9.01])
    sky = interpolate(eph, t)
    expected = np.stack([0.5 * t**3 - 2 * t**2 + 3 * t + k for k in range(9)], axis=1)
    assert sky.sun_cns_km == pytest.approx(expected[:, 0:3], abs=1e-9)
    assert sky.earth_cns_km == pytest.approx(expected[:, 3:6], abs=1e-9)
    assert sky.earth_geo_km == pytest.approx(expected[:, 6:9], abs=1e-9)
    assert sky.earth_rotation[:, 0, 0] == pytest.approx(1 + 0.1 * t**3, abs=1e-9)


@pytest.mark.parametrize("t", [-0.5, 0.0, 0.99, 10.0, 11.0])
def test_interpolate_out_of_range_raises(t: float) -> None:
    # 12 rows: a time needs one row before it and two after, so t in [1, 10) is the valid span.
    with pytest.raises(OutOfRange):
        interpolate(cubic_ephemeris(), np.array([t]))


def test_station_fixed_equator_and_pole() -> None:
    pos, normal = station_fixed_km(Station(0, 0, 0, 0))
    assert pos == pytest.approx([EARTH_RADIUS_KM, 0, 0], abs=1e-9)
    assert normal == pytest.approx([1, 0, 0], abs=1e-12)
    pos, normal = station_fixed_km(Station(90, 0, 0, 0))
    assert pos == pytest.approx([0, 0, EARTH_POLAR_RADIUS_KM], abs=1e-6)
    assert normal == pytest.approx([0, 0, 1], abs=1e-12)


def test_station_fixed_matches_georec() -> None:
    spice = pytest.importorskip("spiceypy")
    rng = np.random.default_rng(3)
    for _ in range(20):
        lat, lon, alt = rng.uniform(-90, 90), rng.uniform(-180, 180), rng.uniform(-500, 9000)
        pos, _ = station_fixed_km(Station(lat, lon, alt, 0))
        f = (EARTH_RADIUS_KM - EARTH_POLAR_RADIUS_KM) / EARTH_RADIUS_KM
        expected = spice.georec(np.radians(lon), np.radians(lat), alt / 1000, EARTH_RADIUS_KM, f)
        assert pos == pytest.approx(expected, abs=1e-6)


def test_earth_parallax() -> None:
    lat, lon = 0.0, 0.0
    up, east, _ = site_basis(lat, lon)
    observer = observer_km(lat, lon, 0.0, 0.0)
    earth = 384_400.0 * east
    _, el_center = az_el(earth[None, :], lat, lon)
    _, el_site = az_el((earth - observer)[None, :], lat, lon)
    assert el_center[0] == pytest.approx(0, abs=1e-9)
    assert el_site[0] == pytest.approx(-np.degrees(np.arcsin(1737.4 / 384_400.0)), abs=0.001)


def test_angular_radius() -> None:
    assert angular_radius_deg(696_000.0, np.array([[149.6e6, 0, 0]])) == pytest.approx(0.2666, abs=1e-3)


def test_station_moon_el_overhead() -> None:
    eph = synthetic_ephemeris(START, 2)
    sky = SkyState(
        sun_cns_km=eph.vectors_km[:1, 0:3],
        earth_cns_km=eph.vectors_km[:1, 3:6],
        earth_geo_km=eph.vectors_km[:1, 6:9],
        earth_rotation=eph.earth_rotation[:1],
    )
    observer = observer_km(-89.0, 10.0, 0.0, 2.0)
    result = station_sky(sky, HOUSTON, observer, -89.0, 10.0)
    fixed, normal_fixed = station_fixed_km(HOUSTON)
    station = sky.earth_geo_km[0] + sky.earth_rotation[0] @ fixed
    normal = sky.earth_rotation[0] @ normal_fixed
    to_moon = observer - station
    angle = np.degrees(np.arccos(normal @ to_moon / np.linalg.norm(to_moon)))
    assert result.moon_el_deg[0] == pytest.approx(90 - angle, abs=1e-6)
    # Houston's meridian is under the Moon, so the Moon stands near 90° minus its latitude
    # (less than a degree off, from the Moon's parallax seen from the Earth's surface).
    assert result.moon_el_deg[0] == pytest.approx(90 - HOUSTON.lat_deg, abs=1.0)
    assert 0 <= result.az_deg[0] < 360
