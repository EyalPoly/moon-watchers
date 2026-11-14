import numpy as np
from numpy.typing import NDArray

F64 = NDArray[np.float64]
F32 = NDArray[np.float32]

AZ_STEP_DEG = 0.5
THRESHOLD = 1e-10


def skyline_at(horizon_el: F64, az_deg: F64) -> F64:
    """Periodic linear interpolation of the 720-value skyline; NaN if either neighbour is NaN."""
    n = horizon_el.shape[0]
    position = np.mod(np.asarray(az_deg, dtype=np.float64), 360.0) / AZ_STEP_DEG
    low = np.floor(position).astype(np.int64)
    weight = position - low
    first = horizon_el[low % n]
    second = horizon_el[(low + 1) % n]
    # A weight of exactly 0 must not read the neighbour: a NaN there is unrelated to this direction.
    blended: F64 = np.where(weight == 0.0, first, first * (1.0 - weight) + second * weight)
    return blended


def disk_fraction(
    horizon_el: F64,
    az_deg: F64,
    el_deg: F64,
    radius_deg: F64,
    strips: int = 128,
    occultor: tuple[F64, F64, F64] | None = None,
) -> F64:
    """Share of a small disk above the skyline, as vertical strips in the small-angle sky plane.
    NaN when the skyline is unknown under any strip."""
    x = np.linspace(-1 + 1 / strips, 1 - 1 / strips, strips)
    half_height = np.sqrt(1 - x * x)[None, :]
    radius = np.asarray(radius_deg, dtype=np.float64)[:, None]
    target_az = np.asarray(az_deg, dtype=np.float64)[:, None]
    target_el = np.asarray(el_deg, dtype=np.float64)[:, None]
    cosine = np.maximum(np.cos(np.radians(target_el)), 1e-6)
    strip_az = target_az + x[None, :] * radius / cosine
    skyline = skyline_at(horizon_el, strip_az)
    unknown = np.isnan(skyline).any(axis=1)
    cutoff = (np.nan_to_num(skyline) - target_el) / radius
    bottom = np.maximum(-half_height, cutoff)
    height = np.clip(half_height - bottom, 0, 2 * half_height)
    if occultor is not None:
        other_az, other_el, other_radius = occultor
        dx = ((np.asarray(other_az)[:, None] - target_az + 180) % 360 - 180) * cosine / radius
        dy = (np.asarray(other_el)[:, None] - target_el) / radius
        rr = np.asarray(other_radius)[:, None] / radius
        inside = rr**2 - (x[None, :] - dx) ** 2
        span = np.sqrt(np.maximum(inside, 0))
        overlap = np.maximum(0, np.minimum(half_height, dy + span) - np.maximum(bottom, dy - span))
        height = height - np.where(inside > 0, overlap, 0)
    fraction: F64 = np.clip(np.sum(height, axis=1) / np.sum(2 * half_height), 0, 1)
    return np.where(unknown, np.nan, fraction)


def sun_fraction(
    horizon_el: F64,
    sun_az: F64,
    sun_el: F64,
    sun_radius: F64,
    earth_az: F64,
    earth_el: F64,
    earth_radius: F64,
) -> F64:
    return disk_fraction(
        horizon_el, sun_az, sun_el, sun_radius, occultor=(earth_az, earth_el, earth_radius)
    )


def visible_state(fraction: F64, whole: bool = False) -> F32:
    """1 / 0 / NaN (unknown)."""
    yes = fraction >= 1 - THRESHOLD if whole else fraction > THRESHOLD
    out: F32 = np.where(np.isnan(fraction), np.nan, np.where(yes, 1.0, 0.0)).astype(np.float32)
    return out


def contact_state(
    horizon_el: F64, station_az: F64, station_el: F64, station_moon_el: F64, min_el_deg: float
) -> F32:
    """Contact needs the station direction above the antenna skyline and the station seeing the
    Moon at or above its mask. A known "no" settles it even where the skyline is unknown."""
    skyline = skyline_at(horizon_el, station_az)
    clear = np.where(np.isnan(skyline), np.nan, np.where(station_el > skyline, 1.0, 0.0))
    out = np.where(station_moon_el < min_el_deg, 0.0, clear)
    return out.astype(np.float32)
