import math
from typing import Annotated

from fastapi import Query
from pydantic import AfterValidator

from api.errors import ApiError
from api.models import StationPoint

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
Days = Annotated[float, Query(ge=1, le=365)]
MonthParam = Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
DEFAULT_STATION = station_text(HOUSTON)
