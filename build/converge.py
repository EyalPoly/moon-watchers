import argparse
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from api.catalog import load_catalog
from build.make_masks import LAYERS, load_windows
from engine.horizons import march, ray_distances
from engine.terrain import Dem

HEIGHT_M = 2.0

CHECKS: dict[str, dict[str, float]] = {
    "near step 40 m vs 20 m": {"near_step_m": 20.0},
    "near window 10 km vs 20 km": {"near_m": 20_000.0},
    "reach 300 km vs 400 km": {"reach_m": 400_000.0},
}


def max_mask_change(a: NDArray[np.float32], b: NDArray[np.float32]) -> float:
    both = np.isfinite(a) & np.isfinite(b)
    if not both.any():
        return 0.0
    return float(np.abs(a[both] - b[both]).max())


def _skyline(
    lat: float, lon: float, terrain: Sequence[Dem], errors: Sequence[Dem], **schedule: float
) -> NDArray[np.float32]:
    return march(lat, lon, [HEIGHT_M], terrain, errors, ray_distances(**schedule)).elevation_deg


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="build.converge")
    parser.add_argument("--sites", required=True, help="comma-separated catalog site ids")
    parser.add_argument("--catalog", type=Path, default=Path("catalog/sites.yaml"))
    parser.add_argument("--sources", type=Path, default=Path("data/sources"))
    args = parser.parse_args(argv)

    catalog = load_catalog(args.catalog)
    present = [layer for layer in LAYERS if (args.sources / layer.dem).is_file()]
    for site_id in args.sites.split(","):
        site = catalog[site_id]
        terrain, errors = load_windows(site, args.sources, present)
        base = _skyline(site.lat_deg, site.lon_deg, terrain, errors)
        for label, schedule in CHECKS.items():
            other = _skyline(site.lat_deg, site.lon_deg, terrain, errors, **schedule)
            print(f"{site_id}: {label}: max change {max_mask_change(base, other):.4f}°")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
