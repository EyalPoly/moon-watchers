import argparse
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from api.catalog import load_catalog
from build.make_masks import LAYERS, Layer, load_windows
from engine.horizons import march, ray_distances
from engine.terrain import Dem

HEIGHT_M = 2.0

NEAR_WINDOW_M = 22_000.0
REACH_WINDOW_M = 410_000.0


def converge_layers() -> list[Layer]:
    """Windows wide enough for the widest schedule compared, so no direction is lost to clipping."""
    return [
        Layer(layer.dem, REACH_WINDOW_M if "240MPP" in layer.dem else NEAR_WINDOW_M)
        for layer in LAYERS
    ]


CHECKS: dict[str, dict[str, float]] = {
    "near step 40 m vs 20 m": {"near_step_m": 20.0},
    "near window 10 km vs 20 km": {"near_m": 20_000.0},
    "reach 200 km vs 300 km": {"reach_m": 300_000.0},
}


def max_mask_change(a: NDArray[np.float32], b: NDArray[np.float32]) -> float:
    both = np.isfinite(a) & np.isfinite(b)
    if not both.any():
        raise ValueError("no direction is finite in both skylines")
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
    present = [layer for layer in converge_layers() if (args.sources / layer.dem).is_file()]
    for site_id in args.sites.split(","):
        site = catalog[site_id]
        terrain, errors = load_windows(site, args.sources, present)
        base = _skyline(site.lat_deg, site.lon_deg, terrain, errors)
        for label, schedule in CHECKS.items():
            other = _skyline(site.lat_deg, site.lon_deg, terrain, errors, **schedule)
            compared = int((np.isfinite(base) & np.isfinite(other)).sum())
            note = "" if compared == base.size else f" (only {compared}/{base.size} directions compared)"
            print(f"{site_id}: {label}: max change {max_mask_change(base, other):.4f}°{note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
