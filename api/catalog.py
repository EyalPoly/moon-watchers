from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from api.models import Site


class CatalogError(ValueError):
    pass


def load_catalog(path: Path) -> dict[str, Site]:
    raw: Any = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict) or not isinstance(raw.get("sites"), list):
        raise CatalogError(f"{path}: expected a mapping with a 'sites' list")
    sites: dict[str, Site] = {}
    for index, item in enumerate(raw["sites"]):
        label = item.get("id", f"#{index}") if isinstance(item, dict) else f"#{index}"
        try:
            site = Site.model_validate(item)
        except ValidationError as error:
            raise CatalogError(f"{path}: site {label}: {error}") from error
        if site.id in sites:
            raise CatalogError(f"{path}: duplicate site id {site.id}")
        sites[site.id] = site
    return sites
