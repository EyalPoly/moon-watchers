import sys
from pathlib import Path

import numpy as np
import pytest

from engine.horizons import compute_site_masks, march, mask_at_height, ray_distances, reach_for_ground
from engine.terrain import Dem, load_dem, project, sample_stack

PROTOTYPE = Path("MenasimMoonV3")
CROPS = PROTOTYPE / "data" / "terrain"
LAYERS = {
    "terrain": ["fine-f371e253476d", "near-f5b4b53c1c91", "far-273b07c001d5"],
    "error": ["fine_error-173daa0cd608", "near_error-8f8fc9833717", "far_error-defb29b6d651"],
}

pytestmark = pytest.mark.skipif(
    not all((CROPS / f"{name}.tif").is_file() for names in LAYERS.values() for name in names),
    reason="the physics prototype's cached terrain crops are not available",
)


@pytest.fixture(scope="module")
def prototype_terrain() -> object:
    pytest.importorskip("scipy")
    pytest.importorskip("shapely")
    import rasterio

    sys.path.insert(0, str(PROTOTYPE))
    try:
        from lunar_nav.models import Context
        from lunar_nav.terrain import RasterLayer, RasterTerrain
    except ImportError:
        pytest.skip("the physics prototype does not import")
    finally:
        sys.path.remove(str(PROTOTYPE))

    def layer(name: str) -> RasterLayer:
        with rasterio.open(CROPS / f"{name}.tif") as src:
            values = src.read(1, masked=True).astype("float32").filled(np.nan)
            return RasterLayer(values, src.transform, abs(src.transform.a), name)

    terrain = RasterTerrain(
        [layer(n) for n in LAYERS["terrain"]],
        [layer(n) for n in LAYERS["error"]],
        version="ref",
        provenance={},
    )
    return Context(terrain=terrain, geometry=None)  # type: ignore[arg-type]


def ours(names: list[str]) -> list[Dem]:
    return [load_dem(CROPS / f"{n}.tif", n) for n in names]


def reach_at(lat: float, lon: float, terrain: list[Dem]) -> float:
    x, y = project(lat, lon)
    return reach_for_ground(float(sample_stack(terrain, np.atleast_1d(x), np.atleast_1d(y))[0]))


@pytest.mark.parametrize(("lat", "lon"), [(-89.0, 0.0), (-89.0, 8.0)])
@pytest.mark.parametrize("height_m", [2.0, 3.0])
def test_matches_prototype_build_horizon(
    prototype_terrain: object, lat: float, lon: float, height_m: float
) -> None:
    sys.path.insert(0, str(PROTOTYPE))
    try:
        from lunar_nav.models import Settings, Site
        from lunar_nav.terrain import build_horizon
    finally:
        sys.path.remove(str(PROTOTYPE))

    settings = Settings(
        horizon_step_deg=0.5, near_step_m=40, near_radius_m=10_000, far_step_m=240,
        horizon_radius_m=None,
    )
    reference = build_horizon(Site(lat, lon), height_m, prototype_terrain, settings)  # type: ignore[arg-type]
    terrain = ours(LAYERS["terrain"])
    assert reference.radius_m == pytest.approx(reach_at(lat, lon, terrain))
    result = march(
        lat, lon, [height_m], terrain, ours(LAYERS["error"]), ray_distances(reach_m=reference.radius_m)
    )
    mine = result.elevation_deg[0]
    assert np.array_equal(np.isnan(mine), np.isnan(reference.elevation_deg))
    both = np.isfinite(mine)
    assert both.sum() > 0
    assert np.abs(mine[both] - reference.elevation_deg[both]).max() < 0.01
    for ours_bound, theirs in ((result.low_deg[0], reference.low_deg), (result.high_deg[0], reference.high_deg)):
        assert np.array_equal(np.isnan(ours_bound), np.isnan(theirs))
        assert np.nanmax(np.abs(ours_bound - theirs)) < 0.002


@pytest.mark.parametrize(("lat", "lon"), [(-89.0, 0.0), (-89.0, 8.0)])
def test_mask_at_height_on_real_terrain(lat: float, lon: float) -> None:
    terrain, errors = ours(LAYERS["terrain"]), ours(LAYERS["error"])
    masks = compute_site_masks(lat, lon, terrain, errors).masks_deg
    worst = 0.0
    for height in (2.5, 2.55):
        direct = march(
            lat, lon, [height], terrain, errors, ray_distances(reach_m=reach_at(lat, lon, terrain))
        ).elevation_deg[0]
        blend = mask_at_height(masks, height)[0]
        finite = np.isfinite(direct)
        assert np.array_equal(finite, np.isfinite(blend))
        difference = blend[finite] - direct[finite]
        worst = max(worst, float(np.abs(difference).max()))
        # A few directions, where the skyline switches between a near ridge and a far one as the
        # height changes, overshoot by up to about 0.05 degrees; the rest agree within 0.01.
        assert np.abs(difference).max() < 0.06
        assert np.mean(np.abs(difference) < 0.01) > 0.97
        assert difference.min() > -1e-3
    print(f"blend error at ({lat}, {lon}): max {worst:.5f} deg")
