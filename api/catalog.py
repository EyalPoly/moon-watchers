import argparse
import sys
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


def catalog_problems(sites: dict[str, Site], *, final: bool) -> list[str]:
    if not final:
        return []
    problems: list[str] = []
    for site in sites.values():
        if site.is_placeholder:
            problems.append(f"site {site.id} is a placeholder (is_placeholder: true)")
        if not site.source_url.startswith(("http://", "https://")):
            problems.append(f"site {site.id} has a source_url that is not a web link: {site.source_url!r}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="api.catalog", description="Check a site catalog file.")
    parser.add_argument("--final", action="store_true", help="also refuse placeholders and non-URL sources")
    parser.add_argument("path", nargs="?", type=Path, default=Path("catalog/sites.yaml"))
    args = parser.parse_args(argv)
    try:
        sites = load_catalog(args.path)
    except (CatalogError, OSError, yaml.YAMLError) as error:
        print(error)
        return 1
    problems = catalog_problems(sites, final=args.final)
    for problem in problems:
        print(problem)
    if problems:
        return 1
    print(f"{len(sites)} sites OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
