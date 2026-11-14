from pathlib import Path

import numpy as np
import pytest

from engine.horizons import compute_site_masks
from engine.terrain import load_dem, project

SOURCES = Path("data/sources/lola")
DEM = SOURCES / "LDEM_80S_80MPP_ADJ.TIF"
FAR = SOURCES / "LDEM_60S_240MPP_ADJ.TIF"

pytestmark = pytest.mark.skipif(not DEM.exists(), reason="LOLA 80 m DEM not downloaded")


def test_real_dem_smoke() -> None:
    lat, lon = -87.0, 10.0
    x, y = project(lat, lon)
    cx, cy = float(x), float(y)
    near = load_dem(DEM, "80m", (cx - 12_000, cy - 12_000, cx + 12_000, cy + 12_000))
    terrain = [near]
    if FAR.exists():
        terrain.append(load_dem(FAR, "240m", (cx - 302_000, cy - 302_000, cx + 302_000, cy + 302_000)))
    heights = near.data[np.isfinite(near.data)]
    assert -10_000 < heights.min() and heights.max() < 10_000
    masks = compute_site_masks(lat, lon, terrain, [])
    finite = masks.masks_deg[0][np.isfinite(masks.masks_deg[0])]
    assert (finite > -5).all() and (finite < 15).all()
