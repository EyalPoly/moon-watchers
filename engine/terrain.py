from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from numpy.typing import ArrayLike, NDArray

MOON_RADIUS_M: float = 1_737_400.0


def project(lat_deg: ArrayLike, lon_deg: ArrayLike) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    lat = np.radians(np.asarray(lat_deg, dtype=np.float64))
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    rho = 2.0 * MOON_RADIUS_M * np.tan((np.pi / 2 + lat) / 2)
    return rho * np.sin(lon), rho * np.cos(lon)


def unproject(
    x_m: ArrayLike, y_m: ArrayLike
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    x = np.asarray(x_m, dtype=np.float64)
    y = np.asarray(y_m, dtype=np.float64)
    rho = np.hypot(x, y)
    lat = np.degrees(2.0 * np.arctan(rho / (2.0 * MOON_RADIUS_M)) - np.pi / 2)
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon


@dataclass(frozen=True)
class Dem:
    id: str
    data: NDArray[np.float32]
    x0_m: float
    y0_m: float
    cell_m: float


def sample(dem: Dem, x_m: NDArray[np.float64], y_m: NDArray[np.float64]) -> NDArray[np.float32]:
    rows, cols = dem.data.shape
    col = (np.asarray(x_m, dtype=np.float64) - dem.x0_m) / dem.cell_m
    row = (dem.y0_m - np.asarray(y_m, dtype=np.float64)) / dem.cell_m
    inside = (col >= 0) & (col <= cols - 1) & (row >= 0) & (row <= rows - 1)
    col = np.where(inside, col, 0.0)
    row = np.where(inside, row, 0.0)
    c0 = np.minimum(np.floor(col).astype(np.intp), cols - 2) if cols > 1 else np.zeros_like(col, dtype=np.intp)
    r0 = np.minimum(np.floor(row).astype(np.intp), rows - 2) if rows > 1 else np.zeros_like(row, dtype=np.intp)
    c1 = np.minimum(c0 + 1, cols - 1)
    r1 = np.minimum(r0 + 1, rows - 1)
    fc = (col - c0).astype(np.float32)
    fr = (row - r0).astype(np.float32)
    d = dem.data
    top = d[r0, c0] * (1 - fc) + d[r0, c1] * fc
    bottom = d[r1, c0] * (1 - fc) + d[r1, c1] * fc
    value: NDArray[np.float32] = (top * (1 - fr) + bottom * fr).astype(np.float32)
    corners = np.stack([d[r0, c0], d[r0, c1], d[r1, c0], d[r1, c1]])
    # NaN propagates through the weights even at zero weight (NaN * 0 = NaN).
    value[~inside | np.isnan(corners).any(axis=0)] = np.nan
    return value


def sample_stack(
    dems: Sequence[Dem], x_m: NDArray[np.float64], y_m: NDArray[np.float64]
) -> NDArray[np.float32]:
    result = np.full(np.shape(x_m), np.nan, dtype=np.float32)
    for dem in sorted(dems, key=lambda d: d.cell_m):
        missing = np.isnan(result)
        if not missing.any():
            break
        values = sample(dem, np.asarray(x_m)[missing], np.asarray(y_m)[missing])
        result[missing] = values
    return result


def _is_moon_south_polar(proj4: str) -> bool:
    parts: dict[str, str] = {}
    for token in proj4.split():
        key, _, value = token.lstrip("+").partition("=")
        parts[key] = value
    radius = parts.get("R", parts.get("a"))
    return (
        parts.get("proj") == "stere"
        and radius is not None
        and float(radius) == MOON_RADIUS_M
        and float(parts.get("lat_0", "nan")) == -90.0
        and float(parts.get("lon_0", "0")) == 0.0
        and float(parts.get("x_0", "0")) == 0.0
        and float(parts.get("y_0", "0")) == 0.0
        and float(parts.get("k", parts.get("k_0", "1"))) == 1.0
    )


def dem_bounds(path: Path) -> tuple[float, float, float, float]:
    """x_min, y_min, x_max, y_max of the file on the polar map, in metres."""
    with rasterio.open(path) as ds:
        b = ds.bounds
    return float(b.left), float(b.bottom), float(b.right), float(b.top)


def load_dem(
    path: Path,
    dem_id: str,
    window_m: tuple[float, float, float, float] | None = None,
) -> Dem:
    with rasterio.open(path) as ds:
        if ds.crs is None or not _is_moon_south_polar(ds.crs.to_proj4()):
            raise ValueError(f"{path}: CRS is not the Moon south-polar stereographic sphere")
        transform = ds.transform
        cell = abs(transform.a)
        col0, row0, col1, row1 = 0, 0, ds.width, ds.height
        if window_m is not None:
            x_min, y_min, x_max, y_max = window_m
            col0 = max(0, int(np.floor((x_min - transform.c) / cell)))
            col1 = min(ds.width, int(np.ceil((x_max - transform.c) / cell)))
            row0 = max(0, int(np.floor((transform.f - y_max) / cell)))
            row1 = min(ds.height, int(np.ceil((transform.f - y_min) / cell)))
            if col1 <= col0 or row1 <= row0:
                raise ValueError(f"{path}: window is outside the file")
        raw = ds.read(1, window=Window(col0, row0, col1 - col0, row1 - row0))
        data = raw.astype(np.float32)
        nodata = ds.nodata
        if nodata is not None and not np.isnan(nodata):
            data[raw == nodata] = np.nan
        scale, offset = ds.scales[0], ds.offsets[0]
        if scale != 1.0 or offset != 0.0:
            data = data * np.float32(scale) + np.float32(offset)
        x0 = transform.c + col0 * cell + cell / 2
        y0 = transform.f - row0 * cell - cell / 2
    return Dem(dem_id, data, float(x0), float(y0), float(cell))
