import os
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
from fastapi import FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from numpy.typing import NDArray

from api.bundle import Bundle, load_bundle
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
    SummaryResponse,
)
from api.scenario import DEFAULT_STATION, Antenna, Days, Mast, MonthParam, Panel, StationParam, parse_station
from engine import __version__

SHORT_CACHE = "public, max-age=60"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
FAR_ROW = 10
FAR_MAST_M = 2.0
ENGINE_PENDING = "the engine for this endpoint is not built yet; the web app uses sample answers"

T0 = Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d0Z$")]
Weights = Annotated[str, Query(pattern=r"^(0(\.\d)?|1(\.0)?)(,(0(\.\d)?|1(\.0)?)){3}$")]


def create_app(
    sample_dir: Path = Path("contract/samples"),
    catalog_path: Path = Path("catalog/sites.yaml"),
    bundle_dir: Path | None = None,
) -> FastAPI:
    meta = Meta.model_validate_json((sample_dir / "meta.json").read_text())
    catalog = load_catalog(catalog_path)
    if bundle_dir is None and os.environ.get("BUNDLE_DIR"):
        bundle_dir = Path(os.environ["BUNDLE_DIR"])
    bundle: Bundle | None = load_bundle(bundle_dir, catalog) if bundle_dir else None
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
        site_id: str,
        response: Response,
        mast: Mast = 2,
        part: Literal["full", "far"] = "full",
        v: str = "",
    ) -> HorizonResponse:
        if site_id not in catalog:
            raise ApiError(404, "INVALID_PARAM", "unknown site id")
        if bundle is None:
            raise ApiError(503, "FEATURE_DISABLED", "no horizon bundle is configured")
        if v:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        # The bundle holds whole-metre masts; mast_m reports the one served.
        served = min(10, max(1, int(mast + 0.5)))
        row = FAR_ROW if part == "far" else served - 1
        masks = bundle.masks[site_id]
        return HorizonResponse(
            site_id=site_id,
            mast_m=FAR_MAST_M if part == "far" else float(served),
            part=part,
            az_step_deg=0.5,
            elevation_deg=_nullable(masks[0, row], 4),
            distance_km=_nullable(bundle.blocking[site_id][row], 3),
            low_deg=_nullable(masks[1, row], 4),
            high_deg=_nullable(masks[2, row], 4),
            algo_version=bundle.algo_version,
            warnings=bundle.warnings.get(site_id, []),
        )

    @app.get("/api/v1/scenario/series")
    def get_series(
        site: str,
        t0: T0,
        month: MonthParam,
        days: Days = 30,
        panel: Panel = 2,
        antenna: Antenna = 3,
        w: Weights = "1,1,1,0",
        station: StationParam = DEFAULT_STATION,
        v: str = "",
    ) -> SeriesResponse:
        parse_station(station)
        raise ApiError(503, "FEATURE_DISABLED", ENGINE_PENDING)

    @app.get("/api/v1/scenario/summary")
    def get_summary(
        site: str,
        t0: T0,
        days: Days = 30,
        panel: Panel = 2,
        antenna: Antenna = 3,
        w: Weights = "1,1,1,0",
        station: StationParam = DEFAULT_STATION,
        v: str = "",
    ) -> SummaryResponse:
        parse_station(station)
        raise ApiError(503, "FEATURE_DISABLED", ENGINE_PENDING)

    return app


def _nullable(values: NDArray[np.float32], digits: int) -> list[float | None]:
    return [None if np.isnan(v) else round(float(v), digits) for v in values]
