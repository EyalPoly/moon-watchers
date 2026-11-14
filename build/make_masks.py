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
from build.make_ephemeris import KERNELS, build_ephemeris
from engine.horizons import (
    FAR_ONLY_HEIGHT_M,
    FAR_ONLY_START_M,
    HEIGHTS_M,
    HORIZON_ALGO_VERSION,
    compute_site_masks,
    ray_distances,
)
from engine.geometry import MOON_FRAME, Ephemeris
from engine.terrain import Dem, load_dem, project

FRAME_NOTE = (
    "Engine frame MOON_ME_DE440_ME421; LOLA DEMs are MOON_ME_DE421, "
    "aligned to well under a meter."
)


@dataclass(frozen=True)
class Layer:
    dem: str
    half_width_m: float


# Finest first; the half-widths cover the 10 km near zone and the 300 km reach.
LAYERS = (
    Layer("lola/LDEM_80S_20MPP_ADJ.TIF", 12_000.0),
    Layer("lola/LDEM_80S_80MPP_ADJ.TIF", 12_000.0),
    Layer("lola/LDEM_60S_240MPP_ADJ.TIF", 302_000.0),
)


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


def _write_tables(server: Path, eph: Ephemeris) -> dict[str, object]:
    server.mkdir(parents=True, exist_ok=True)
    np.save(server / "ephemeris.npy", eph.vectors_km)
    np.save(server / "earth_rotation.npy", eph.earth_rotation)
    return {
        "start_utc": eph.start.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step_s": eph.step_s,
        "rows": int(eph.vectors_km.shape[0]),
        "frame": MOON_FRAME,
        "corrections": {"sun": "CN+S", "earth_occultor": "CN+S", "earth_contact": "NONE"},
        "kernels": {},
        "sha256": {
            "ephemeris.npy": hashlib.sha256(eph.vectors_km.tobytes()).hexdigest(),
            "earth_rotation.npy": hashlib.sha256(eph.earth_rotation.tobytes()).hexdigest(),
        },
    }


def _seal(staging: Path, out_dir: Path, manifest: dict[str, object]) -> Path:
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


def build_bundle(
    catalog: dict[str, Site],
    sources: Path,
    out_dir: Path,
    ephemeris: Ephemeris,
    kernel_hashes: dict[str, str] | None = None,
) -> Path:
    present = [layer for layer in LAYERS if (sources / layer.dem).is_file()]
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
            terrain, errors = load_windows(site, sources, present)
            try:
                masks = compute_site_masks(site.lat_deg, site.lon_deg, terrain, errors)
            except ValueError as error:
                raise ValueError(f"site {site.id}: {error}") from error
            folder = staging / "server" / "sites" / site.id
            folder.mkdir(parents=True)
            np.save(folder / "masks.npy", masks.masks_deg)
            np.save(folder / "blocking.npy", masks.blocking_km)
            site_warnings[site.id] = masks.warnings

        entry = _write_tables(staging / "server", ephemeris)
        entry["kernels"] = kernel_hashes or {}
        manifest: dict[str, object] = {
            "algo_version": HORIZON_ALGO_VERSION,
            "frame_note": FRAME_NOTE,
            "sources": used,
            "parameters": {
                "heights_m": list(HEIGHTS_M),
                "far_only_start_m": FAR_ONLY_START_M,
                "far_only_height_m": FAR_ONLY_HEIGHT_M,
                "ray_distances_sha256": hashlib.sha256(ray_distances().tobytes()).hexdigest(),
                "sites": {s.id: [s.lat_deg, s.lon_deg] for s in catalog.values()},
            },
            "sites": {site_id: {"warnings": w} for site_id, w in site_warnings.items()},
            "ephemeris": entry,
        }
        return _seal(staging, out_dir, manifest)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def add_ephemeris(
    bundle_dir: Path,
    out_dir: Path,
    ephemeris: Ephemeris,
    kernel_hashes: dict[str, str] | None = None,
) -> Path:
    """Turns a bundle without an ephemeris into a new one, keeping its masks as they are."""
    manifest: dict[str, object] = json.loads((bundle_dir / "manifest.json").read_text())
    if manifest.get("algo_version") != HORIZON_ALGO_VERSION:
        raise ValueError(
            f"bundle has algo_version {manifest.get('algo_version')!r}, "
            f"this engine is {HORIZON_ALGO_VERSION!r}: rebuild the masks"
        )
    if "ephemeris" in manifest:
        raise ValueError(f"bundle {bundle_dir.name} already has an ephemeris")
    manifest.pop("bundle_id", None)
    manifest.pop("created", None)
    out_dir.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".building-", dir=out_dir))
    try:
        shutil.copytree(bundle_dir / "server" / "sites", staging / "server" / "sites")
        entry = _write_tables(staging / "server", ephemeris)
        entry["kernels"] = kernel_hashes or {}
        manifest["ephemeris"] = entry
        return _seal(staging, out_dir, manifest)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def spice_hashes(spice_dir: Path) -> dict[str, str]:
    return {name: sha256_of(spice_dir / name) for name in KERNELS}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="build.make_masks")
    parser.add_argument("--ephemeris-only", action="store_true", help="add the ephemeris to the newest bundle")
    args = parser.parse_args(argv)
    spice_dir = Path("data/sources/spice")
    try:
        spice_hash = spice_hashes(spice_dir)
    except FileNotFoundError as error:
        raise SystemExit(f"SPICE kernels are missing from {spice_dir} ({error.filename}): run make fetch") from error
    ephemeris = build_ephemeris(spice_dir)
    if args.ephemeris_only:
        candidates = sorted(p for p in Path("bundle").glob("*") if (p / "manifest.json").is_file())
        if not candidates:
            raise SystemExit("no bundle under bundle/: run make masks first")
        print(add_ephemeris(candidates[-1], Path("bundle"), ephemeris, spice_hash))
        return
    catalog = load_catalog(Path("catalog/sites.yaml"))
    print(build_bundle(catalog, Path("data/sources"), Path("bundle"), ephemeris, spice_hash))


if __name__ == "__main__":
    main()
