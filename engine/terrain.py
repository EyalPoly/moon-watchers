from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
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
