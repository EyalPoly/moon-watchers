import numpy as np

from engine.terrain import MOON_RADIUS_M, project

NEAR_HALF_WIDTH_M: float = 12_000.0


def map_half_width_m(lat_deg: float, ground_m: float) -> float:
    """The map distance holding every point within `ground_m` of the site on the ground.

    The polar map stretches distances away from the pole (by 1.6% at 75°S, 7% at 60°S),
    so the scale at the farthest latitude reached bounds the stretch along the way.
    """
    outer_colatitude = np.radians(90.0 + lat_deg) + ground_m / MOON_RADIUS_M
    return float(ground_m * 2.0 / (1.0 + np.cos(outer_colatitude)))


def window_around(lat_deg: float, lon_deg: float, ground_half_m: float) -> tuple[float, float, float, float]:
    """x_min, y_min, x_max, y_max on the polar map around a point, for a ground reach on each side."""
    x, y = project(lat_deg, lon_deg)
    cx, cy = float(x), float(y)
    half = map_half_width_m(lat_deg, ground_half_m)
    return (cx - half, cy - half, cx + half, cy + half)
