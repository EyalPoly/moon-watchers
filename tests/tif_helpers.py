from pathlib import Path

import numpy as np
import rasterio
from numpy.typing import NDArray
from rasterio.crs import CRS
from rasterio.transform import from_origin

POLAR_PROJ = (
    "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 "
    "+R=1737400 +units=m +no_defs"
)


def write_tif(
    path: Path,
    data: NDArray[np.float32],
    x_min_m: float,
    y_max_m: float,
    cell_m: float,
    crs: str | CRS = POLAR_PROJ,
    nodata: float | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(crs, str):
        crs = CRS.from_proj4(crs) if crs.startswith("+") else CRS.from_string(crs)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype="float32",
        crs=crs,
        transform=from_origin(x_min_m, y_max_m, cell_m, cell_m),
        nodata=nodata,
    ) as dst:
        dst.write(data.astype(np.float32), 1)
