import dataclasses
import os
import threading
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from numpy.typing import NDArray

from api.bundle import Bundle, load_bundle
from api.catalog import load_catalog
from api.custom_points import COARSE_TERRAIN, ClientMiddleware, CustomPoints
from api.errors import ApiError, install_error_handlers
from api.models import (
    CustomPointRequest,
    HorizonResponse,
    Health,
    Meta,
    SeriesResponse,
    Scenario,
    Site,
    SitesResponse,
    StationPoint,
    SummaryResponse,
)
from api.series_json import series_response, site_series
from api.summary_json import build_summary, data_codes, mission_series, span_text, summary_version
from api.point_ids import format_point_id, parse_point_id
from api.score_config import load_configs
from api.scenario import Mast, MonthParam, ScenarioParams, parse_t0
from engine import __version__
from engine.geometry import OutOfRange, sun_declination_range_deg
from engine.horizons import mask_at_height
from engine.metrics import MissionMetrics, MissionWindow, compute_metrics, mission_window

SHORT_CACHE = "public, max-age=60"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
FAR_ROW = 10
FAR_MAST_M = 2.0
# One year-long series needs tens of MiB of temporaries per piece; the browser sends every month
# and every card at once, so the heavy work is queued rather than run all together.
MAX_HEAVY_REQUESTS = 2
NO_TERRAIN = "custom points need terrain data, and none is configured on this server"


def create_app(
    sample_dir: Path = Path("contract/samples"),
    catalog_path: Path = Path("catalog/sites.yaml"),
    bundle_dir: Path | None = None,
    config_dir: Path = Path("config"),
    terrain_dir: Path | None = None,
) -> FastAPI:
    configs = load_configs(config_dir)
    meta = Meta.model_validate_json((sample_dir / "meta.json").read_text()).model_copy(
        update={"score": configs.score, "rag": configs.rag, "warning_catalog": list(configs.warnings.values())}
    )
    catalog = load_catalog(catalog_path)
    if bundle_dir is None and os.environ.get("BUNDLE_DIR"):
        bundle_dir = Path(os.environ["BUNDLE_DIR"])
    bundle: Bundle | None = load_bundle(bundle_dir, catalog) if bundle_dir else None
    if bundle is not None:
        meta = meta.model_copy(update={"sun_declination_deg": list(sun_declination_range_deg(bundle.ephemeris))})
    heavy = threading.BoundedSemaphore(MAX_HEAVY_REQUESTS)
    if terrain_dir is None and os.environ.get("TERRAIN_DIR"):
        terrain_dir = Path(os.environ["TERRAIN_DIR"])
    area = meta.regions[0].custom_area
    customs = (
        CustomPoints(terrain_dir, heavy, (area.min_lat_deg, area.max_lat_deg))
        if terrain_dir is not None and terrain_dir.is_dir()
        else None
    )
    if customs is not None:
        meta = meta.model_copy(update={"capabilities": meta.capabilities.model_copy(update={"custom_points": True})})

    def lookup_site(site_id: str) -> Site:
        site = catalog.get(site_id)
        if site is not None:
            return site
        if parse_point_id(site_id) is None:
            raise ApiError(404, "INVALID_PARAM", "unknown site id")
        if customs is None:
            raise ApiError(503, "FEATURE_DISABLED", NO_TERRAIN)
        return customs.get(site_id)[0]

    def resolve(site_id: str) -> tuple[Site, Bundle]:
        """The site and a bundle view holding its masks. Call it outside `heavy`: a new custom
        point takes a heavy slot while it computes."""
        site = catalog.get(site_id)
        if site is None and parse_point_id(site_id) is None:
            raise ApiError(404, "INVALID_PARAM", "unknown site id")
        if bundle is None:
            raise ApiError(503, "FEATURE_DISABLED", "no horizon bundle is configured")
        if site is not None:
            return site, bundle
        if customs is None:
            raise ApiError(503, "FEATURE_DISABLED", NO_TERRAIN)
        custom_site, point = customs.get(site_id)
        view = dataclasses.replace(
            bundle,
            masks={custom_site.id: point.masks},
            blocking={custom_site.id: point.blocking},
            warnings={custom_site.id: [*point.warnings, COARSE_TERRAIN]},
        )
        return custom_site, view

    app = FastAPI(title="CLPS Lunar Mission Browser API", version=__version__, redirect_slashes=False)
    install_error_handlers(app)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"])
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(ClientMiddleware)

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
        return lookup_site(site_id)

    @app.post("/api/v1/sites/custom")
    def create_custom_site(point: CustomPointRequest) -> Site:
        """Creates (or finds again) the site for a point; the id encodes the point, so the call is idempotent."""
        area = meta.regions[0].custom_area
        if not area.min_lat_deg <= point.lat_deg <= area.max_lat_deg:
            raise ApiError(
                422,
                "OUT_OF_COVERAGE",
                f"custom points must lie between {area.min_lat_deg}° and {area.max_lat_deg}° latitude",
            )
        if customs is None:
            raise ApiError(503, "FEATURE_DISABLED", NO_TERRAIN)
        return customs.get(format_point_id(point.lat_deg, point.lon_deg))[0]

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
        site, view = resolve(site_id)
        if v:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        site_id = site.id
        masks = view.masks[site_id]
        if part == "far":
            row = FAR_ROW
            shown = masks[:, row]
        else:
            # Blocking distances don't blend: they come from the nearer whole-metre row.
            row = min(10, max(1, int(mast + 0.5))) - 1
            shown = mask_at_height(masks, mast)
        return HorizonResponse(
            site_id=site_id,
            mast_m=FAR_MAST_M if part == "far" else mast,
            part=part,
            az_step_deg=0.5,
            elevation_deg=_nullable(shown[0], 4),
            distance_km=_nullable(view.blocking[site_id][row], 3),
            low_deg=_nullable(shown[1], 4),
            high_deg=_nullable(shown[2], 4),
            algo_version=view.algo_version,
            warnings=view.warnings.get(site_id, []),
        )

    @app.get("/api/v1/scenario/series")
    def get_series(
        response: Response,
        scenario: ScenarioParams,
        month: MonthParam,
        v: str = "",
    ) -> SeriesResponse:
        entry, view = resolve(scenario.site)
        try:
            with heavy:
                arrays, start, n = site_series(
                    view, entry, month, scenario.panel, scenario.antenna, scenario.station
                )
        except (OutOfRange, ValueError, OverflowError) as error:
            raise ApiError(422, "OUT_OF_TIME_RANGE", f"no ephemeris for month {month}") from error
        if v:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        return series_response(arrays, start, n)

    @lru_cache(maxsize=128)
    def _metrics(
        site_id: str,
        t0: str,
        days: float,
        margin: int,
        panel: float,
        antenna: float,
        station: tuple[float, float, float, float],
    ) -> tuple[MissionWindow, MissionMetrics]:
        # Only these fields shape the series; the scoring settings are not part of the cache key.
        keyed = Scenario.model_construct(
            site=site_id, t0=t0, days=days, margin=margin, panel=panel, antenna=antenna,
            station=StationPoint(lat_deg=station[0], lon_deg=station[1], alt_m=station[2], min_el_deg=station[3]),
        )
        site, view = resolve(site_id)
        with heavy:
            arrays, window = mission_series(view, site, keyed)
            return window, compute_metrics(arrays, window.landing)

    @app.get("/api/v1/scenario/summary")
    def get_summary(response: Response, scenario: ScenarioParams, v: str = "") -> SummaryResponse:
        entry, view = resolve(scenario.site)
        st = scenario.station
        try:
            window, metrics = _metrics(
                scenario.site, scenario.t0, scenario.days, scenario.margin, scenario.panel,
                scenario.antenna, (st.lat_deg, st.lon_deg, st.alt_m, st.min_el_deg),
            )
        except (OutOfRange, ValueError, OverflowError) as error:
            first = mission_window(parse_t0(scenario.t0), scenario.days, scenario.margin).start
            eph = view.ephemeris
            raise ApiError(
                422,
                "OUT_OF_TIME_RANGE",
                f"the window starts at {first:%Y-%m-%dT%H:%MZ}; "
                f"the ephemeris covers {span_text(eph.start, eph.vectors_km.shape[0], eph.step_s)}",
            ) from error
        if v:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        return build_summary(
            entry, scenario, window, metrics, data_codes(view, entry.id, window), configs, summary_version(view)
        )

    return app


def _nullable(values: NDArray[np.float32], digits: int) -> list[float | None]:
    return [None if np.isnan(v) else round(float(v), digits) for v in values]
