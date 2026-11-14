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
from api.models import Health, HorizonResponse, Meta, Site, SitesResponse
from engine import __version__

SHORT_CACHE = "public, max-age=60"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
FAR_ROW = 10


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

    @app.get("/api/v1/sites/{site_id}/horizon")
    def get_horizon(
        site_id: str,
        response: Response,
        height: Annotated[int, Query(ge=1, le=10)] = 2,
        part: Literal["full", "far"] = "full",
        v: str | None = None,
    ) -> HorizonResponse:
        if site_id not in catalog:
            raise ApiError(404, "INVALID_PARAM", "unknown site id")
        if bundle is None:
            raise ApiError(503, "FEATURE_DISABLED", "no horizon bundle is configured")
        if v is not None:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE
        row = FAR_ROW if part == "far" else height - 1
        masks = bundle.masks[site_id]
        return HorizonResponse(
            site_id=site_id,
            height_m=None if part == "far" else height,
            part=part,
            az_step_deg=0.5,
            elevation_deg=_nullable(masks[0, row], 4),
            low_deg=_nullable(masks[1, row], 4),
            high_deg=_nullable(masks[2, row], 4),
            blocking_distance_km=_nullable(bundle.blocking[site_id][row], 3),
            algo_version=bundle.algo_version,
            warnings=bundle.warnings.get(site_id, []),
        )

    return app


def _nullable(values: NDArray[np.float32], digits: int) -> list[float | None]:
    return [None if np.isnan(v) else round(float(v), digits) for v in values]
