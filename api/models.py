from typing import Literal

from pydantic import BaseModel, Field

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


class EarthStation(BaseModel):
    """A ground station the lander can talk to directly (spec §7.3, P3)."""

    id: str = Field(pattern=r"^[a-z0-9_]{1,32}$")
    name: str
    lat_deg: float = Field(ge=-90, le=90)
    lon_deg: float = Field(ge=-180, le=180)


class Meta(BaseModel):
    version: str
    bundle_id: str
    mode: Literal["event", "judging"]
    regions: list[Region]
    capabilities: Capabilities
    limits: Limits
    stations: list[EarthStation]


class Site(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]{1,64}$")
    name: str
    source: Literal["catalog", "custom"]
    category: str
    region: str
    lat_deg: float = Field(ge=-90, le=-84)
    lon_deg: float = Field(ge=-180, lt=180)
    elevation_m: float
    slope_deg: float
    slope_baseline_m: float
    source_url: str
    is_placeholder: bool


class CustomPointRequest(BaseModel):
    """A point the user typed or picked, inside the region's custom-point area (spec §6.6)."""

    lat_deg: float = Field(ge=-90, le=90)
    lon_deg: float = Field(ge=-180, le=180)


class SitesResponse(BaseModel):
    sites: list[Site]


class Problem(BaseModel):
    type: str
    title: str
    status: int
    code: ErrorCode
    detail: str | None = None


# --- Scenario (spec §8.1) -------------------------------------------------------------

# "any": contact while at least one DSN complex sees the Moon. "custom": a station at
# station_lat_deg / station_lon_deg, which the scenario then carries.
Station = Literal["any", "goldstone", "madrid", "canberra", "custom"]
RagColor = Literal["green", "amber", "red"]


class Scenario(BaseModel):
    site: str
    t0: str
    days: float = Field(ge=1, le=365)
    mast: float = Field(ge=1, le=10)
    w: tuple[float, float, float, float]
    station: Station
    station_lat_deg: float | None = Field(default=None, ge=-90, le=90)
    station_lon_deg: float | None = Field(default=None, ge=-180, le=180)


# --- Horizon (spec §8.2, §9.3 sky view) -----------------------------------------------


class HorizonResponse(BaseModel):
    site_id: str
    mast_m: float
    part: Literal["full", "far"]
    az_step_deg: float
    elevation_deg: list[float] = Field(min_length=720, max_length=720)
    distance_km: list[float] = Field(min_length=720, max_length=720)


# --- Series (spec §8.3) ---------------------------------------------------------------


class SeriesResponse(BaseModel):
    start: str
    step_s: int
    n: int
    sun_az: list[float]
    sun_el: list[float]
    sun_vis_el: list[float]
    sun_horizon_el: list[float]
    sun_lit_frac: list[float]
    earth_az: list[float]
    earth_el: list[float]
    earth_vis_el: list[float]
    earth_horizon_el: list[float]
    earth_visible: list[bool]
    earth_station_up: list[bool]
    power_w: list[float] | None = None
    soc_pct: list[float] | None = None


# --- Summary (spec §7.4, §7.5, §8.3) --------------------------------------------------


class Metrics(BaseModel):
    sun_pct: float
    dte_pct: float
    both_pct: float
    longest_dark_h: float
    longest_no_contact_h: float
    first_dark_after_landing_h: float
    earth_el_range: tuple[float, float]


class RagChip(BaseModel):
    color: RagColor
    reason: str


class Rag(BaseModel):
    sun: RagChip
    dte: RagChip
    slope: RagChip


class ScoreWeights(BaseModel):
    sun: float
    dte: float
    slope: float
    dust: float


class ScoreFactor(BaseModel):
    name: str
    weight: float
    points: float
    reason: str


class Score(BaseModel):
    value: float = Field(ge=0, le=100)
    base: float
    weights: ScoreWeights
    factors: list[ScoreFactor]
    deciding: str
    formula: str
    color: RagColor


class Windows(BaseModel):
    sun: list[tuple[str, str]]
    dte: list[tuple[str, str]]
    both: list[tuple[str, str]]


class Daily(BaseModel):
    sun_pct: list[float]
    dte_pct: list[float]


class Warning(BaseModel):
    code: str
    text: str


class SummaryResponse(BaseModel):
    scenario: Scenario
    version: str
    metrics: Metrics
    rag: Rag
    score: Score
    windows: Windows
    daily: Daily
    warnings: list[Warning] = []
