from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from engine.terrain import MOON_RADIUS_M, Dem, project, sample_stack

HORIZON_ALGO_VERSION: str = "1"
TERRAIN_CEILING_M: float = 20_000.0

_AZ_CHUNK = 120


def ray_distances(
    near_step_m: float = 40.0,
    near_m: float = 10_000.0,
    far_step_m: float = 240.0,
    reach_m: float = 300_000.0,
) -> NDArray[np.float64]:
    return np.concatenate(
        (
            np.arange(near_step_m / 2, near_m, near_step_m),
            np.arange(near_m, reach_m, far_step_m),
            [reach_m],
        )
    )


@dataclass(frozen=True)
class March:
    elevation_deg: NDArray[np.float32]
    low_deg: NDArray[np.float32]
    high_deg: NDArray[np.float32]
    blocking_km: NDArray[np.float32]
    warnings: list[str]


def _site_basis(
    lat_deg: float, lon_deg: float
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    # North at the pole is defined as the direction of longitude 0.
    lon = 0.0 if lat_deg <= -90.0 else lon_deg
    phi, lam = np.radians(lat_deg), np.radians(lon)
    up = np.array([np.cos(phi) * np.cos(lam), np.cos(phi) * np.sin(lam), np.sin(phi)])
    east = np.array([-np.sin(lam), np.cos(lam), 0.0])
    north = np.array([-np.sin(phi) * np.cos(lam), -np.sin(phi) * np.sin(lam), np.cos(phi)])
    return up, east, north


def _elevation_deg(
    delta_h: NDArray[np.float32], target_radius: NDArray[np.float32], theta: NDArray[np.float32]
) -> NDArray[np.float32]:
    half = np.sin(theta / 2)
    drop = target_radius * 2 * half * half
    angle: NDArray[np.float32] = np.degrees(
        np.arctan2(delta_h - drop, target_radius * np.sin(theta))
    ).astype(np.float32)
    return angle


def _peak(
    target_radius: NDArray[np.float32], observer_m: float, theta: NDArray[np.float32]
) -> NDArray[np.float32]:
    delta_h = (target_radius.astype(np.float64) - MOON_RADIUS_M - observer_m).astype(np.float32)
    return _elevation_deg(delta_h, target_radius, theta).max(axis=1)


def march(
    lat_deg: float,
    lon_deg: float,
    heights_m: Sequence[float],
    terrain: Sequence[Dem],
    errors: Sequence[Dem],
    distances_m: NDArray[np.float64],
    n_az: int = 720,
) -> March:
    site_x, site_y = project(lat_deg, lon_deg)
    site_xy = (np.atleast_1d(site_x), np.atleast_1d(site_y))
    ground = float(sample_stack(terrain, *site_xy)[0])
    if not np.isfinite(ground):
        raise ValueError("no terrain elevation at the site")
    site_error = float(sample_stack(errors, *site_xy)[0])

    up, east, north = _site_basis(lat_deg, lon_deg)
    theta64 = distances_m / MOON_RADIUS_M
    theta = theta64.astype(np.float32)[None, :]
    n_h = len(heights_m)
    observer = ground + np.asarray(heights_m, dtype=np.float64)
    floor = -np.degrees(np.arccos((MOON_RADIUS_M + ground) / (MOON_RADIUS_M + observer)))

    nominal = np.empty((n_h, n_az), np.float32)
    low = np.empty((n_h, n_az), np.float32)
    high = np.empty((n_h, n_az), np.float32)
    blocking = np.empty((n_h, n_az), np.float32)
    unknown = np.zeros(n_az, bool)
    error_missing = np.zeros(n_az, bool)

    for start in range(0, n_az, _AZ_CHUNK):
        stop = min(start + _AZ_CHUNK, n_az)
        sel = slice(start, stop)
        az = np.radians(np.arange(start, stop) * (360.0 / n_az))
        direction = np.cos(az)[:, None] * north + np.sin(az)[:, None] * east
        q = (
            np.cos(theta64)[None, :, None] * up
            + np.sin(theta64)[None, :, None] * direction[:, None, :]
        )
        # Projecting the unit vector directly: arcsin(z) loses metres next to the pole.
        scale = 2.0 * MOON_RADIUS_M / (1.0 - q[..., 2])
        x = q[..., 1] * scale
        y = q[..., 0] * scale
        h_t = sample_stack(terrain, x, y)
        err = sample_stack(errors, x, y)

        unknown[sel] = np.isnan(h_t).any(axis=1)
        error_missing[sel] = np.isnan(err).any(axis=1) | np.isnan(site_error)
        if np.nanmax(h_t, initial=-np.inf) > TERRAIN_CEILING_M:
            raise ValueError("terrain exceeds the conservative elevation ceiling")

        radius_t = (MOON_RADIUS_M + h_t.astype(np.float64)).astype(np.float32)
        radius_low = (MOON_RADIUS_M + h_t.astype(np.float64) - err).astype(np.float32)
        radius_high = (MOON_RADIUS_M + h_t.astype(np.float64) + err).astype(np.float32)
        for i in range(n_h):
            delta_h = (h_t.astype(np.float64) - observer[i]).astype(np.float32)
            el = _elevation_deg(delta_h, radius_t, theta)
            el = np.where(np.isnan(el), -np.inf, el)
            nominal[i, sel] = np.maximum(el.max(axis=1), floor[i])
            blocking[i, sel] = distances_m[el.argmax(axis=1)] / 1000.0
            low[i, sel] = np.maximum(_peak(radius_low, observer[i] + site_error, theta), floor[i])
            high[i, sel] = np.maximum(_peak(radius_high, observer[i] - site_error, theta), floor[i])

    warnings: list[str] = []
    if unknown.any():
        warnings.append("DEM_GAPS")

    far = float(theta64[-1])
    ceiling_radius = MOON_RADIUS_M + TERRAIN_CEILING_M
    unseen = np.degrees(
        np.arctan2(
            ceiling_radius * np.cos(far) - (MOON_RADIUS_M + observer),
            ceiling_radius * np.sin(far),
        )
    )
    truncated = (unseen[:, None] > nominal) & ~unknown[None, :]
    if truncated.any():
        warnings.append("HORIZON_TRUNCATED")

    bad = unknown[None, :] | truncated
    nominal[bad] = np.nan
    blocking[bad] = np.nan
    bounds_bad = bad | error_missing[None, :]
    low[bounds_bad] = np.nan
    high[bounds_bad] = np.nan
    if (error_missing[None, :] & ~bad).any():
        warnings.append("UNCERTAINTY_UNAVAILABLE")

    return March(nominal, low, high, blocking, warnings)
