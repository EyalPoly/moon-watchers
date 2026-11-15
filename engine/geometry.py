from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
from numpy.typing import NDArray

from engine.terrain import MOON_RADIUS_M

SUN_RADIUS_KM = 696_000.0
EARTH_RADIUS_KM = 6_378.1366
EARTH_POLAR_RADIUS_KM = 6_356.7519
MOON_FRAME = "MOON_ME_DE440_ME421"
EARTH_ORIENTATION_OBSERVED_UNTIL = datetime(2026, 8, 6, tzinfo=UTC)

Vec = NDArray[np.float64]


class OutOfRange(ValueError):
    """A time falls outside the rows the interpolation needs."""


def site_basis(lat_deg: float, lon_deg: float) -> tuple[Vec, Vec, Vec]:
    """Unit vectors (up, east, north) at a site. North at the pole is the direction of longitude 0."""
    lon = 0.0 if lat_deg <= -90.0 else lon_deg
    phi, lam = np.radians(lat_deg), np.radians(lon)
    up = np.array([np.cos(phi) * np.cos(lam), np.cos(phi) * np.sin(lam), np.sin(phi)])
    east = np.array([-np.sin(lam), np.cos(lam), 0.0])
    north = np.array([-np.sin(phi) * np.cos(lam), -np.sin(phi) * np.sin(lam), np.cos(phi)])
    return up, east, north


@dataclass(frozen=True)
class Ephemeris:
    start: datetime
    step_s: int
    vectors_km: Vec  # [rows, 9]: Sun CN+S, Earth CN+S, Earth geometric
    earth_rotation: Vec  # [rows, 3, 3]: ITRF93 -> MOON_ME


@dataclass(frozen=True)
class SkyState:
    sun_cns_km: Vec
    earth_cns_km: Vec
    earth_geo_km: Vec
    earth_rotation: Vec


EARTH_SPIN_RAD_S = 7.292115e-5


def _spin(angle: Vec) -> Vec:
    """Rotations about z, one 3x3 matrix per angle (any array shape)."""
    c, s = np.cos(angle), np.sin(angle)
    out = np.zeros((*np.shape(angle), 3, 3))
    out[..., 0, 0] = c
    out[..., 0, 1] = -s
    out[..., 1, 0] = s
    out[..., 1, 1] = c
    out[..., 2, 2] = 1.0
    return out


def interpolate(eph: Ephemeris, t_s: Vec) -> SkyState:
    """4-point Lagrange interpolation; t_s is UTC seconds since eph.start."""
    x = np.asarray(t_s, dtype=np.float64) / eph.step_s
    base = np.floor(x).astype(np.int64)
    rows = eph.vectors_km.shape[0]
    if np.any(base < 1) or np.any(base + 2 > rows - 1):
        raise OutOfRange("time outside the ephemeris table")
    f = x - base
    weights = np.stack(
        [
            -f * (f - 1) * (f - 2) / 6,
            (f + 1) * (f - 1) * (f - 2) / 2,
            -(f + 1) * f * (f - 2) / 2,
            (f + 1) * f * (f - 1) / 6,
        ],
        axis=1,
    )
    index = base[:, None] + np.arange(-1, 3)
    vectors = np.einsum("mk,mkc->mc", weights, eph.vectors_km[index])
    # The Earth turns 15° per hourly row, far too fast for a cubic on the matrix itself. The
    # spin is taken out, the slow remainder (precession, libration frame) is interpolated, and
    # the spin is put back analytically. The rate only needs to be close: it cancels exactly.
    row_angle = (EARTH_SPIN_RAD_S * eph.step_s) * index.astype(np.float64)
    slow = eph.earth_rotation[index] @ _spin(-row_angle)
    rotation = np.einsum("mk,mkij->mij", weights, slow) @ _spin(EARTH_SPIN_RAD_S * x * eph.step_s)
    return SkyState(vectors[:, 0:3], vectors[:, 3:6], vectors[:, 6:9], rotation)


def observer_km(lat_deg: float, lon_deg: float, ground_m: float, height_m: float) -> Vec:
    up, _, _ = site_basis(lat_deg, lon_deg)
    return up * (MOON_RADIUS_M + ground_m + height_m) / 1000.0


def az_el(vectors_km: Vec, lat_deg: float, lon_deg: float) -> tuple[Vec, Vec]:
    """Azimuth (clockwise from north, [0, 360)) and elevation in degrees of vectors seen from a site."""
    up, east, north = site_basis(lat_deg, lon_deg)
    v = np.asarray(vectors_km, dtype=np.float64)
    norm = np.linalg.norm(v, axis=1)
    el = np.degrees(np.arcsin(np.clip(v @ up / norm, -1.0, 1.0)))
    az = np.degrees(np.arctan2(v @ east, v @ north)) % 360.0
    return np.where(az >= 360.0, 0.0, az), el


def angular_radius_deg(radius_km: float, vectors_km: Vec) -> Vec:
    return np.degrees(np.arcsin(radius_km / np.linalg.norm(vectors_km, axis=1)))


@dataclass(frozen=True)
class Station:
    lat_deg: float
    lon_deg: float
    alt_m: float
    min_el_deg: float


HOUSTON = Station(lat_deg=29.7604, lon_deg=-95.3698, alt_m=0.0, min_el_deg=0.0)


def station_fixed_km(station: Station) -> tuple[Vec, Vec]:
    """Station position in ITRF93 (the georec formula) and its unit geodetic normal."""
    a, c = EARTH_RADIUS_KM, EARTH_POLAR_RADIUS_KM
    e2 = 1.0 - (c / a) ** 2
    phi, lam = np.radians(station.lat_deg), np.radians(station.lon_deg)
    normal = np.array([np.cos(phi) * np.cos(lam), np.cos(phi) * np.sin(lam), np.sin(phi)])
    prime = a / np.sqrt(1.0 - e2 * np.sin(phi) ** 2)
    h = station.alt_m / 1000.0
    position = np.array(
        [
            (prime + h) * normal[0],
            (prime + h) * normal[1],
            (prime * (1.0 - e2) + h) * normal[2],
        ]
    )
    return position, normal


@dataclass(frozen=True)
class StationSky:
    az_deg: Vec
    el_deg: Vec
    moon_el_deg: Vec


def station_sky(
    sky: SkyState, station: Station, observer: Vec, lat_deg: float, lon_deg: float
) -> StationSky:
    fixed, normal_fixed = station_fixed_km(station)
    position = sky.earth_geo_km + sky.earth_rotation @ fixed
    normal = sky.earth_rotation @ normal_fixed
    line = position - observer
    unit = line / np.linalg.norm(line, axis=1, keepdims=True)
    az, el = az_el(line, lat_deg, lon_deg)
    moon_el = np.degrees(np.arcsin(np.clip(-np.sum(unit * normal, axis=1), -1.0, 1.0)))
    return StationSky(az_deg=az, el_deg=el, moon_el_deg=moon_el)
