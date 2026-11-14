from datetime import datetime

import numpy as np

from engine.geometry import Ephemeris

EARTH_DISTANCE_KM = 384_400.0
SUN_DISTANCE_KM = 149.6e6
SUN_PERIOD_S = 29.53 * 86400
SIDEREAL_DAY_S = 86164.0905
HOUSTON_LON_DEG = -95.3698


def synthetic_ephemeris(start: datetime, days: int, step_s: int = 3600) -> Ephemeris:
    """A table with simple, known motion: the Sun circles the equator plane, the Earth stands
    still at +x, and the Earth turns once per sidereal day with Houston under the Moon at `start`."""
    rows = days * 86400 // step_s + 1
    t = np.arange(rows) * float(step_s)
    sun_angle = 2 * np.pi * t / SUN_PERIOD_S
    vectors = np.zeros((rows, 9))
    vectors[:, 0] = SUN_DISTANCE_KM * np.cos(sun_angle)
    vectors[:, 1] = SUN_DISTANCE_KM * np.sin(sun_angle)
    vectors[:, 3] = EARTH_DISTANCE_KM
    vectors[:, 6] = EARTH_DISTANCE_KM
    # The Moon lies in the -x direction from the Earth, so Houston's meridian must point at 180°.
    theta = np.radians(180.0 - HOUSTON_LON_DEG) + 2 * np.pi * t / SIDEREAL_DAY_S
    rotation = np.zeros((rows, 3, 3))
    rotation[:, 0, 0] = np.cos(theta)
    rotation[:, 0, 1] = -np.sin(theta)
    rotation[:, 1, 0] = np.sin(theta)
    rotation[:, 1, 1] = np.cos(theta)
    rotation[:, 2, 2] = 1.0
    return Ephemeris(start=start, step_s=step_s, vectors_km=vectors, earth_rotation=rotation)
