import io
import math
from collections.abc import Callable, Sequence
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from api.models import TileGrid

Extent = tuple[float, float, float, float]
Ramp = Callable[[NDArray[np.float32]], NDArray[np.uint8]]
Sampler = Callable[[NDArray[np.float64], NDArray[np.float64]], NDArray[np.float32]]


def tile_bounds(grid: TileGrid, z: int, x: int, y: int) -> Extent:
    span = grid.tile_size_px * grid.resolutions_m[z]
    x_min = grid.origin[0] + x * span
    y_max = grid.origin[1] - y * span
    return x_min, y_max - span, x_min + span, y_max


def tiles_in_extent(grid: TileGrid, z: int, extent: Extent) -> list[tuple[int, int]]:
    span = grid.tile_size_px * grid.resolutions_m[z]
    x_first = math.floor((extent[0] - grid.origin[0]) / span)
    x_last = math.ceil((extent[2] - grid.origin[0]) / span) - 1
    y_first = math.floor((grid.origin[1] - extent[3]) / span)
    y_last = math.ceil((grid.origin[1] - extent[1]) / span) - 1
    return [(x, y) for y in range(y_first, y_last + 1) for x in range(x_first, x_last + 1)]


def png_bytes(rgba: NDArray[np.uint8]) -> bytes:
    buffer = io.BytesIO()
    image = Image.fromarray(rgba, "RGBA").quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def write_pyramid(
    out: Path, grid: TileGrid, extent: Extent, sampler: Sampler, ramp: Ramp, levels: Sequence[int] | None = None
) -> int:
    size = grid.tile_size_px
    offsets = (np.arange(size) + 0.5).astype(np.float64)
    written = 0
    for z in levels if levels is not None else range(len(grid.resolutions_m)):
        res = grid.resolutions_m[z]
        for x, y in tiles_in_extent(grid, z, extent):
            x_min, _, _, y_max = tile_bounds(grid, z, x, y)
            xs = np.broadcast_to(x_min + offsets * res, (size, size))
            ys = np.broadcast_to((y_max - offsets * res)[:, None], (size, size))
            target = out / str(z) / str(x) / f"{y}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(png_bytes(ramp(sampler(xs, ys))))
            written += 1
    return written


def legend_png(ramp: Ramp, low: float, high: float, width: int = 256, height: int = 16) -> bytes:
    strip = np.linspace(low, high, width, dtype=np.float32)
    rgba = ramp(np.tile(strip, (height, 1)))
    return png_bytes(rgba)


SLOPE_RANGE_DEG = (0.0, 30.0)
ELEVATION_RANGE_M = (-9000.0, 9000.0)
SLOPE_STOPS = np.array([[250, 245, 200], [253, 174, 97], [215, 48, 39]], dtype=np.float32)
ELEVATION_STOPS = np.array([[49, 54, 149], [116, 173, 209], [254, 224, 144], [215, 48, 39]], dtype=np.float32)


def _colour(values: NDArray[np.float32], low: float, high: float, stops: NDArray[np.float32]) -> NDArray[np.uint8]:
    position = np.clip((values - low) / (high - low), 0.0, 1.0) * (len(stops) - 1)
    first = np.minimum(np.floor(np.nan_to_num(position)).astype(np.intp), len(stops) - 2)
    frac = (np.nan_to_num(position) - first)[..., None]
    rgb = stops[first] * (1 - frac) + stops[first + 1] * frac
    rgba = np.empty((*values.shape, 4), dtype=np.uint8)
    rgba[..., :3] = np.round(rgb).astype(np.uint8)
    rgba[..., 3] = np.where(np.isnan(values), 0, 255)
    return rgba


def slope_ramp(values: NDArray[np.float32]) -> NDArray[np.uint8]:
    return _colour(values, *SLOPE_RANGE_DEG, SLOPE_STOPS)


def elevation_ramp(values: NDArray[np.float32]) -> NDArray[np.uint8]:
    return _colour(values, *ELEVATION_RANGE_M, ELEVATION_STOPS)


def hillshade(values: NDArray[np.float32], cell_m: float) -> NDArray[np.float32]:
    d_row, d_col = np.gradient(values.astype(np.float64), cell_m)
    slope = np.arctan(np.hypot(d_row, d_col))
    aspect = np.arctan2(d_col, -d_row)
    zenith, azimuth = np.radians(45.0), np.radians(315.0)
    shade = np.cos(zenith) * np.cos(slope) + np.sin(zenith) * np.sin(slope) * np.cos(azimuth - aspect)
    shade[np.isnan(values)] = np.nan
    result: NDArray[np.float32] = np.clip(shade, 0.0, 1.0).astype(np.float32)
    return result
