import csv
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

from build.fetch_horizons import CHECK_SITES
from build.make_ephemeris import KERNELS, build_ephemeris
from engine.geometry import az_el, interpolate, observer_km

SPICE_DIR = Path("data/sources/spice")
TREK = Path(__file__).parent / "fixtures" / "trek_sun_angles.csv"

pytestmark = pytest.mark.skipif(
    not all((SPICE_DIR / name).is_file() for name in KERNELS),
    reason="SPICE kernels are missing",
)

# Sun distance is 1.5e8 km and the observer sits 1737 km from the Moon's centre, so seen from the
# surface the Sun moves by up to 1737 / 1.5e8 rad = 0.00066 degrees against a Moon-centred direction.
PARALLAX_DEG = 0.0007


def trek_rows() -> list[tuple[str, datetime, float, float]]:
    with TREK.open() as file:
        return [
            (r["site"], datetime.fromisoformat(r["utc"]), float(r["azimuth_deg"]), float(r["elevation_deg"]))
            for r in csv.DictReader(file)
        ]


def test_sun_direction_matches_moon_trek_at_both_physics_sites() -> None:
    pytest.importorskip("spiceypy")
    rows = trek_rows()
    assert len(rows) == 50
    start = min(r[1] for r in rows) - timedelta(days=1)
    end = max(r[1] for r in rows) + timedelta(days=1)
    eph = build_ephemeris(SPICE_DIR, start.astimezone(UTC), end.astimezone(UTC))
    surface_worst = center_worst = 0.0
    for site, moment, trek_az, trek_el in rows:
        lat, lon = CHECK_SITES[site]
        sun = interpolate(eph, np.array([(moment - eph.start).total_seconds()])).sun_cns_km
        for vector, kind in ((sun, "center"), (sun - observer_km(lat, lon, 0.0, 0.0), "surface")):
            az, el = az_el(vector, lat, lon)
            d_az = ((az[0] - trek_az + 180) % 360 - 180) * np.cos(np.radians(trek_el))
            separation = float(np.hypot(d_az, el[0] - trek_el))
            if kind == "center":
                center_worst = max(center_worst, separation)
            else:
                surface_worst = max(surface_worst, separation)
    # Trek returns the Moon-centred apparent direction in the local frame; our surface value
    # differs from it only by solar parallax.
    assert center_worst < 1e-4
    assert surface_worst < PARALLAX_DEG
