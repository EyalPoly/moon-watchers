from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from api.catalog import load_catalog
from api.errors import ApiError, install_error_handlers
from api.models import Health, Meta, Site, SitesResponse
from engine import __version__

SHORT_CACHE = "public, max-age=60"


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

    return app
