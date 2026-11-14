from datetime import datetime

import numpy as np
from numpy.typing import NDArray

from api.models import SeriesResponse
from engine.series import SeriesArrays


def _floats(values: NDArray[np.float64], digits: int) -> list[float | None]:
    rounded = np.round(values, digits)
    out: list[float | None] = rounded.tolist()
    for i in np.flatnonzero(np.isnan(rounded)):
        out[i] = None
    return out


def _fractions(values: NDArray[np.float64]) -> list[float | None]:
    # The web app reads "> 0" as "visible": a sliver of Sun never rounds to nothing.
    rounded = np.round(values, 4)
    return _floats(np.where((values > 0) & (rounded == 0), 0.0001, rounded), 4)


def _states(values: NDArray[np.float32]) -> list[int | None]:
    return [None if np.isnan(v) else int(v) for v in values]


def series_response(s: SeriesArrays, start: datetime, n: int) -> SeriesResponse:
    return SeriesResponse(
        start=start.strftime("%Y-%m-%dT%H:%MZ"),
        step_s=600,
        n=n,
        sun_az=_floats(s.sun_az, 3),  # type: ignore[arg-type]
        sun_el=_floats(s.sun_el, 3),  # type: ignore[arg-type]
        sun_vis_el=_floats(s.sun_vis_el, 3),  # type: ignore[arg-type]
        sun_horizon_el=_floats(s.sun_horizon_el, 3),
        sun_lit_frac=_fractions(s.sun_lit_frac),
        earth_az=_floats(s.earth_az, 3),  # type: ignore[arg-type]
        earth_el=_floats(s.earth_el, 3),  # type: ignore[arg-type]
        earth_vis_el=_floats(s.earth_vis_el, 3),  # type: ignore[arg-type]
        earth_horizon_el=_floats(s.earth_horizon_el, 3),
        earth_any=_states(s.earth_any),  # type: ignore[arg-type]
        earth_whole=_states(s.earth_whole),  # type: ignore[arg-type]
        contact=_states(s.contact),  # type: ignore[arg-type]
        station_az=_floats(s.station_az, 3),  # type: ignore[arg-type]
        station_el=_floats(s.station_el, 3),  # type: ignore[arg-type]
        station_horizon_el=_floats(s.station_horizon_el, 3),
        earth_station_up=s.earth_station_up.tolist(),
        station_moon_el=_floats(s.station_moon_el, 3),  # type: ignore[arg-type]
    )
