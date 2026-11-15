"""Builds the draft catalog: IAU feature centres plus a few cited mission sites, with
elevation and slope read from NASA's published 20 m LOLA rasters (remote range reads)."""

import argparse
import sys
from dataclasses import dataclass
from typing import Any
from pathlib import Path

import numpy as np
import rasterio
import yaml
from rasterio.windows import Window

from engine.terrain import project

PGDA = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"
DEM = f"{PGDA}/LDEM_80S_20MPP_ADJ.TIF"
SLOPE = f"{PGDA}/LDSM_80S_20MPP_ADJ.TIF"
PGDA_URL = "https://pgda.gsfc.nasa.gov/products/90"
HALF_WINDOW_PX = 3


@dataclass(frozen=True)
class Extra:
    id: str
    name: str
    category: str
    lat: float
    lon: float
    url: str


# Coordinates as published; each URL is where they come from.
EXTRAS = (
    Extra(
        "connecting_ridge_site", "Connecting Ridge candidate site", "ridge", -89.53432, 209.94767,
        "https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf",
    ),
    Extra(
        "peak_near_shackleton_site", "Peak Near Shackleton candidate site", "ridge", -89.01701, 126.27302,
        "https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf",
    ),
    Extra(
        "im2_mons_mouton_landing", "IM-2 Athena landing, Mons Mouton", "massif", -84.7906, 29.1957,
        "https://en.wikipedia.org/wiki/IM-2",
    ),
    Extra(
        "lcross_impact_cabeus", "LCROSS Centaur impact, Cabeus", "crater floor", -84.675, 311.275,
        "https://sci.esa.int/web/smart-1/-/45692-new-lcross-impact-target-cabeus",
    ),
)

# IAU south-polar features worth listing: landable terrain and the named craters of the pole.
IAU_FEATURES = {
    "Mons Mouton": "massif", "Mons Malapert": "massif", "Mons Kocher": "massif",
    "Amundsen": "crater floor", "Cabeus": "crater floor", "Nobile": "crater floor",
    "Malapert": "crater floor", "Shoemaker": "crater floor", "Haworth": "crater floor",
    "Henson": "crater floor", "Faustini": "crater floor", "Wiechert": "crater floor",
    "Sverdrup": "crater floor", "de Gerlache": "crater floor", "Slater": "crater floor",
    "Kocher": "crater floor", "Burbidge": "crater floor", "Shackleton": "crater floor",
    "Whitaker": "crater floor", "Cartwright": "crater floor", "Haynes": "crater floor",
    "Brill": "crater floor", "Stose": "crater floor", "Kuhn": "crater floor",
    "Spudis": "crater floor", "Ibn Bajja": "crater floor",
}


def slug(name: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_")


def sample(ds: rasterio.DatasetReader, x: float, y: float) -> float:
    """Bilinear value at map point (x, y) from a small window."""
    t = ds.transform
    col = (x - t.c) / t.a - 0.5
    row = (y - t.f) / t.e - 0.5
    c0, r0 = int(np.floor(col)), int(np.floor(row))
    window = Window(c0 - HALF_WINDOW_PX, r0 - HALF_WINDOW_PX, 2 * HALF_WINDOW_PX + 2, 2 * HALF_WINDOW_PX + 2)
    data = ds.read(1, window=window).astype(np.float64)
    fc, fr = col - c0, row - r0
    i, j = HALF_WINDOW_PX, HALF_WINDOW_PX
    cell = data[j : j + 2, i : i + 2]
    weights = np.array([[(1 - fr) * (1 - fc), (1 - fr) * fc], [fr * (1 - fc), fr * fc]])
    if not np.isfinite(cell).all():
        return float("nan")
    return float((cell * weights).sum())


def iau_rows(shp: Path) -> list[dict[str, Any]]:
    import shapefile  # type: ignore[import-not-found]  # pyshp serves only this one-off tool

    reader = shapefile.Reader(str(shp))
    names = [f[0] for f in reader.fields][1:]
    found: dict[str, dict[str, Any]] = {}
    for record in reader.records():
        row = dict(zip(names, record, strict=True))
        if row["approval"] == "Adopted by IAU" and row["name"] in IAU_FEATURES:
            found[str(row["name"])] = row
    missing = set(IAU_FEATURES) - set(found)
    if missing:
        raise SystemExit(f"not in the IAU file: {sorted(missing)}")
    return [found[name] for name in IAU_FEATURES]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="build.draft_catalog")
    parser.add_argument("--iau-shp", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    points: list[tuple[str, str, str, float, float, str]] = []
    for row in iau_rows(args.iau_shp):
        name = str(row["name"])
        points.append(
            (slug(name), name, IAU_FEATURES[name], float(row["center_lat"]), float(row["center_lon"]), str(row["link"]).replace("http://", "https://", 1))
        )
    points += [(e.id, e.name, e.category, e.lat, e.lon, e.url) for e in EXTRAS]
    sites: list[dict[str, object]] = []
    with rasterio.open(DEM) as dem, rasterio.open(SLOPE) as slope:
        for site_id, name, category, lat, lon, url in points:
            px, py = project(lat, lon)
            x, y = float(px), float(py)
            elevation, slope_deg = sample(dem, x, y), sample(slope, x, y)
            print(f"{site_id:28} {lat:9.4f} {lon:9.4f} elev {elevation:9.1f} slope {slope_deg:6.2f}", flush=True)
            if not (np.isfinite(elevation) and np.isfinite(slope_deg)):
                raise SystemExit(f"{site_id}: no raster value at the site")
            sites.append(
                {
                    "id": site_id, "name": name, "source": "catalog", "category": category,
                    "region": "south_pole", "lat_deg": round(lat, 5), "lon_deg": round(lon, 5),
                    "elevation_m": round(elevation, 1), "slope_deg": round(slope_deg, 2),
                    "slope_resolution_m": 20, "source_url": url, "is_placeholder": False,
                }
            )
    header = (
        "# DRAFT catalog for the physics team to confirm. Positions are IAU feature centres or the cited\n"
        "# mission sites; elevation and slope are read from NASA PGDA LOLA product 90 (LDEM and LDSM, 20 m).\n"
        "# Crater-floor entries are the crater centres, many of them permanently shadowed.\n"
    )
    args.out.write_text(header + yaml.safe_dump({"sites": sites}, sort_keys=False, allow_unicode=True))
    print(f"{len(sites)} sites -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
