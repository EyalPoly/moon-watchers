import io
import json
import zipfile
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import shapefile
from shapely.geometry import LineString, Point, Polygon, box, shape

from build.layer_vectors import overlay_geojson, read_geojson, read_shapefile, shapefile_from_zip
from engine.terrain import project

EXTENT = (-457440.0, -457440.0, 457440.0, 457440.0)
POLAR_PRJ = 'PROJCS["Stereographic_South_Pole",GEOGCS["GCS",SPHEROID["Unknown",1737400,0]],PROJECTION["Stereographic_South_Pole"]]'
GEOGRAPHIC_PRJ = 'GEOGCS["GCS_Moon_2000",DATUM["D_Moon_2000",SPHEROID["Moon_2000_IAU_IAG",1737400.0,0.0]]]'


def write_points(path: Path, points: list[tuple[float, float]], names: list[str]) -> tuple[io.BytesIO, io.BytesIO]:
    with shapefile.Writer(str(path), shapeType=shapefile.POINT) as writer:
        writer.field("NAME", "C")
        writer.field("SECRET", "C")
        for (x, y), name in zip(points, names, strict=True):
            writer.point(x, y)
            writer.record(name, "hidden")
    return io.BytesIO(path.with_suffix(".shp").read_bytes()), io.BytesIO(path.with_suffix(".dbf").read_bytes())


def lonlat_of(collection: str) -> list[tuple[float, float]]:
    return [tuple(f["geometry"]["coordinates"]) for f in json.loads(collection)["features"]]  # type: ignore[misc]


def test_polar_shapefile_roundtrip(tmp_path: Path) -> None:
    x, y = project(-85.0, 0.0)
    shp, dbf = write_points(tmp_path / "p", [(float(x), float(y))], ["a"])
    features = read_shapefile(shp, dbf, POLAR_PRJ)
    ((lon, lat),) = lonlat_of(overlay_geojson(features, EXTENT, 0.0, ["NAME"]))
    assert lon == pytest.approx(0.0, abs=1e-4) and lat == pytest.approx(-85.0, abs=1e-4)


def test_longitude_is_wrapped_to_plus_minus_180() -> None:
    x, y = project(-85.0, 270.0)
    features = [(Point(float(x), float(y)), {})]
    ((lon, lat),) = lonlat_of(overlay_geojson(features, EXTENT, 0.0, []))
    assert lon == pytest.approx(-90.0, abs=1e-4) and lat == pytest.approx(-85.0, abs=1e-4)


def test_geographic_prj_is_projected(tmp_path: Path) -> None:
    shp, dbf = write_points(tmp_path / "g", [(30.0, -85.0)], ["a"])
    features = read_shapefile(shp, dbf, GEOGRAPHIC_PRJ)
    ((lon, lat),) = lonlat_of(overlay_geojson(features, EXTENT, 0.0, []))
    assert lon == pytest.approx(30.0, abs=1e-4) and lat == pytest.approx(-85.0, abs=1e-4)


def test_unknown_projection_raises(tmp_path: Path) -> None:
    shp, dbf = write_points(tmp_path / "u", [(0.0, 0.0)], ["a"])
    with pytest.raises(ValueError, match="Mercator"):
        read_shapefile(shp, dbf, 'PROJCS["Mercator_Auxiliary_Sphere"]')


def test_outside_extent_is_dropped_and_empty_overlay_is_valid() -> None:
    x, y = project(-60.0, 0.0)
    out = json.loads(overlay_geojson([(Point(float(x), float(y)), {})], EXTENT, 0.0, []))
    assert out == {"features": [], "type": "FeatureCollection"}


def test_polygon_is_clipped_to_extent() -> None:
    inside = box(400000, -10000, 500000, 10000)
    out = json.loads(overlay_geojson([(inside, {})], EXTENT, 0.0, []))
    (feature,) = out["features"]
    xs, ys = project(
        np.array([c[1] for c in feature["geometry"]["coordinates"][0]]),
        np.array([c[0] for c in feature["geometry"]["coordinates"][0]]),
    )
    assert float(np.max(xs)) <= EXTENT[2] + 1.0


def test_simplify_reduces_vertices() -> None:
    rng = np.random.default_rng(0)
    xs = np.linspace(-1000, 1000, 1000)
    line = LineString(np.column_stack([xs, rng.normal(0, 5, 1000)]))
    full = json.loads(overlay_geojson([(line, {})], EXTENT, 0.0, []))["features"][0]["geometry"]["coordinates"]
    simple = json.loads(overlay_geojson([(line, {})], EXTENT, 100.0, []))["features"][0]["geometry"]["coordinates"]
    assert len(simple) < len(full) / 5


def test_keep_filters_properties(tmp_path: Path) -> None:
    x, y = project(-85.0, 0.0)
    shp, dbf = write_points(tmp_path / "k", [(float(x), float(y))], ["site"])
    out = json.loads(overlay_geojson(read_shapefile(shp, dbf, POLAR_PRJ), EXTENT, 0.0, ["NAME"]))
    assert out["features"][0]["properties"] == {"NAME": "site"}


def test_read_geojson_projects_lonlat() -> None:
    text = json.dumps(
        {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"label": "a"}, "geometry": {"type": "Point", "coordinates": [30, -85]}}
        ]}
    )
    ((geometry, props),) = read_geojson(text)
    x, y = project(-85.0, 30.0)
    assert (geometry.x, geometry.y) == pytest.approx((float(x), float(y)))
    assert props == {"label": "a"}


def test_missing_zip_message(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match=r"make fetch ONLY=layers/"):
        shapefile_from_zip(tmp_path / "x.zip")


def test_shapefile_from_zip_reads_members(tmp_path: Path) -> None:
    write_points(tmp_path / "z", [(1.0, -85.0)], ["a"])
    archive = tmp_path / "x.zip"
    with zipfile.ZipFile(archive, "w") as z:
        for suffix in (".shp", ".dbf", ".shx"):
            z.write(tmp_path / f"z{suffix}", f"DIR/Z{suffix.upper()}")
        z.writestr("DIR/Z.PRJ", GEOGRAPHIC_PRJ)
        z.writestr("DIR/Z.SHP.XML", "<x/>")
    shp, dbf, prj = shapefile_from_zip(archive)
    features = read_shapefile(shp, dbf, prj)
    assert len(features) == 1 and features[0][1]["NAME"] == "a"


def test_deterministic() -> None:
    x, y = project(-85.0, 10.0)
    poly = Polygon([(float(x), float(y)), (float(x) + 900, float(y)), (float(x), float(y) + 900)])
    features: list[tuple[Any, dict[str, Any]]] = [(poly, {"n": 1})]
    assert overlay_geojson(features, EXTENT, 50.0, ["n"]) == overlay_geojson(features, EXTENT, 50.0, ["n"])
    assert shape(json.loads(overlay_geojson(features, EXTENT, 0.0, ["n"]))["features"][0]["geometry"]).is_valid


def test_self_intersecting_polygon_is_repaired() -> None:
    bowtie = Polygon([(0, 0), (2000, 2000), (2000, 0), (0, 2000)])
    assert not bowtie.is_valid
    out = json.loads(overlay_geojson([(bowtie, {})], EXTENT, 50.0, []))
    assert len(out["features"]) == 1
