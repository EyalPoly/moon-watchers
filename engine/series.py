import calendar
from dataclasses import dataclass, fields
from datetime import UTC, datetime, timedelta

import numpy as np
from numpy.typing import NDArray

from engine.geometry import (
    EARTH_RADIUS_KM,
    SUN_RADIUS_KM,
    Ephemeris,
    Station,
    angular_radius_deg,
    az_el,
    interpolate,
    observer_km,
    station_sky,
)
from engine.visibility import (
    contact_state,
    disk_fraction,
    skyline_at,
    sun_fraction,
    visible_state,
)

STEP_S = 600
STEPS_PER_DAY = 86400 // STEP_S

F64 = NDArray[np.float64]


@dataclass(frozen=True)
class SeriesArrays:
    sun_az: F64
    sun_el: F64
    sun_vis_el: F64
    sun_horizon_el: F64
    sun_lit_frac: F64
    earth_az: F64
    earth_el: F64
    earth_vis_el: F64
    earth_horizon_el: F64
    earth_any: NDArray[np.float32]
    earth_whole: NDArray[np.float32]
    contact: NDArray[np.float32]
    station_az: F64
    station_el: F64
    station_horizon_el: F64
    earth_station_up: NDArray[np.bool_]
    station_moon_el: F64


SERIES_FIELDS = tuple(f.name for f in fields(SeriesArrays))


def month_times(month: str) -> tuple[datetime, int]:
    year, number = (int(part) for part in month.split("-"))
    days = calendar.monthrange(year, number)[1]
    return datetime(year, number, 1, tzinfo=UTC), days * STEPS_PER_DAY


def _compute_chunk(
    eph: Ephemeris,
    lat_deg: float,
    lon_deg: float,
    ground_m: float,
    panel_mask: F64,
    antenna_mask: F64,
    panel_m: float,
    antenna_m: float,
    station: Station,
    start: datetime,
    n: int,
) -> SeriesArrays:
    panel_mask = np.asarray(panel_mask, dtype=np.float64)
    antenna_mask = np.asarray(antenna_mask, dtype=np.float64)
    offset_s = (start - eph.start).total_seconds()
    sky = interpolate(eph, offset_s + STEP_S * np.arange(n, dtype=np.float64))
    panel = observer_km(lat_deg, lon_deg, ground_m, panel_m)
    antenna = observer_km(lat_deg, lon_deg, ground_m, antenna_m)

    sun_vec = sky.sun_cns_km - panel
    sun_az, sun_el = az_el(sun_vec, lat_deg, lon_deg)
    sun_r = angular_radius_deg(SUN_RADIUS_KM, sun_vec)
    occulting = sky.earth_cns_km - panel
    occ_az, occ_el = az_el(occulting, lat_deg, lon_deg)
    occ_r = angular_radius_deg(EARTH_RADIUS_KM, occulting)

    earth_vec = sky.earth_geo_km - antenna
    earth_az, earth_el = az_el(earth_vec, lat_deg, lon_deg)
    earth_r = angular_radius_deg(EARTH_RADIUS_KM, earth_vec)
    station_view = station_sky(sky, station, antenna, lat_deg, lon_deg)
    up = station_view.moon_el_deg >= station.min_el_deg

    earth_fraction = disk_fraction(antenna_mask, earth_az, earth_el, earth_r)
    return SeriesArrays(
        sun_az=sun_az,
        sun_el=sun_el,
        sun_vis_el=sun_el + sun_r,
        sun_horizon_el=skyline_at(panel_mask, sun_az),
        sun_lit_frac=sun_fraction(panel_mask, sun_az, sun_el, sun_r, occ_az, occ_el, occ_r),
        earth_az=earth_az,
        earth_el=earth_el,
        earth_vis_el=np.where(up, station_view.el_deg, 90.0),
        earth_horizon_el=skyline_at(antenna_mask, earth_az),
        earth_any=visible_state(earth_fraction),
        earth_whole=visible_state(earth_fraction, whole=True),
        contact=contact_state(
            antenna_mask, station_view.az_deg, station_view.el_deg, station_view.moon_el_deg, station.min_el_deg
        ),
        station_az=station_view.az_deg,
        station_el=station_view.el_deg,
        station_horizon_el=skyline_at(antenna_mask, station_view.az_deg),
        earth_station_up=up,
        station_moon_el=station_view.moon_el_deg,
    )


# The disk-fraction and occultation maths builds temporaries of about 10 KiB per time step, so a
# year-long window in one piece needs over 500 MiB; 30-day pieces stay near 45 MiB.
CHUNK_STEPS = 30 * STEPS_PER_DAY


def compute_series(
    eph: Ephemeris,
    lat_deg: float,
    lon_deg: float,
    ground_m: float,
    panel_mask: F64,
    antenna_mask: F64,
    panel_m: float,
    antenna_m: float,
    station: Station,
    start: datetime,
    n: int,
) -> SeriesArrays:
    pieces = [
        _compute_chunk(
            eph, lat_deg, lon_deg, ground_m, panel_mask, antenna_mask, panel_m, antenna_m, station,
            start + timedelta(seconds=STEP_S * first), min(CHUNK_STEPS, n - first),
        )
        for first in range(0, max(n, 1), CHUNK_STEPS)
    ]
    if len(pieces) == 1:
        return pieces[0]
    return SeriesArrays(**{name: np.concatenate([getattr(p, name) for p in pieces]) for name in SERIES_FIELDS})
