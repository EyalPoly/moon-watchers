from typing import Literal

from pydantic import BaseModel, Field, model_validator

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


class StationPoint(BaseModel):
    lat_deg: float = Field(ge=-90, le=90)
    lon_deg: float = Field(ge=-180, le=180)
    alt_m: float = Field(ge=-500, le=9000)
    min_el_deg: float = Field(ge=0, le=45)


class EarthStation(StationPoint):
    """A ground station the lander can talk to directly (spec §7.3, P3)."""

    id: str = Field(pattern=r"^[a-z0-9_]{1,32}$")
    name: str


class Meta(BaseModel):
    version: str
    bundle_id: str
    mode: Literal["event", "judging"]
    regions: list[Region]
    capabilities: Capabilities
    limits: Limits
    stations: list[EarthStation]
    default_station: str

    @model_validator(mode="after")
    def _default_station_is_a_preset(self) -> "Meta":
        if self.default_station not in {s.id for s in self.stations}:
            raise ValueError("default_station must name an entry of stations")
        return self


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

RagColor = Literal["green", "amber", "red"]


class Scenario(BaseModel):
    site: str
    t0: str
    days: float = Field(ge=1, le=365)
    panel: float = Field(ge=1, le=10)
    antenna: float = Field(ge=1, le=10)
    w: tuple[float, float, float, float]
    station: StationPoint


# --- Horizon (spec §8.2, §9.3 sky view) -----------------------------------------------


class HorizonResponse(BaseModel):
    site_id: str
    mast_m: float
    part: Literal["full", "far"]
    az_step_deg: float
    # null: the terrain along that direction is unknown (missing data or truncated)
    elevation_deg: list[float | None] = Field(min_length=720, max_length=720)
    distance_km: list[float | None] = Field(min_length=720, max_length=720)
    low_deg: list[float | None] | None = Field(default=None, min_length=720, max_length=720)
    high_deg: list[float | None] | None = Field(default=None, min_length=720, max_length=720)
    algo_version: str | None = None
    warnings: list[str] | None = None


# --- Series (spec §8.3) ---------------------------------------------------------------


# 1: yes, 0: no, null: the terrain along the needed direction is unknown
Visibility = Literal[0, 1] | None


class SeriesResponse(BaseModel):
    start: str
    step_s: int
    n: int
    sun_az: list[float]
    sun_el: list[float]
    sun_vis_el: list[float]
    sun_horizon_el: list[float | None]
    sun_lit_frac: list[float | None]
    earth_az: list[float]
    earth_el: list[float]
    earth_vis_el: list[float]
    earth_horizon_el: list[float | None]
    earth_any: list[Visibility]
    earth_whole: list[Visibility]
    contact: list[Visibility]
    station_az: list[float]
    station_el: list[float]
    station_horizon_el: list[float | None]
    earth_station_up: list[bool]
    station_moon_el: list[float]
    power_w: list[float] | None = None
    soc_pct: list[float] | None = None

    @model_validator(mode="after")
    def _lists_have_n_entries(self) -> "SeriesResponse":
        for name, value in self:
            if isinstance(value, list) and len(value) != self.n:
                raise ValueError(f"{name} has {len(value)} entries, expected n={self.n}")
        return self


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
