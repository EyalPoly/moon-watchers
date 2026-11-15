from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from engine.horizons import MAX_REACH_M, compute_site_masks
from engine.terrain import Dem, load_dem, project, sample, sample_stack
from engine.windows import NEAR_HALF_WIDTH_M, window_around

NEAR = "lola/LDEM_80S_80MPP_ADJ.TIF"
FAR = "lola/LDEM_60S_240MPP_ADJ.TIF"
SLOPE = "layers/slope/LDSM_80S_80MPP_ADJ.TIF"
SLOPE_RESOLUTION_M: float = 80.0
NO_ELEVATION = "no terrain elevation at the site"
NO_SLOPE = "no slope data at the site"
TERRAIN_FILES: tuple[str, ...] = (NEAR, NEAR.replace(".TIF", "_ERR.TIF"), FAR, FAR.replace(".TIF", "_ERR.TIF"), SLOPE)

# Two cells either side of the point are enough for a bilinear slope; this is the ground reach.
_SLOPE_HALF_WIDTH_M = 400.0
# The long-reach window must hold the farthest ray plus a margin for the map stretch.
_FAR_HALF_WIDTH_M = MAX_REACH_M + 2_000.0


class TerrainMissing(FileNotFoundError):
    pass


@dataclass(frozen=True)
class CustomPoint:
    lat_deg: float
    lon_deg: float
    elevation_m: float
    slope_deg: float
    masks: NDArray[np.float32]
    blocking: NDArray[np.float32]
    warnings: list[str]


def _window(terrain_dir: Path, name: str, window: tuple[float, float, float, float]) -> Dem | None:
    """The part of one file inside `window`; None when the point lies outside the file."""
    path = terrain_dir / name
    if not path.is_file():
        raise TerrainMissing(f"terrain file is missing: {name}")
    try:
        return load_dem(path, name, window)
    except ValueError as error:
        if "outside" in str(error):
            return None
        raise


def _layer(terrain_dir: Path, name: str, window: tuple[float, float, float, float]) -> list[Dem]:
    dem = _window(terrain_dir, name, window)
    return [] if dem is None else [dem]


def _optional_errors(terrain_dir: Path, name: str, window: tuple[float, float, float, float]) -> list[Dem]:
    error_name = name.replace(".TIF", "_ERR.TIF")
    if not (terrain_dir / error_name).is_file():
        return []
    dem = _window(terrain_dir, error_name, window)
    return [] if dem is None else [dem]


def compute_custom_point(lat_deg: float, lon_deg: float, terrain_dir: Path) -> CustomPoint:
    near_window = window_around(lat_deg, lon_deg, NEAR_HALF_WIDTH_M)
    far_window = window_around(lat_deg, lon_deg, _FAR_HALF_WIDTH_M)
    terrain = [*_layer(terrain_dir, NEAR, near_window), *_layer(terrain_dir, FAR, far_window)]
    errors = [*_optional_errors(terrain_dir, NEAR, near_window), *_optional_errors(terrain_dir, FAR, far_window)]

    x, y = project(lat_deg, lon_deg)
    elevation = float(sample_stack(terrain, np.atleast_1d(x), np.atleast_1d(y))[0]) if terrain else float("nan")
    if not np.isfinite(elevation):
        raise ValueError(NO_ELEVATION)

    slope_dem = _window(terrain_dir, SLOPE, window_around(lat_deg, lon_deg, _SLOPE_HALF_WIDTH_M))
    slope = float(sample(slope_dem, np.atleast_1d(x), np.atleast_1d(y))[0]) if slope_dem is not None else float("nan")
    if not np.isfinite(slope):
        raise ValueError(NO_SLOPE)

    masks = compute_site_masks(lat_deg, lon_deg, terrain, errors)
    return CustomPoint(lat_deg, lon_deg, elevation, slope, masks.masks_deg, masks.blocking_km, masks.warnings)
