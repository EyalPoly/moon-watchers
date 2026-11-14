import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from collections import namedtuple

import numpy as np
import pytest

from build.make_ephemeris import KERNELS, direct_sky
from engine.geometry import HOUSTON, az_el, observer_km, station_sky

PROTOTYPE = Path("MenasimMoonV2")
SPICE_DIR = Path("data/sources/spice")
LAT, LON = -89.0, 0.0
PANEL_M, ANTENNA_M = 2.0, 3.0
ARCSEC = 1 / 3600

pytestmark = pytest.mark.skipif(
    not (PROTOTYPE / "lunar_nav").is_dir() or not all((SPICE_DIR / n).is_file() for n in KERNELS),
    reason="the physics prototype or the SPICE kernels are not available",
)


def test_matches_prototype_geometry() -> None:
    spice = pytest.importorskip("spiceypy")
    sys.path.insert(0, str(PROTOTYPE))
    try:
        geometry = pytest.importorskip("lunar_nav.geometry")
    finally:
        sys.path.pop(0)

    start = datetime(2026, 11, 15, tzinfo=UTC)
    # 24 h steps drift through the Moon's 24.8 h pass over Houston, so some samples are below the horizon.
    times = [start + timedelta(hours=24.0 * k) for k in range(30)]
    ours = direct_sky(SPICE_DIR, times)
    spice.kclear()
    for name in KERNELS:
        spice.furnsh(str(SPICE_DIR / name))
    try:
        proto = geometry.SpiceGeometry(provenance={}, earth_orientation_observed_until="n/a")
        ets = np.array([proto.to_seconds(t) for t in times])
        panel = observer_km(LAT, LON, 0.0, PANEL_M)
        apparent = proto.apparent_vectors(ets, panel * 1000)
        point = namedtuple("point", "longitude_deg latitude_deg altitude_m")  # hashable, as the prototype caches by it
        station = point(HOUSTON.lon_deg, HOUSTON.lat_deg, 0.0)
        vectors = proto.vectors(ets, station)
    finally:
        spice.kclear()

    sun_az, sun_el = az_el(ours.sun_cns_km - panel, LAT, LON)
    their_az, their_el = az_el(apparent["sun"] / 1000, LAT, LON)
    d_az = ((sun_az - their_az + 180) % 360 - 180) * np.cos(np.radians(their_el))
    sun_separation = np.hypot(d_az, sun_el - their_el)
    print(f"Sun vs prototype apparent_vectors: max {sun_separation.max() / ARCSEC:.5f} arcsec")
    assert sun_separation.max() < ARCSEC

    antenna = observer_km(LAT, LON, 0.0, ANTENNA_M)
    class Sky:  # the interpolated-table object is not needed: direct vectors in, same math out
        earth_geo_km = ours.earth_geo_km
        earth_rotation = ours.earth_rotation

    ours_station = station_sky(Sky, HOUSTON, antenna, LAT, LON)  # type: ignore[arg-type]
    line = vectors["station"] / 1000 - antenna
    their_st_az, their_st_el = az_el(line, LAT, LON)
    unit = line / np.linalg.norm(line, axis=1, keepdims=True)
    their_moon_el = np.degrees(np.arcsin(np.clip(-np.sum(unit * vectors["station_up"], axis=1), -1, 1)))
    up = their_moon_el >= HOUSTON.min_el_deg  # below the mask the contact is 0 whatever the terrain says
    assert 5 < up.sum() < 30
    d_az = ((ours_station.az_deg - their_st_az + 180) % 360 - 180) * np.cos(np.radians(their_st_el))
    direction = np.hypot(d_az, ours_station.el_deg - their_st_el)[up].max()
    moon = np.abs(ours_station.moon_el_deg - their_moon_el)[up].max()
    print(f"Houston vs prototype: direction max {direction:.2e} deg, moon_el max {moon:.2e} deg ({up.sum()}/30 up)")
    assert direction < 0.001
    assert moon < 0.001
