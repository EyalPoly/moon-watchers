import json
from pathlib import Path
from urllib.parse import urlparse

from build.make_layers import LAYERS_BASE_URL

CONFIG = Path("layers/firebase.json")


def test_layers_hosting_config() -> None:
    hosting = json.loads(CONFIG.read_text())["hosting"]
    assert hosting["site"] == urlparse(LAYERS_BASE_URL).hostname.removesuffix(".web.app")  # type: ignore[union-attr]
    assert hosting["public"] == "dist"
    assert "rewrites" not in hosting
    headers = {h["key"]: h["value"] for rule in hosting["headers"] if rule["source"] == "**" for h in rule["headers"]}
    assert headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert headers["Access-Control-Allow-Origin"] == "*"
