from typing import Literal

from pydantic import BaseModel

ErrorCode = Literal[
    "OUT_OF_COVERAGE",
    "OUT_OF_TIME_RANGE",
    "INVALID_PARAM",
    "TERRAIN_READ_FAILED",
    "RATE_LIMITED",
    "FEATURE_DISABLED",
    "NL_UNAVAILABLE",
    "NL_NOT_UNDERSTOOD",
]


class Health(BaseModel):
    status: Literal["ok"]
    version: str


class Layer(BaseModel):
    id: str
    title: str
    kind: Literal["wmts", "local"]
    url_template: str | None
    attribution: str
    legend_url: str | None


class TileGrid(BaseModel):
    origin: tuple[float, float]
    resolutions_m: list[float]
    tile_size_px: int


class CustomArea(BaseModel):
    min_lat_deg: float
    max_lat_deg: float


class Region(BaseModel):
    id: str
    crs: str
    proj4: str
    extent_m: tuple[float, float, float, float]
    tile_grid: TileGrid
    layers: list[Layer]
    custom_area: CustomArea


class Capabilities(BaseModel):
    custom_points: bool
    custom_grids: bool
    insights: bool
    calendar: bool
    search: bool
    alternatives: bool
    stations: bool
    dust: bool
    globe: bool
    power: bool
    nl: bool


class Limits(BaseModel):
    max_cards: int
    max_days: int
    max_search_window_d: int


class Meta(BaseModel):
    version: str
    bundle_id: str
    mode: Literal["event", "judging"]
    regions: list[Region]
    capabilities: Capabilities
    limits: Limits


class Problem(BaseModel):
    type: str
    title: str
    status: int
    code: ErrorCode
    detail: str | None = None
