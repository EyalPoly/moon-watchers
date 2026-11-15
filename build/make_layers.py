import json
import shutil
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from api.models import Meta, Region, TileGrid
from build.fetch_sources import DEST, LOCK_PATH
from build.layer_tiles import (
    Extent,
    Ramp,
    elevation_ramp,
    hillshade,
    legend_png,
    slope_ramp,
    tile_bounds,
    tiles_in_extent,
    write_pyramid,
)
from build.layer_vectors import (
    Feature,
    overlay_geojson,
    read_geojson,
    read_shapefile,
    shapefile_from_zip,
)
from engine.terrain import load_dem, sample_stack

LAYERS_BASE_URL = "https://clps-514710-layers.web.app"
DIST = Path("layers/dist")
MAX_TOTAL_BYTES = 40 * 1024 * 1024
MAX_OVERLAY_BYTES = 5 * 1024 * 1024

SLOPE_TIF = "layers/slope/LDSM_80S_80MPP_ADJ.TIF"
ELEVATION_DEMS = (("lola/LDEM_80S_80MPP_ADJ.TIF", "dem80"), ("lola/LDEM_60S_240MPP_ADJ.TIF", "dem240"))
PSR_1KM2 = "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2"
PSR_1KM2_FILES = tuple(f"{PSR_1KM2}.{ext}" for ext in ("SHP", "DBF", "SHX", "PRJ"))
PSR_LARGE = "layers/psr_large/NAC_POLE_PSR_SOUTH.ZIP"
MISSION_SITES = "layers/mission_sites/ANTHROPOGENIC_OBJECTS_180.ZIP"
ARTEMIS_2024 = "layers/artemis3/A3_9regions-lonlat-simplified.geojson"
ARTEMIS_2022 = "layers/artemis3/A3_Named_regions.geojson"
ENDURANCE = "layers/endurance/EnduranceTraverse_240129-v2.geojson"

NASA_LOLA = "NASA / GSFC / LOLA"
NASA_LROC = "NASA / LRO / LROC (ASU)"
NASA_ACT = "NASA, via Arizona State University / ACT"


@dataclass(frozen=True)
class RasterLayer:
    id: str
    title: str
    attribution: str
    sources: tuple[str, ...]
    ramp: Ramp
    legend_range: tuple[float, float]


@dataclass(frozen=True)
class OverlayLayer:
    id: str
    title: str
    attribution: str
    sources: tuple[str, ...]
    load: Callable[[Path], list[Feature]]
    keep: tuple[str, ...]
    simplify_m: float


def _load_shapefile(sources: Path) -> list[Feature]:
    stem = sources / PSR_1KM2
    with stem.with_suffix(".SHP").open("rb") as shp, stem.with_suffix(".DBF").open("rb") as dbf:
        return read_shapefile(shp, dbf, stem.with_suffix(".PRJ").read_text())


def _load_zip(relative: str) -> Callable[[Path], list[Feature]]:
    def load(sources: Path) -> list[Feature]:
        shp, dbf, prj = shapefile_from_zip(sources / relative)
        return read_shapefile(shp, dbf, prj)

    return load


def _load_geojson(relative: str) -> Callable[[Path], list[Feature]]:
    return lambda sources: read_geojson((sources / relative).read_text())


RASTER_LAYERS: tuple[RasterLayer, ...] = (
    RasterLayer("slope_80m", "LOLA slope, 80 m", NASA_LOLA, (SLOPE_TIF,), slope_ramp, (0.0, 30.0)),
    RasterLayer(
        "elevation", "LOLA elevation, hill-shaded", NASA_LOLA,
        tuple(path for path, _ in ELEVATION_DEMS), elevation_ramp, (-9000.0, 9000.0),
    ),
)

OVERLAYS: tuple[OverlayLayer, ...] = (
    OverlayLayer(
        "psr_1km2", "Permanently shadowed regions, 1 km² and larger", NASA_LOLA,
        PSR_1KM2_FILES, _load_shapefile, ("area_km2", "name"), 40.0,
    ),
    OverlayLayer(
        "psr_large", "Permanently shadowed regions, 5 km² and larger (Mazarico 2011)", NASA_LROC,
        (PSR_LARGE,), _load_zip(PSR_LARGE), ("area", "PSR_ID"), 40.0,
    ),
    OverlayLayer(
        "mission_sites", "Past mission sites", NASA_LROC,
        (MISSION_SITES,), _load_zip(MISSION_SITES), ("SHORT_NAME", "MISSION", "OBJECT", "DATE"), 0.0,
    ),
    OverlayLayer(
        "artemis3_2024", "Artemis III candidate regions (2024)", NASA_ACT,
        (ARTEMIS_2024,), _load_geojson(ARTEMIS_2024), ("Region", "RegionCode", "Area_km2"), 0.0,
    ),
    OverlayLayer(
        "artemis3_2022", "Artemis III candidate regions (2022)", NASA_ACT,
        (ARTEMIS_2022,), _load_geojson(ARTEMIS_2022), ("label",), 0.0,
    ),
    OverlayLayer(
        "endurance_traverse", "Endurance-A traverse", NASA_ACT,
        (ENDURANCE,), _load_geojson(ENDURANCE), (), 50.0,
    ),
)


def build_slope_tiles(slope_tif: Path, out: Path, grid: TileGrid, extent: Extent) -> int:
    dem = load_dem(slope_tif, "slope", window_m=extent)
    return write_pyramid(out, grid, extent, lambda x, y: sample_stack([dem], x, y), slope_ramp)


def build_elevation_tiles(dems: Sequence[tuple[Path, str]], out: Path, grid: TileGrid, extent: Extent) -> int:
    loaded = [load_dem(path, dem_id, window_m=extent) for path, dem_id in dems]
    written = 0
    for z, res in enumerate(grid.resolutions_m):

        def shaded(values: NDArray[np.float32], res: float = res) -> NDArray[np.uint8]:
            rgba = elevation_ramp(values)
            light = np.nan_to_num(hillshade(values, res), nan=1.0)
            rgba[..., :3] = (rgba[..., :3] * (0.35 + 0.65 * light[..., None])).astype(np.uint8)
            return rgba

        written += write_pyramid(out, grid, extent, lambda x, y: sample_stack(loaded, x, y), shaded, levels=[z])
    return written


def _require(sources: Path, relative: str) -> None:
    if not (sources / relative).is_file():
        prefix = "layers/" if relative.startswith("layers/") else "lola/"
        raise FileNotFoundError(f"{sources / relative} is missing; run: make fetch ONLY={prefix}")


def _tree_stats(folder: Path) -> tuple[int, int]:
    files = [p for p in folder.rglob("*") if p.is_file()] if folder.is_dir() else [folder]
    return len(files), sum(p.stat().st_size for p in files)


def build_all(sources: Path, out: Path, region: Region, lock_path: Path = LOCK_PATH) -> None:
    lock = {entry["path"]: entry for entry in json.loads(lock_path.read_text())["files"]}
    every: tuple[RasterLayer | OverlayLayer, ...] = (*RASTER_LAYERS, *OVERLAYS)
    for layer in every:
        for relative in layer.sources:
            _require(sources, relative)
    shutil.rmtree(out, ignore_errors=True)
    extent = region.extent_m
    manifest: list[dict[str, object]] = []

    def record(layer: RasterLayer | OverlayLayer, target: Path) -> None:
        files, size = _tree_stats(target)
        manifest.append(
            {
                "id": layer.id,
                "title": layer.title,
                "attribution": layer.attribution,
                "sources": [{"url": lock[p]["url"], "sha256": lock[p]["sha256"]} for p in layer.sources],
                "files": files,
                "bytes": size,
            }
        )

    for raster in RASTER_LAYERS:
        tiles = out / "tiles" / region.id / raster.id
        if raster.id == "slope_80m":
            build_slope_tiles(sources / SLOPE_TIF, tiles, region.tile_grid, extent)
        else:
            build_elevation_tiles([(sources / path, dem_id) for path, dem_id in ELEVATION_DEMS], tiles, region.tile_grid, extent)
        (out / "legends").mkdir(parents=True, exist_ok=True)
        (out / "legends" / f"{raster.id}.png").write_bytes(legend_png(raster.ramp, *raster.legend_range))
        record(raster, tiles)
    for overlay in OVERLAYS:
        target = out / "overlays" / f"{overlay.id}.geojson"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(overlay_geojson(overlay.load(sources), extent, overlay.simplify_m, overlay.keep))
        record(overlay, target)
    (out / "layers.json").write_text(json.dumps({"layers": manifest}, indent=2) + "\n")


def _under_base(url: str) -> str | None:
    prefix = LAYERS_BASE_URL + "/"
    return url.removeprefix(prefix) if url.startswith(prefix) else None


def check_dist(meta: Meta, dist: Path) -> list[str]:
    problems: list[str] = []
    for region in meta.regions:
        grid, extent = region.tile_grid, region.extent_m
        top = len(grid.resolutions_m) - 1
        first = tiles_in_extent(grid, 0, extent)[0]
        centre = next(
            (x, y)
            for x, y in tiles_in_extent(grid, top, extent)
            if tile_bounds(grid, top, x, y)[0] <= 0 < tile_bounds(grid, top, x, y)[2]
            and tile_bounds(grid, top, x, y)[1] < 0 <= tile_bounds(grid, top, x, y)[3]
        )
        for layer in region.layers:
            if layer.kind != "local" or layer.url_template is None:
                continue
            template = _under_base(layer.url_template)
            if template is None:
                problems.append(f"{layer.id}: url_template is not under {LAYERS_BASE_URL}")
                continue
            for z, (x, y) in ((0, first), (top, centre)):
                tile = template.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
                if not (dist / tile).is_file():
                    problems.append(f"{layer.id}: missing {tile}")
            if layer.legend_url is not None:
                legend = _under_base(layer.legend_url)
                if legend is None or not (dist / legend).is_file():
                    problems.append(f"{layer.id}: missing legend {layer.legend_url}")
        for overlay in region.overlays:
            relative = _under_base(overlay.url)
            if relative is None or not (dist / relative).is_file():
                problems.append(f"{overlay.id}: missing {overlay.url}")
            elif (dist / relative).stat().st_size >= MAX_OVERLAY_BYTES:
                problems.append(f"{overlay.id}: file is 5 MB or larger")
    total = sum(p.stat().st_size for p in dist.rglob("*") if p.is_file())
    if total >= MAX_TOTAL_BYTES:
        problems.append(f"layers/dist is {total / 1e6:.1f} MB, over the 40 MB budget")
    return problems


def main() -> None:
    meta = Meta.model_validate_json(Path("contract/samples/meta.json").read_text())
    build_all(DEST, DIST, meta.regions[0])
    problems = check_dist(meta, DIST)
    for problem in problems:
        print(problem)
    if problems:
        raise SystemExit(1)
    print(f"built {DIST}")


if __name__ == "__main__":
    main()
