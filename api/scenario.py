import math
import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Query
from pydantic import AfterValidator

from api.errors import ApiError
from api.models import Scenario, StationPoint

HOUSTON = StationPoint(lat_deg=29.7604, lon_deg=-95.3698, alt_m=0, min_el_deg=0)

_RANGES = (("lat", -90, 90), ("lon", -180, 180), ("alt", -500, 9000), ("min_el", 0, 45))


def parse_station(text: str) -> StationPoint:
    parts = text.split(",")
    try:
        values = [float(p) for p in parts]
    except ValueError:
        values = []
    if len(values) != 4 or not all(math.isfinite(v) for v in values):
        raise ApiError(422, "INVALID_PARAM", "station must be lat,lon,alt_m,min_el_deg (four numbers)")
    for (name, low, high), value in zip(_RANGES, values, strict=True):
        if not low <= value <= high:
            raise ApiError(422, "INVALID_PARAM", f"station {name} must be between {low} and {high}")
    return StationPoint(lat_deg=values[0], lon_deg=values[1], alt_m=values[2], min_el_deg=values[3])


def station_text(point: StationPoint) -> str:
    return ",".join(format(v, "g") for v in (point.lat_deg, point.lon_deg, point.alt_m, point.min_el_deg))


def check_height(value: float, name: str) -> float:
    if not 1 <= value <= 10 or abs(value * 100 - round(value * 100)) >= 1e-6:
        raise ApiError(422, "INVALID_PARAM", f"{name} must be 1-10 m in steps of 0.01 m")
    return round(value, 2)


def _height(name: str) -> AfterValidator:
    return AfterValidator(lambda value: check_height(value, name))


Panel = Annotated[float, Query(ge=1, le=10), _height("panel")]
Antenna = Annotated[float, Query(ge=1, le=10), _height("antenna")]
Mast = Annotated[float, Query(ge=1, le=10), _height("mast")]
StationParam = Annotated[str, Query()]
DAYS_RANGE = (1, 365)
PSR_RANGE = (0, 1)
MARGIN_RANGE = (0, 48)
SUN_REQ_RANGE = (0, 72)
Days = Annotated[float, Query(ge=DAYS_RANGE[0], le=DAYS_RANGE[1])]
MonthParam = Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
DEFAULT_STATION = station_text(HOUSTON)

DEFAULT_W = "0.25,0.25,0.15,0.15,0.1,0.1,0"
DEFAULT_SLOPE = "0,15,15"
DEFAULT_COLORS = "70,40"

T0_PATTERN = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d0Z$"
T0Param = Annotated[str, Query(pattern=T0_PATTERN)]
FIRST_T0 = datetime(2026, 1, 1, tzinfo=UTC)
LAST_T0 = datetime(2030, 12, 31, 23, 50, tzinfo=UTC)


def _numbers(text: str, key: str, count: int, shape: str) -> list[float]:
    try:
        values = [float(p) for p in text.split(",")]
    except ValueError:
        values = []
    if len(values) != count or not all(math.isfinite(v) for v in values):
        raise ApiError(422, "INVALID_PARAM", f"{key} must be {shape}")
    return values


def _on_step(value: float, step: float) -> bool:
    return abs(value / step - round(value / step)) < 1e-6


def parse_weights(text: str) -> tuple[float, ...]:
    values = _numbers(text, "w", 7, "seven numbers: L,C,DK,OT,LS,S,D")
    if not all(0 <= v <= 1 and _on_step(v, 0.05) for v in values):
        raise ApiError(422, "INVALID_PARAM", "w values must be 0-1 in steps of 0.05")
    if not any(v > 0 for v in values):
        raise ApiError(422, "INVALID_PARAM", "w needs at least one weight above 0")
    return tuple(round(v, 2) for v in values)


def parse_slope(text: str) -> tuple[float, float, float]:
    good, bad, limit = _numbers(text, "slope", 3, "three numbers: good,bad,max")
    if not all(0 <= v <= 90 and _on_step(v, 0.5) for v in (good, bad, limit)):
        raise ApiError(422, "INVALID_PARAM", "slope values must be 0-90° in steps of 0.5°")
    if good > bad:
        raise ApiError(422, "INVALID_PARAM", "slope good must not exceed bad")
    return good, bad, limit


def parse_colors(text: str) -> tuple[int, int]:
    green, amber = _numbers(text, "colors", 2, "two whole numbers: green,amber")
    if not all(0 <= v <= 100 and v == round(v) for v in (green, amber)):
        raise ApiError(422, "INVALID_PARAM", "colors values must be whole numbers 0-100")
    if amber > green:
        raise ApiError(422, "INVALID_PARAM", "colors amber must not exceed green")
    return round(green), round(amber)


def parse_t0(text: str) -> datetime:
    if not re.fullmatch(T0_PATTERN[1:-1], text):
        raise ApiError(422, "INVALID_PARAM", "t0 must be YYYY-MM-DDTHH:MMZ on the 10-minute grid")
    try:
        moment = datetime.strptime(text, "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC)
    except ValueError as error:
        raise ApiError(422, "INVALID_PARAM", "t0 is not a real date and time") from error
    if not FIRST_T0 <= moment <= LAST_T0:
        raise ApiError(422, "OUT_OF_TIME_RANGE", "t0 must be from 2026-01-01T00:00Z to 2030-12-31T23:50Z")
    return moment


def check_sun_req(value: float) -> float:
    if not _on_step(value, 0.5):
        raise ApiError(422, "INVALID_PARAM", "sun_req must be 0-72 h in steps of 0.5 h")
    return value


def scenario_params(
    site: str,
    t0: T0Param,
    days: Days = 30,
    panel: Panel = 2,
    antenna: Antenna = 3,
    station: StationParam = DEFAULT_STATION,
    w: Annotated[str, Query()] = DEFAULT_W,
    sun_req: Annotated[float, Query(ge=SUN_REQ_RANGE[0], le=SUN_REQ_RANGE[1]), AfterValidator(check_sun_req)] = 6,
    slope: Annotated[str, Query()] = DEFAULT_SLOPE,
    psr: Annotated[int, Query(ge=PSR_RANGE[0], le=PSR_RANGE[1])] = 1,
    margin: Annotated[int, Query(ge=MARGIN_RANGE[0], le=MARGIN_RANGE[1])] = 12,
    colors: Annotated[str, Query()] = DEFAULT_COLORS,
) -> Scenario:
    parse_t0(t0)
    return Scenario.model_validate(
        {
            "site": site,
            "t0": t0,
            "days": days,
            "panel": panel,
            "antenna": antenna,
            "station": parse_station(station),
            "w": parse_weights(w),
            "sun_req": sun_req,
            "slope": parse_slope(slope),
            "psr": bool(psr),
            "margin": margin,
            "colors": parse_colors(colors),
        }
    )


ScenarioParams = Annotated[Scenario, Depends(scenario_params)]
