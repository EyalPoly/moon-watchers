from pathlib import Path

from typing import Annotated, Literal

from fastapi import FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from api.catalog import load_catalog
from api.errors import ApiError, install_error_handlers
from api.models import (
    CustomPointRequest,
    HorizonResponse,
    Health,
    Meta,
    SeriesResponse,
    Site,
    SitesResponse,
    Station,
    SummaryResponse,
)
from engine import __version__

SHORT_CACHE = "public, max-age=60"
ENGINE_PENDING = "the engine for this endpoint is not built yet; the web app uses sample answers"

T0 = Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d0Z$")]
Days = Annotated[float, Query(ge=1, le=365)]
Mast = Annotated[float, Query(ge=1, le=10)]
Weights = Annotated[str, Query(pattern=r"^(0(\.\d)?|1(\.0)?)(,(0(\.\d)?|1(\.0)?)){3}$")]
Month = Annotated[str, Query(pattern=r"^\d{4}-\d{2}$")]
StationLat = Annotated[float | None, Query(ge=-90, le=90)]
StationLon = Annotated[float | None, Query(ge=-180, le=180)]


def check_station(station: Station, lat: float | None, lon: float | None) -> None:
    """A custom station needs both coordinates; a named one takes none."""
    if (station == "custom") != (lat is not None and lon is not None) or (lat is None) != (lon is None):
        raise ApiError(422, "INVALID_PARAM", "station=custom needs station_lat and station_lon, and only then")


def create_app(
    sample_dir: Path = Path("contract/samples"),
    catalog_path: Path = Path("catalog/sites.yaml"),
) -> FastAPI:
    meta = Meta.model_validate_json((sample_dir / "meta.json").read_text())
    catalog = load_catalog(catalog_path)
    app = FastAPI(title="CLPS Lunar Mission Browser API", version=__version__, redirect_slashes=False)
    install_error_handlers(app)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])

    @app.get("/api/v1/health")
    def health(response: Response) -> Health:
        response.headers["Cache-Control"] = SHORT_CACHE
        return Health(status="ok", version=__version__)

    @app.get("/api/v1/meta")
    def get_meta(response: Response) -> Meta:
        response.headers["Cache-Control"] = SHORT_CACHE
        return meta

    @app.get("/api/v1/sites")
    def list_sites() -> SitesResponse:
        return SitesResponse(sites=list(catalog.values()))

    @app.get("/api/v1/sites/{site_id}")
    def get_site(site_id: str) -> Site:
        site = catalog.get(site_id)
        if site is None:
            raise ApiError(404, "INVALID_PARAM", "unknown site id")
        return site

    @app.post("/api/v1/sites/custom")
    def create_custom_site(point: CustomPointRequest) -> Site:
        """Contract only (slice S7): the engine builds the point's terrain and returns it as
        a site whose id encodes the point, so the call is idempotent (spec §8.2).

        Open decision for when the engine lands: CORS allows GET only, so a web app on
        another origin cannot call this yet (tests/test_api_basic.py guards that)."""
        area = meta.regions[0].custom_area
        if not area.min_lat_deg <= point.lat_deg <= area.max_lat_deg:
            raise ApiError(
                422,
                "OUT_OF_COVERAGE",
                f"custom points must lie between {area.min_lat_deg}° and {area.max_lat_deg}° latitude",
            )
        raise ApiError(503, "FEATURE_DISABLED", ENGINE_PENDING)

    # Contract only (slices S2-S4): shapes are fixed here so the web app can build against
    # sample answers. Each route answers FEATURE_DISABLED until its engine function lands.

    @app.get("/api/v1/sites/{site_id}/horizon")
    def get_horizon(
        site_id: str, mast: Mast = 2, part: Literal["full", "far"] = "full"
    ) -> HorizonResponse:
        if site_id not in catalog:
            raise ApiError(404, "INVALID_PARAM", "unknown site id")
        raise ApiError(503, "FEATURE_DISABLED", ENGINE_PENDING)

    @app.get("/api/v1/scenario/series")
    def get_series(
        site: str,
        t0: T0,
        month: Month,
        days: Days = 29.53,
        mast: Mast = 2,
        w: Weights = "1,1,1,0",
        station: Station = "any",
        station_lat: StationLat = None,
        station_lon: StationLon = None,
        v: str = "",
    ) -> SeriesResponse:
        check_station(station, station_lat, station_lon)
        raise ApiError(503, "FEATURE_DISABLED", ENGINE_PENDING)

    @app.get("/api/v1/scenario/summary")
    def get_summary(
        site: str,
        t0: T0,
        days: Days = 29.53,
        mast: Mast = 2,
        w: Weights = "1,1,1,0",
        station: Station = "any",
        station_lat: StationLat = None,
        station_lon: StationLon = None,
        v: str = "",
    ) -> SummaryResponse:
        check_station(station, station_lat, station_lon)
        raise ApiError(503, "FEATURE_DISABLED", ENGINE_PENDING)

    return app
