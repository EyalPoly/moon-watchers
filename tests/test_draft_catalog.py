from pathlib import Path

import numpy as np
import pytest

from build.draft_catalog import sample, slug
from tests.tif_helpers import write_tif


def test_slug_makes_a_valid_site_id() -> None:
    assert slug("de Gerlache") == "de_gerlache"
    assert slug("Ibn Bajja") == "ibn_bajja"


def test_sample_interpolates_between_pixel_centres(tmp_path: Path) -> None:
    import rasterio

    data = np.zeros((20, 20), np.float32)
    data[:, 10:] = 100.0
    write_tif(tmp_path / "ramp.tif", data, -200.0, 200.0, 20.0)
    with rasterio.open(tmp_path / "ramp.tif") as ds:
        # Pixel column 9 has centre x = -10 and column 10 has centre x = +10; x = 0 is halfway between.
        assert sample(ds, 0.0, 0.0) == pytest.approx(50.0)
        assert sample(ds, -10.0, 0.0) == pytest.approx(0.0)
