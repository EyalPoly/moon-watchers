from pathlib import Path

from fastapi import FastAPI, Response

from api.errors import install_error_handlers
from api.models import Health, Meta
from engine import __version__

SHORT_CACHE = "public, max-age=60"


def create_app(sample_dir: Path = Path("contract/samples")) -> FastAPI:
    meta = Meta.model_validate_json((sample_dir / "meta.json").read_text())
    app = FastAPI(title="CLPS Lunar Mission Browser API", version=__version__)
    install_error_handlers(app)

    @app.get("/api/v1/health")
    def health(response: Response) -> Health:
        response.headers["Cache-Control"] = SHORT_CACHE
        return Health(status="ok", version=__version__)

    @app.get("/api/v1/meta")
    def get_meta(response: Response) -> Meta:
        response.headers["Cache-Control"] = SHORT_CACHE
        return meta

    return app
