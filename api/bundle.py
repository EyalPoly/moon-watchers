from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, ValidationError

from engine.geometry import Ephemeris
from engine.horizons import HORIZON_ALGO_VERSION

MASKS_SHAPE = (3, 11, 720)
BLOCKING_SHAPE = (11, 720)


class BundleError(RuntimeError):
    pass


class SiteEntry(BaseModel):
    warnings: list[str]


class EphemerisEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    start_utc: str
    step_s: int
    rows: int


class Manifest(BaseModel):
    model_config = ConfigDict(extra="allow")

    bundle_id: str
    algo_version: str
    sites: dict[str, SiteEntry]
    ephemeris: EphemerisEntry | None = None


@dataclass
class Bundle:
    bundle_id: str
    algo_version: str
    masks: dict[str, NDArray[np.float32]]
    blocking: dict[str, NDArray[np.float32]]
    warnings: dict[str, list[str]]
    ephemeris: Ephemeris


def _load_raw(path: Path, shape: tuple[int, ...], dtype: str) -> NDArray[Any]:
    if not path.is_file():
        raise BundleError(f"bundle is missing {path}")
    try:
        array: NDArray[Any] = np.load(path, allow_pickle=False)
    except (OSError, ValueError, EOFError) as error:
        raise BundleError(f"{path} is unreadable: {error}") from error
    if array.shape != shape or array.dtype != np.dtype(dtype):
        raise BundleError(f"{path} has shape {array.shape} {array.dtype}, expected {shape} {dtype}")
    return array


def _load_array(path: Path, shape: tuple[int, ...]) -> NDArray[np.float32]:
    return _load_raw(path, shape, "float32")


def _load_table(path: Path, shape: tuple[int, ...]) -> NDArray[np.float64]:
    return _load_raw(path, shape, "float64")


def load_bundle(bundle_dir: Path, site_ids: Iterable[str]) -> Bundle:
    manifest_path = bundle_dir / "manifest.json"
    try:
        manifest = Manifest.model_validate_json(manifest_path.read_text())
    except (OSError, UnicodeDecodeError, ValidationError) as error:
        raise BundleError(f"{manifest_path} is missing or invalid: {error}") from error
    if manifest.algo_version != HORIZON_ALGO_VERSION:
        raise BundleError(
            f"bundle {manifest.bundle_id} has algo_version {manifest.algo_version!r}, "
            f"this engine is {HORIZON_ALGO_VERSION!r}: rebuild the bundle"
        )
    if manifest.ephemeris is None:
        raise BundleError(
            f"bundle {manifest.bundle_id} has no ephemeris entry in {manifest_path}: rebuild the bundle"
        )
    absent = [site_id for site_id in site_ids if site_id not in manifest.sites]
    if absent:
        raise BundleError(f"{manifest_path} has no entry for site(s) {', '.join(absent)}")
    masks: dict[str, NDArray[np.float32]] = {}
    blocking: dict[str, NDArray[np.float32]] = {}
    for site_id in site_ids:
        folder = bundle_dir / "server" / "sites" / site_id
        masks[site_id] = _load_array(folder / "masks.npy", MASKS_SHAPE)
        blocking[site_id] = _load_array(folder / "blocking.npy", BLOCKING_SHAPE)
    warnings = {site_id: manifest.sites[site_id].warnings for site_id in masks}
    rows = manifest.ephemeris.rows
    server = bundle_dir / "server"
    try:
        start = datetime.fromisoformat(manifest.ephemeris.start_utc).astimezone(UTC)
    except ValueError as error:
        raise BundleError(f"{manifest_path} has a bad ephemeris start_utc: {error}") from error
    vectors = _load_table(server / "ephemeris.npy", (rows, 9))
    rotation = _load_table(server / "earth_rotation.npy", (rows, 3, 3))
    ephemeris = Ephemeris(start, manifest.ephemeris.step_s, vectors, rotation)
    return Bundle(manifest.bundle_id, manifest.algo_version, masks, blocking, warnings, ephemeris)
