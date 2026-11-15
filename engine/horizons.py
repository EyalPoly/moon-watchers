from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from engine.geometry import site_basis
from engine.terrain import MOON_RADIUS_M, Dem, project, sample_stack

HORIZON_ALGO_VERSION: str = "2"
MAX_REACH_M: float = 200_000.0
REACH_MARGIN_M: float = 10_000.0

_AZ_CHUNK = 120


def ray_distances(
    near_step_m: float = 40.0,
    near_m: float = 10_000.0,
    far_step_m: float = 240.0,
    reach_m: float = MAX_REACH_M,
) -> NDArray[np.float64]:
    return np.concatenate(
        (
            np.arange(near_step_m / 2, min(near_m, reach_m), near_step_m),
            np.arange(near_m, reach_m, far_step_m),
            [reach_m],
        )
    )


def reach_for_ground(ground_m: float) -> float:
    """How far to trace from a point: its geometric horizon to a feature at the reference sphere
    (a peak of height h hides behind the curve beyond sqrt(2*R*h)), plus a margin, capped."""
    return min(MAX_REACH_M, float(np.sqrt(2.0 * MOON_RADIUS_M * abs(ground_m))) + REACH_MARGIN_M)


@dataclass(frozen=True)
class March:
    elevation_deg: NDArray[np.float32]
    low_deg: NDArray[np.float32]
    high_deg: NDArray[np.float32]
    blocking_km: NDArray[np.float32]
    warnings: list[str]


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
    height_m: NDArray[np.float32],
    shift_m: NDArray[np.float32],
    observer_m: float,
    theta: NDArray[np.float32],
) -> NDArray[np.float32]:
    # Heights, not radii: R + h in float32 is only good to 0.125 m, which
    # near the observer is a visible fraction of a degree.
    target = height_m.astype(np.float64) + shift_m
    delta_h = (target - observer_m).astype(np.float32)
    radius = (MOON_RADIUS_M + target).astype(np.float32)
    return _elevation_deg(delta_h, radius, theta).max(axis=1)


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

    up, east, north = site_basis(lat_deg, lon_deg)
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

        radius_t = (MOON_RADIUS_M + h_t.astype(np.float64)).astype(np.float32)
        for i in range(n_h):
            delta_h = (h_t.astype(np.float64) - observer[i]).astype(np.float32)
            el = _elevation_deg(delta_h, radius_t, theta)
            el = np.where(np.isnan(el), -np.inf, el)
            nominal[i, sel] = np.maximum(el.max(axis=1), floor[i])
            blocking[i, sel] = distances_m[el.argmax(axis=1)] / 1000.0
            low[i, sel] = np.maximum(_peak(h_t, -err, observer[i] + site_error, theta), floor[i])
            high[i, sel] = np.maximum(_peak(h_t, err, observer[i] - site_error, theta), floor[i])

    warnings: list[str] = []
    if unknown.any():
        warnings.append("DEM_GAPS")

    bad = np.broadcast_to(unknown[None, :], nominal.shape)
    nominal[bad] = np.nan
    blocking[bad] = np.nan
    bounds_bad = bad | error_missing[None, :]
    low[bounds_bad] = np.nan
    high[bounds_bad] = np.nan
    if (error_missing[None, :] & ~bad).any():
        warnings.append("UNCERTAINTY_UNAVAILABLE")

    return March(nominal, low, high, blocking, warnings)


HEIGHTS_M: tuple[float, ...] = tuple(float(h) for h in range(1, 11))
FAR_ONLY_START_M: float = 3_000.0
FAR_ONLY_HEIGHT_M: float = 2.0


@dataclass(frozen=True)
class SiteMasks:
    masks_deg: NDArray[np.float32]
    blocking_km: NDArray[np.float32]
    warnings: list[str]


def compute_site_masks(
    lat_deg: float, lon_deg: float, terrain: Sequence[Dem], errors: Sequence[Dem]
) -> SiteMasks:
    site_x, site_y = project(lat_deg, lon_deg)
    ground = float(sample_stack(terrain, np.atleast_1d(site_x), np.atleast_1d(site_y))[0])
    if not np.isfinite(ground):
        raise ValueError("no terrain elevation at the site")
    distances = ray_distances(reach_m=reach_for_ground(ground))
    full = march(lat_deg, lon_deg, HEIGHTS_M, terrain, errors, distances)
    far = march(
        lat_deg,
        lon_deg,
        [FAR_ONLY_HEIGHT_M],
        terrain,
        errors,
        distances[distances >= FAR_ONLY_START_M],
    )
    masks = np.concatenate(
        [
            np.stack([full.elevation_deg, full.low_deg, full.high_deg]),
            np.stack([far.elevation_deg, far.low_deg, far.high_deg]),
        ],
        axis=1,
    )
    blocking = np.concatenate([full.blocking_km, far.blocking_km], axis=0)
    warnings = list(dict.fromkeys([*full.warnings, *far.warnings]))
    return SiteMasks(masks, blocking, warnings)


def mask_at_height(masks_deg: NDArray[np.float32], height_m: float) -> NDArray[np.float32]:
    """Nominal, low and high skylines at any height from 1 to 10 m, blended linearly between the
    two whole-metre rows. The terrain angles are almost linear in height, and the skyline is their
    maximum, so the blend sits at or just above the true value. The far-only row is never read."""
    if height_m >= HEIGHTS_M_COUNT:
        # Weight 1 on the top row must not read the row below: 0 * NaN is NaN.
        return masks_deg[:, HEIGHTS_M_COUNT - 1].copy()
    below = int(np.floor(height_m))
    weight = np.float32(height_m - below)
    first = masks_deg[:, below - 1]
    if weight == 0:
        return first.copy()
    blended: NDArray[np.float32] = (1 - weight) * first + weight * masks_deg[:, below]
    return blended.astype(np.float32)


HEIGHTS_M_COUNT = len(HEIGHTS_M)
