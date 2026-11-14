from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from engine.geometry import MOON_FRAME, Ephemeris, SkyState

KERNELS: tuple[str, ...] = (
    "naif0012.tls",
    "pck00011.tpc",
    "de440s.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
    "earth_1962_260806_2126_combined.bpc",
)

# A day of margin at each end lets the 4-point interpolation reach every 10-minute step of
# the months 2026-01 to 2031-12.
TABLE_START = datetime(2025, 12, 31, tzinfo=UTC)
TABLE_END = datetime(2032, 1, 2, tzinfo=UTC)
TABLE_STEP_S = 3600


def direct_sky(spice_dir: Path, times: Sequence[datetime]) -> SkyState:
    import spiceypy as spice

    missing = [name for name in KERNELS if not (spice_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(f"missing SPICE kernels in {spice_dir}: {', '.join(missing)}")
    sun = np.zeros((len(times), 3))
    earth_cns = np.zeros((len(times), 3))
    earth_geo = np.zeros((len(times), 3))
    rotation = np.zeros((len(times), 3, 3))
    spice.kclear()
    try:
        for name in KERNELS:
            spice.furnsh(str(spice_dir / name))
        for i, moment in enumerate(times):
            et = spice.str2et(moment.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S.%f UTC"))
            sun[i] = spice.spkezr("SUN", et, MOON_FRAME, "CN+S", "MOON")[0][:3]
            earth_cns[i] = spice.spkezr("EARTH", et, MOON_FRAME, "CN+S", "MOON")[0][:3]
            earth_geo[i] = spice.spkezr("EARTH", et, MOON_FRAME, "NONE", "MOON")[0][:3]
            rotation[i] = spice.pxform("ITRF93", MOON_FRAME, et)
    finally:
        spice.kclear()
    return SkyState(sun, earth_cns, earth_geo, rotation)


def build_ephemeris(
    spice_dir: Path,
    start: datetime = TABLE_START,
    end: datetime = TABLE_END,
    step_s: int = TABLE_STEP_S,
) -> Ephemeris:
    rows = int((end - start).total_seconds() // step_s) + 1
    times = [start + timedelta(seconds=step_s * i) for i in range(rows)]
    sky = direct_sky(spice_dir, times)
    vectors = np.concatenate([sky.sun_cns_km, sky.earth_cns_km, sky.earth_geo_km], axis=1)
    return Ephemeris(start=start, step_s=step_s, vectors_km=vectors, earth_rotation=sky.earth_rotation)
