from datetime import datetime

import numpy as np
from numpy.typing import NDArray

from api.bundle import Bundle
from api.models import Site, SeriesResponse, StationPoint
from engine.geometry import Station
from engine.horizons import mask_at_height
from engine.series import SeriesArrays, compute_series, month_times


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


def site_series(
    bundle: Bundle, site: Site, month: str, panel: float, antenna: float, station: StationPoint
) -> tuple[SeriesArrays, datetime, int]:
    """The month's series for a catalog site; raises OutOfRange (or ValueError) outside the table."""
    start, n = month_times(month)
    masks = bundle.masks[site.id]
    arrays = compute_series(
        bundle.ephemeris,
        site.lat_deg,
        site.lon_deg,
        site.elevation_m,
        mask_at_height(masks, panel)[0].astype(np.float64),
        mask_at_height(masks, antenna)[0].astype(np.float64),
        panel,
        antenna,
        Station(station.lat_deg, station.lon_deg, station.alt_m, station.min_el_deg),
        start,
        n,
    )
    return arrays, start, n
