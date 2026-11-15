import io
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from api.models import Meta, TileGrid
from build.layer_tiles import png_bytes, tile_bounds, tiles_in_extent, write_pyramid

META = Meta.model_validate_json(Path("contract/samples/meta.json").read_text())
GRID: TileGrid = META.regions[0].tile_grid
EXTENT = META.regions[0].extent_m


def opaque_unless_nan(values: NDArray[np.float32]) -> NDArray[np.uint8]:
    alpha = np.where(np.isnan(values), 0, 255).astype(np.uint8)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    rgba[..., 3] = alpha
    return rgba


def test_tile_bounds_z0() -> None:
    x_min, y_min, x_max, y_max = tile_bounds(GRID, 0, 0, 0)
    span = 256 * GRID.resolutions_m[0]
    assert (x_min, y_max) == (-1095930, 1095930)
    assert x_max - x_min == span
    assert y_max - y_min == span


def test_tiles_in_extent_covers_extent() -> None:
    z = len(GRID.resolutions_m) - 1
    tiles = tiles_in_extent(GRID, z, EXTENT)
    boxes = [tile_bounds(GRID, z, x, y) for x, y in tiles]
    assert min(b[0] for b in boxes) <= EXTENT[0] and max(b[2] for b in boxes) >= EXTENT[2]
    assert min(b[1] for b in boxes) <= EXTENT[1] and max(b[3] for b in boxes) >= EXTENT[3]
    for x_min, y_min, x_max, y_max in boxes:
        assert x_max > EXTENT[0] and x_min < EXTENT[2] and y_max > EXTENT[1] and y_min < EXTENT[3]


def test_nan_is_transparent_in_png() -> None:
    values = np.ones((4, 4), dtype=np.float32)
    values[1, 2] = np.nan
    image = Image.open(io.BytesIO(png_bytes(opaque_unless_nan(values)))).convert("RGBA")
    assert image.getpixel((2, 1))[3] == 0
    assert image.getpixel((0, 0))[3] == 255


def test_write_pyramid_writes_every_tile(tmp_path: Path) -> None:
    def sampler(x: NDArray[np.float64], y: NDArray[np.float64]) -> NDArray[np.float32]:
        return np.ones(x.shape, dtype=np.float32)

    count = write_pyramid(tmp_path, GRID, EXTENT, sampler, opaque_unless_nan)
    expected = sum(len(tiles_in_extent(GRID, z, EXTENT)) for z in range(len(GRID.resolutions_m)))
    assert count == expected
    assert len(list(tmp_path.rglob("*.png"))) == expected
    z, (x, y) = 0, tiles_in_extent(GRID, 0, EXTENT)[0]
    assert Image.open(tmp_path / str(z) / str(x) / f"{y}.png").size == (256, 256)


def test_png_is_a_palette_image_far_smaller_than_rgba() -> None:
    rng = np.random.default_rng(1)
    smooth = np.repeat(np.linspace(0, 255, 256, dtype=np.uint8)[None, :, None], 3, axis=2)
    gradient = np.concatenate([np.broadcast_to(smooth, (256, 256, 3)), np.full((256, 256, 1), 255, np.uint8)], axis=2)
    noisy = np.clip(gradient.astype(np.int16) + rng.integers(-8, 8, gradient.shape), 0, 255).astype(np.uint8)
    noisy[..., 3] = 255
    raw = io.BytesIO()
    Image.fromarray(noisy, "RGBA").save(raw, format="PNG")
    packed = png_bytes(noisy)
    assert Image.open(io.BytesIO(packed)).mode == "P"
    assert len(packed) < len(raw.getvalue()) / 2
