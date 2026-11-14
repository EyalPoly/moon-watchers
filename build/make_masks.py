import argparse
import hashlib
import json
import shutil
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from api.catalog import load_catalog
from api.models import Site
from build.fetch_sources import sha256_of
from engine.horizons import (
    FAR_ONLY_HEIGHT_M,
    FAR_ONLY_START_M,
    HEIGHTS_M,
    HORIZON_ALGO_VERSION,
    compute_site_masks,
    ray_distances,
)
from engine.terrain import Dem, load_dem, project

FRAME_NOTE = (
    "Engine frame MOON_ME_DE440_ME421; LOLA DEMs are MOON_ME_DE421, "
    "aligned to well under a meter."
)


@dataclass(frozen=True)
class Layer:
    dem: str
    half_width_m: float


@dataclass(frozen=True)
class Terrain:
    layers: tuple[Layer, ...]
    required: tuple[Layer, ...] = ()


# The half-widths cover the 10 km near zone and the 300 km reach.
DEM_20 = Layer("lola/LDEM_80S_20MPP_ADJ.TIF", 12_000.0)
DEM_40 = Layer("lola/LDEM_80S_40MPP_ADJ.TIF", 12_000.0)
DEM_80 = Layer("lola/LDEM_80S_80MPP_ADJ.TIF", 12_000.0)
DEM_240 = Layer("lola/LDEM_60S_240MPP_ADJ.TIF", 302_000.0)

# Each set is named by its finest terrain, finest first. "20m" is the one the API serves and
# stays buildable without the 20 m file; "40m" and "80m" exist to compare resolutions, so
# their finest file must be present.
TERRAINS: dict[str, Terrain] = {
    "20m": Terrain((DEM_20, DEM_80, DEM_240)),
    "40m": Terrain((DEM_40, DEM_80, DEM_240), required=(DEM_40,)),
    "80m": Terrain((DEM_80, DEM_240), required=(DEM_80,)),
}
DEFAULT_TERRAIN = "20m"
LAYERS = TERRAINS[DEFAULT_TERRAIN].layers


def error_path(dem: str) -> str:
    return dem.replace(".TIF", "_ERR.TIF")


def load_windows(
    site: Site, sources: Path, layers: list[Layer]
) -> tuple[list[Dem], list[Dem]]:
    x, y = project(site.lat_deg, site.lon_deg)
    cx, cy = float(x), float(y)
    terrain: list[Dem] = []
    errors: list[Dem] = []
    for layer in layers:
        window = (
            cx - layer.half_width_m,
            cy - layer.half_width_m,
            cx + layer.half_width_m,
            cy + layer.half_width_m,
        )
        try:
            terrain.append(load_dem(sources / layer.dem, layer.dem, window))
            if (sources / error_path(layer.dem)).is_file():
                errors.append(load_dem(sources / error_path(layer.dem), error_path(layer.dem), window))
        except ValueError as error:
            if "outside" not in str(error):
                raise
    return terrain, errors


def build_bundle(
    catalog: dict[str, Site], sources: Path, out_dir: Path, terrain: str = DEFAULT_TERRAIN
) -> Path:
    if terrain not in TERRAINS:
        raise ValueError(f"unknown terrain {terrain!r}; choose from {', '.join(TERRAINS)}")
    chosen = TERRAINS[terrain]
    missing = [layer.dem for layer in chosen.required if not (sources / layer.dem).is_file()]
    if missing:
        raise FileNotFoundError(f"terrain {terrain} is missing {', '.join(missing)} under {sources}")
    present = [layer for layer in chosen.layers if (sources / layer.dem).is_file()]
    if not present:
        raise FileNotFoundError(f"no LOLA DEM found under {sources}")
    used = {layer.dem: sha256_of(sources / layer.dem) for layer in present}
    for layer in present:
        if (sources / error_path(layer.dem)).is_file():
            used[error_path(layer.dem)] = sha256_of(sources / error_path(layer.dem))

    out_dir.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".building-", dir=out_dir))
    try:
        site_warnings: dict[str, list[str]] = {}
        for site in catalog.values():
            dems, errors = load_windows(site, sources, present)
            try:
                masks = compute_site_masks(site.lat_deg, site.lon_deg, dems, errors)
            except ValueError as error:
                raise ValueError(f"site {site.id}: {error}") from error
            folder = staging / "server" / "sites" / site.id
            folder.mkdir(parents=True)
            np.save(folder / "masks.npy", masks.masks_deg)
            np.save(folder / "blocking.npy", masks.blocking_km)
            site_warnings[site.id] = masks.warnings

        manifest: dict[str, object] = {
            "algo_version": HORIZON_ALGO_VERSION,
            "frame_note": FRAME_NOTE,
            "sources": used,
            "parameters": {
                "terrain": terrain,
                "heights_m": list(HEIGHTS_M),
                "far_only_start_m": FAR_ONLY_START_M,
                "far_only_height_m": FAR_ONLY_HEIGHT_M,
                "ray_distances_sha256": hashlib.sha256(ray_distances().tobytes()).hexdigest(),
                "sites": {s.id: [s.lat_deg, s.lon_deg] for s in catalog.values()},
            },
            "sites": {site_id: {"warnings": w} for site_id, w in site_warnings.items()},
        }
        digest = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()[:8]
        now = datetime.now(UTC)
        bundle_id = f"{now:%Y%m%d}-{digest}"
        manifest = {"bundle_id": bundle_id, "created": now.isoformat(timespec="seconds"), **manifest}
        (staging / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

        target = out_dir / bundle_id
        if target.exists():
            shutil.rmtree(staging)
        else:
            staging.rename(target)
        return target
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="build.make_masks")
    parser.add_argument(
        "--terrain",
        default=DEFAULT_TERRAIN,
        help=f"finest terrain: {', '.join(TERRAINS)}, or 'all' (default {DEFAULT_TERRAIN})",
    )
    args = parser.parse_args(argv)
    names = list(TERRAINS) if args.terrain == "all" else args.terrain.split(",")
    catalog = load_catalog(Path("catalog/sites.yaml"))
    for name in names:
        path = build_bundle(catalog, Path("data/sources"), Path("bundle"), terrain=name)
        print(f"{name}: {path}", flush=True)


if __name__ == "__main__":
    main()
