import io
import json
import zipfile
from collections.abc import Sequence
from pathlib import Path
from typing import IO, Any

import numpy as np
import shapefile
import shapely
from numpy.typing import NDArray
from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry

from engine.terrain import MOON_RADIUS_M, project, unproject

Feature = tuple[BaseGeometry, dict[str, Any]]
Extent = tuple[float, float, float, float]
FETCH_HINT = "run: make fetch ONLY=layers/"


def _lonlat_to_metres(coords: NDArray[np.float64]) -> NDArray[np.float64]:
    x, y = project(coords[:, 1], coords[:, 0])
    return np.column_stack([x, y])


def _metres_to_lonlat(coords: NDArray[np.float64]) -> NDArray[np.float64]:
    lat, lon = unproject(coords[:, 0], coords[:, 1])
    wrapped = (lon + 180.0) % 360.0 - 180.0
    return np.round(np.column_stack([wrapped, lat]), 5)


def read_shapefile(shp: IO[bytes], dbf: IO[bytes], prj: str) -> list[Feature]:
    if "Stereographic_South_Pole" in prj and str(int(MOON_RADIUS_M)) in prj:
        to_metres = False
    elif prj.lstrip().startswith("GEOGCS"):
        to_metres = True
    else:
        name = prj.split("[", 1)[-1].split(",", 1)[0].strip('"') or prj[:40]
        raise ValueError(f"unsupported shapefile projection: {name}")
    reader = shapefile.Reader(shp=shp, dbf=dbf)
    features: list[Feature] = []
    for item in reader.iterShapeRecords():
        geometry = shape(item.shape.__geo_interface__)
        if to_metres:
            geometry = shapely.transform(geometry, _lonlat_to_metres)
        features.append((geometry, item.record.as_dict()))
    return features


def read_geojson(text: str) -> list[Feature]:
    collection = json.loads(text)
    return [
        (shapely.transform(shape(f["geometry"]), _lonlat_to_metres), f.get("properties") or {})
        for f in collection["features"]
    ]


def overlay_geojson(features: Sequence[Feature], extent: Extent, simplify_m: float, keep: Sequence[str]) -> str:
    window = box(*extent)
    out: list[dict[str, Any]] = []
    for geometry, properties in features:
        clipped = (geometry if geometry.is_valid else shapely.make_valid(geometry)).intersection(window)
        if clipped.is_empty:
            continue
        if simplify_m > 0 and clipped.geom_type != "Point":
            clipped = clipped.simplify(simplify_m, preserve_topology=True)
        lonlat = shapely.transform(clipped, _metres_to_lonlat)
        out.append(
            {
                "type": "Feature",
                "properties": {name: properties[name] for name in keep if name in properties},
                "geometry": mapping(lonlat),
            }
        )
    return json.dumps({"type": "FeatureCollection", "features": out}, sort_keys=True, default=str)


def shapefile_from_zip(zip_path: Path) -> tuple[IO[bytes], IO[bytes], str]:
    if not zip_path.is_file():
        raise FileNotFoundError(f"{zip_path} is missing; {FETCH_HINT}")
    with zipfile.ZipFile(zip_path) as archive:
        names = {Path(n).suffix.lower(): n for n in archive.namelist() if Path(n).suffix.lower() in (".shp", ".dbf", ".prj")}
        if len(names) != 3:
            raise ValueError(f"{zip_path} needs .shp, .dbf and .prj files, found {sorted(names)}")
        return (
            io.BytesIO(archive.read(names[".shp"])),
            io.BytesIO(archive.read(names[".dbf"])),
            archive.read(names[".prj"]).decode("utf-8", "replace"),
        )
