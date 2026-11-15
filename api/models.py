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


class Overlay(BaseModel):
    id: str
    title: str
    kind: Literal["geojson"]
    url: str
    attribution: str


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
    overlays: list[Overlay] = Field(default_factory=list)
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


Severity = Literal["info", "caution", "blocking"]
Affects = Literal["score", "sun", "contact", "skyline", "slope", "all"]
GradeId = Literal["L", "C", "DK", "OT", "LS", "S", "D"]


class Grade(BaseModel):
    id: GradeId
    name: str
    label: str
    raw_label: str
    raw_unit: str


class SettingSpec(BaseModel):
    key: str
    label: str
    unit: str
    default: list[float]
    min: float
    max: float
    step: float = Field(gt=0)


class WeightPreset(BaseModel):
    id: str
    name: str
    weights: list[float] = Field(min_length=7, max_length=7)


class ScoreConfig(BaseModel):
    status: Literal["illustrative"]
    formula: str
    grades: list[Grade]
    settings: list[SettingSpec]
    presets: list[WeightPreset]


class PctThresholds(BaseModel):
    green_from: float
    amber_from: float


class SlopeThresholds(BaseModel):
    green_max: float
    amber_max: float


class RagThresholds(BaseModel):
    pct: PctThresholds
    slope_deg: SlopeThresholds


class WarningEntry(BaseModel):
    code: str
    severity: Severity
    affects: Affects
    text: str
    standing: bool


class Meta(BaseModel):
    version: str
    bundle_id: str
    mode: Literal["event", "judging"]
    regions: list[Region]
    capabilities: Capabilities
    limits: Limits
    stations: list[EarthStation]
    default_station: str
    score: ScoreConfig
    rag: RagThresholds
    warning_catalog: list[WarningEntry]

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
    lon_deg: float = Field(ge=0, lt=360)
    elevation_m: float
    slope_deg: float
    slope_resolution_m: float
    source_url: str
    is_placeholder: bool
    in_psr: bool | None = None


class CustomPointRequest(BaseModel):
    """A point the user typed or picked, inside the region's custom-point area (spec §6.6)."""

    lat_deg: float = Field(ge=-90, le=90)
    lon_deg: float = Field(ge=0, le=360)


class SitesResponse(BaseModel):
    sites: list[Site]


class Problem(BaseModel):
    type: str
    title: str
    status: int
    code: ErrorCode
    detail: str | None = None


# --- Scenario (spec §8.1) -------------------------------------------------------------

class Scenario(BaseModel):
    site: str
    t0: str
    days: float = Field(ge=1, le=365)
    panel: float = Field(ge=1, le=10)
    antenna: float = Field(ge=1, le=10)
    station: StationPoint
    w: tuple[float, float, float, float, float, float, float]
    sun_req: float = Field(ge=0, le=72)
    slope: tuple[float, float, float]
    psr: bool
    margin: int = Field(ge=0, le=48)
    colors: tuple[int, int]


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


class Warning(BaseModel):
    code: str
    text: str
    severity: Severity
    affects: Affects


class Metrics(BaseModel):
    sun_pct: float | None
    dte_pct: float | None
    both_pct: float | None
    sun_disk_mean: float | None
    contact_mean: float | None
    earth_any_pct: float | None
    earth_whole_pct: float | None
    longest_dark_h: float
    longest_no_contact_h: float
    longest_dark_at_edge: bool
    longest_no_contact_at_edge: bool
    first_sun_h: float | None
    first_dark_after_landing_h: float | None
    window: tuple[str, str]
    earth_el_range: tuple[float, float]
    unknown_h: float


ChipColor = Literal["green", "amber", "red", "unknown"]


class RagChip(BaseModel):
    color: ChipColor
    reason: str


class Rag(BaseModel):
    sun: RagChip
    dte: RagChip
    slope: RagChip


class ScoreFactor(BaseModel):
    name: GradeId
    weight: float
    weight_share: float
    raw: float | None
    grade: float
    points_lost: float


class ScoreWeights(BaseModel):
    L: float
    C: float
    DK: float
    OT: float
    LS: float
    S: float
    D: float


class ScoreSettings(BaseModel):
    sun_req_h: float
    slope_deg: tuple[float, float, float]
    reject_psr: bool
    margin_h: int
    colors: tuple[int, int]
    custom: bool


class Score(BaseModel):
    value: float = Field(ge=0, le=100)
    category: Literal["green", "amber", "red", "excluded"]
    status: Literal["illustrative"]
    weights: ScoreWeights
    factors: list[ScoreFactor] = Field(min_length=7, max_length=7)
    deciding: list[GradeId]
    excluded_reason: Literal["psr", "slope"] | None
    settings: ScoreSettings
    warnings: list[Warning]
    explanation: str
    formula: str


class Windows(BaseModel):
    sun: list[tuple[str, str]]
    dte: list[tuple[str, str]]
    both: list[tuple[str, str]]
    unknown: list[tuple[str, str]]


class Daily(BaseModel):
    sun_pct: list[float | None]
    dte_pct: list[float | None]
    sun_disk_mean: list[float | None]


class SummaryResponse(BaseModel):
    scenario: Scenario
    version: str
    metrics: Metrics
    rag: Rag
    score: Score
    windows: Windows
    daily: Daily
    warnings: list[Warning]
