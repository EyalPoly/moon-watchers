from datetime import timedelta
from pathlib import Path

import numpy as np
import pytest

from build.fetch_horizons import BODIES, FIXTURES, parse_answer
from build.make_ephemeris import KERNELS, build_ephemeris
from engine.geometry import az_el, interpolate, observer_km

SPICE_DIR = Path("data/sources/spice")
CASES = sorted(FIXTURES.glob("*.txt"))

pytestmark = pytest.mark.skipif(
    not CASES or not all((SPICE_DIR / name).is_file() for name in KERNELS),
    reason="Horizons answers or SPICE kernels are missing",
)


def test_engine_matches_horizons(capsys: pytest.CaptureFixture[str]) -> None:
    pytest.importorskip("spiceypy")
    from build.fetch_horizons import CHECK_SITES

    tables: dict[str, object] = {}
    worst: dict[tuple[str, str], list[float]] = {}
    for path in CASES:
        site, body, _ = path.stem.split("_", 2)
        lat, lon = CHECK_SITES[site]
        rows = parse_answer(path.read_text(), body)
        moments = [r[0] for r in rows]
        key = moments[0].isoformat()
        if key not in tables:
            tables[key] = build_ephemeris(SPICE_DIR, moments[0] - timedelta(days=1), moments[-1] + timedelta(days=1))
        eph = tables[key]
        t = np.array([(m - eph.start).total_seconds() for m in moments])  # type: ignore[attr-defined]
        sky = interpolate(eph, t)  # type: ignore[arg-type]
        vectors = (sky.sun_cns_km if body == "10" else sky.earth_cns_km) - observer_km(lat, lon, 0.0, 0.0)
        az, el = az_el(vectors, lat, lon)
        h_az, h_el = np.array([r[1] for r in rows]), np.array([r[2] for r in rows])
        # Azimuth differences count by their sky distance, which shrinks near the zenith.
        d_az = ((az - h_az + 180) % 360 - 180) * np.cos(np.radians(h_el))
        separation = np.hypot(d_az, el - h_el)
        worst.setdefault((site, BODIES[body]), []).append(float(separation.max()))
    with capsys.disabled():
        for (site, name), values in sorted(worst.items()):
            print(f"horizons residual {site:5s} {name:12s} max {max(values):.5f} deg")
    assert max(max(v) for v in worst.values()) < 0.01
