from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, ValidationError

from engine.horizons import HORIZON_ALGO_VERSION

MASKS_SHAPE = (3, 11, 720)
BLOCKING_SHAPE = (11, 720)


class BundleError(RuntimeError):
    pass


class Manifest(BaseModel):
    model_config = ConfigDict(extra="allow")

    bundle_id: str
    algo_version: str


@dataclass
class Bundle:
    bundle_id: str
    algo_version: str
    masks: dict[str, NDArray[np.float32]]
    blocking: dict[str, NDArray[np.float32]]
    warnings: dict[str, list[str]]


def _load_array(path: Path, shape: tuple[int, ...]) -> NDArray[np.float32]:
    if not path.is_file():
        raise BundleError(f"bundle is missing {path}")
    try:
        array: NDArray[np.float32] = np.load(path, allow_pickle=False)
    except (OSError, ValueError) as error:
        raise BundleError(f"{path} is unreadable: {error}") from error
    if array.shape != shape or array.dtype != np.float32:
        raise BundleError(f"{path} has shape {array.shape} {array.dtype}, expected {shape} float32")
    return array


def load_bundle(bundle_dir: Path, site_ids: Iterable[str]) -> Bundle:
    manifest_path = bundle_dir / "manifest.json"
    try:
        manifest = Manifest.model_validate_json(manifest_path.read_text())
    except (OSError, ValidationError) as error:
        raise BundleError(f"{manifest_path} is missing or invalid: {error}") from error
    if manifest.algo_version != HORIZON_ALGO_VERSION:
        raise BundleError(
            f"bundle {manifest.bundle_id} has algo_version {manifest.algo_version!r}, "
            f"this engine is {HORIZON_ALGO_VERSION!r}: rebuild the bundle"
        )
    masks: dict[str, NDArray[np.float32]] = {}
    blocking: dict[str, NDArray[np.float32]] = {}
    for site_id in site_ids:
        folder = bundle_dir / "server" / "sites" / site_id
        masks[site_id] = _load_array(folder / "masks.npy", MASKS_SHAPE)
        blocking[site_id] = _load_array(folder / "blocking.npy", BLOCKING_SHAPE)
    extra = manifest.model_extra or {}
    sites = extra.get("sites", {})
    warnings = {
        site_id: list(sites.get(site_id, {}).get("warnings", []))
        for site_id in masks
        if isinstance(sites, dict)
    }
    return Bundle(manifest.bundle_id, manifest.algo_version, masks, blocking, warnings)
