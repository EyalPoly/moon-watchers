import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pytest
import shapefile

from api.models import Meta, Region
from build.make_layers import (
    LAYERS_BASE_URL,
    OVERLAYS,
    RASTER_LAYERS,
    build_all,
    check_dist,
)
from tests.tif_helpers import write_tif

META = Meta.model_validate_json(Path("contract/samples/meta.json").read_text())
REGION: Region = META.regions[0].model_copy(update={"extent_m": (-20000.0, -20000.0, 20000.0, 20000.0)})
POLAR_PRJ = 'PROJCS["Stereographic_South_Pole",SPHEROID["Unknown",1737400,0],PROJECTION["Stereographic_South_Pole"]]'
GEOGRAPHIC_PRJ = 'GEOGCS["GCS_Moon_2000",SPHEROID["Moon_2000_IAU_IAG",1737400.0,0.0]]'
SQUARE = [[(1000, 1000), (1000, 3000), (3000, 3000), (3000, 1000), (1000, 1000)]]
FEATURES = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"Region": "R", "RegionCode": "R1", "Area_km2": 1.0, "label": "R"},
            "geometry": {"type": "Polygon", "coordinates": [[[0, -89.9], [10, -89.9], [10, -89.8], [0, -89.9]]]},
        }
    ],
}


def polygon_shapefile() -> tuple[bytes, bytes, bytes]:
    shp, dbf, shx = io.BytesIO(), io.BytesIO(), io.BytesIO()
    with shapefile.Writer(shp=shp, dbf=dbf, shx=shx, shapeType=shapefile.POLYGON) as writer:
        for name in ("area_km2", "name", "area", "PSR_ID"):
            writer.field(name, "C")
        writer.poly(SQUARE)
        writer.record("1", "a", "1", "p")
    return shp.getvalue(), dbf.getvalue(), shx.getvalue()


def point_zip(path: Path) -> None:
    shp, dbf, shx = io.BytesIO(), io.BytesIO(), io.BytesIO()
    with shapefile.Writer(shp=shp, dbf=dbf, shx=shx, shapeType=shapefile.POINT) as writer:
        for name in ("SHORT_NAME", "MISSION", "OBJECT", "DATE"):
            writer.field(name, "C")
        writer.point(0.0, -89.99)
        writer.record("n", "m", "o", "d")
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("S.SHP", shp.getvalue())
        archive.writestr("S.DBF", dbf.getvalue())
        archive.writestr("S.PRJ", GEOGRAPHIC_PRJ)


def make_sources(root: Path) -> Path:
    sources = root / "sources"
    write_tif(sources / "layers/slope/LDSM_80S_80MPP_ADJ.TIF", np.full((40, 40), 5.0, dtype=np.float32), -1600.0, 1600.0, 80.0)
    write_tif(sources / "lola/LDEM_80S_80MPP_ADJ.TIF", np.zeros((40, 40), dtype=np.float32), -1600.0, 1600.0, 80.0)
    write_tif(sources / "lola/LDEM_60S_240MPP_ADJ.TIF", np.full((120, 120), 10.0, dtype=np.float32), -14400.0, 14400.0, 240.0)
    shp, dbf, shx = polygon_shapefile()
    folder = sources / "layers/psr_1km2"
    folder.mkdir(parents=True)
    stem = folder / "LPSR_80S_20MPP_ADJ_1km2"
    stem.with_suffix(".SHP").write_bytes(shp)
    stem.with_suffix(".DBF").write_bytes(dbf)
    stem.with_suffix(".SHX").write_bytes(shx)
    stem.with_suffix(".PRJ").write_text(POLAR_PRJ)
    for zip_path in ("layers/psr_large/NAC_POLE_PSR_SOUTH.ZIP", "layers/mission_sites/ANTHROPOGENIC_OBJECTS_180.ZIP"):
        (sources / zip_path).parent.mkdir(parents=True, exist_ok=True)
        point_zip(sources / zip_path)
    for name in (
        "layers/artemis3/A3_9regions-lonlat-simplified.geojson",
        "layers/artemis3/A3_Named_regions.geojson",
        "layers/endurance/EnduranceTraverse_240129-v2.geojson",
    ):
        (sources / name).parent.mkdir(parents=True, exist_ok=True)
        (sources / name).write_text(json.dumps(FEATURES))
    return sources


def make_lock(root: Path) -> Path:
    lock = root / "lock.json"
    paths = [
        "layers/slope/LDSM_80S_80MPP_ADJ.TIF",
        "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.SHP",
        "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.DBF",
        "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.SHX",
        "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.PRJ",
        "layers/psr_large/NAC_POLE_PSR_SOUTH.ZIP",
        "layers/mission_sites/ANTHROPOGENIC_OBJECTS_180.ZIP",
        "layers/artemis3/A3_9regions-lonlat-simplified.geojson",
        "layers/artemis3/A3_Named_regions.geojson",
        "layers/endurance/EnduranceTraverse_240129-v2.geojson",
        "lola/LDEM_80S_80MPP_ADJ.TIF",
        "lola/LDEM_60S_240MPP_ADJ.TIF",
    ]
    files = [{"path": p, "url": f"https://x/{p}", "sha256": "a" * 64, "bytes": 1, "note": ""} for p in paths]
    lock.write_text(json.dumps({"files": files}))
    return lock


def tree_hashes(root: Path) -> dict[str, str]:
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob("*")) if p.is_file()}


def test_build_all_writes_layout_and_manifest(tmp_path: Path) -> None:
    out = tmp_path / "dist"
    build_all(make_sources(tmp_path), out, REGION, make_lock(tmp_path))
    for layer in RASTER_LAYERS:
        assert (out / "tiles/south_pole" / layer.id / "0/0/0.png").is_file()
        assert (out / "legends" / f"{layer.id}.png").is_file()
    for overlay in OVERLAYS:
        assert (out / "overlays" / f"{overlay.id}.geojson").is_file()
    manifest = json.loads((out / "layers.json").read_text())
    assert [layer["id"] for layer in manifest["layers"]] == [r.id for r in RASTER_LAYERS] + [o.id for o in OVERLAYS]
    slope = manifest["layers"][0]
    assert slope["sources"] == [{"url": "https://x/layers/slope/LDSM_80S_80MPP_ADJ.TIF", "sha256": "a" * 64}]


def test_overlay_content_reaches_the_file(tmp_path: Path) -> None:
    out = tmp_path / "dist"
    build_all(make_sources(tmp_path), out, REGION, make_lock(tmp_path))
    psr = json.loads((out / "overlays/psr_1km2.geojson").read_text())
    assert psr["features"][0]["properties"] == {"area_km2": "1", "name": "a"}
    sites = json.loads((out / "overlays/mission_sites.geojson").read_text())
    assert sites["features"][0]["properties"]["SHORT_NAME"] == "n"


def test_rebuild_is_clean_and_identical(tmp_path: Path) -> None:
    out = tmp_path / "dist"
    sources, lock = make_sources(tmp_path), make_lock(tmp_path)
    build_all(sources, out, REGION, lock)
    first = tree_hashes(out)
    (out / "stale.txt").write_text("old")
    build_all(sources, out, REGION, lock)
    assert not (out / "stale.txt").exists()
    assert tree_hashes(out) == first


def test_missing_source_names_file_and_command(tmp_path: Path) -> None:
    sources = make_sources(tmp_path)
    (sources / "layers/slope/LDSM_80S_80MPP_ADJ.TIF").unlink()
    with pytest.raises(FileNotFoundError, match=r"LDSM_80S_80MPP_ADJ.TIF.*make fetch ONLY=layers/"):
        build_all(sources, tmp_path / "dist", REGION, make_lock(tmp_path))


def test_registry_matches_sample_meta() -> None:
    region = META.regions[0]
    by_id = {layer.id: layer for layer in region.layers}
    for raster in RASTER_LAYERS:
        assert (by_id[raster.id].title, by_id[raster.id].attribution) == (raster.title, raster.attribution)
    assert [(o.id, o.title, o.attribution) for o in region.overlays] == [(o.id, o.title, o.attribution) for o in OVERLAYS]


def test_check_dist_passes_on_a_good_build(tmp_path: Path) -> None:
    out = tmp_path / "dist"
    build_all(make_sources(tmp_path), out, REGION, make_lock(tmp_path))
    meta = META.model_copy(update={"regions": [REGION]})
    assert check_dist(meta, out) == []


def test_check_dist_reports_missing_files(tmp_path: Path) -> None:
    out = tmp_path / "dist"
    build_all(make_sources(tmp_path), out, REGION, make_lock(tmp_path))
    (out / "overlays/psr_large.geojson").unlink()
    (out / "tiles/south_pole/slope_80m/0/0/0.png").unlink()
    problems = check_dist(META.model_copy(update={"regions": [REGION]}), out)
    assert any("psr_large" in p for p in problems)
    assert any("slope_80m" in p for p in problems)


def test_check_dist_flags_oversize_overlay(tmp_path: Path) -> None:
    out = tmp_path / "dist"
    build_all(make_sources(tmp_path), out, REGION, make_lock(tmp_path))
    (out / "overlays/endurance_traverse.geojson").write_bytes(b" " * (6 * 1024 * 1024))
    problems = check_dist(META.model_copy(update={"regions": [REGION]}), out)
    assert any("endurance_traverse" in p and "5 MB" in p for p in problems)


def test_base_url_matches_sample_meta() -> None:
    assert all(
        layer.url_template is not None and layer.url_template.startswith(LAYERS_BASE_URL)
        for layer in META.regions[0].layers[1:]
    )
