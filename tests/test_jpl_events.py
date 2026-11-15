import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

from build.fetch_horizons import CHECK_SITES, EVENT_SITE, FIXTURES, parse_answer
from build.make_ephemeris import KERNELS, build_ephemeris
from engine.geometry import EARTH_RADIUS_KM, SUN_RADIUS_KM, angular_radius_deg, interpolate, observer_km

SPICE_DIR = Path("data/sources/spice")
EVENTS = FIXTURES / "events"

pytestmark = pytest.mark.skipif(
    not (EVENTS / "events.json").is_file() or not all((SPICE_DIR / name).is_file() for name in KERNELS),
    reason="event answers or SPICE kernels are missing",
)


def test_window_edges_match_horizons(capsys: pytest.CaptureFixture[str]) -> None:
    pytest.importorskip("spiceypy")
    lat, lon = CHECK_SITES[EVENT_SITE]
    events = json.loads((EVENTS / "events.json").read_text())
    eph = build_ephemeris(SPICE_DIR, datetime(2027, 2, 27, tzinfo=UTC), datetime(2027, 5, 3, tzinfo=UTC))
    differences: list[tuple[str, str, str, float]] = []
    for event in events:
        body, kind = event["body"], event["kind"]
        engine_utc = datetime.fromisoformat(event["engine_utc"])
        path = EVENTS / f"{body}_{engine_utc:%Y%m%dT%H%M}.txt"
        rows = parse_answer(path.read_text(), body, 61)
        moments = [r[0] for r in rows]
        t = np.array([(m - eph.start).total_seconds() for m in moments])
        sky = interpolate(eph, t)
        vector = (sky.sun_cns_km if body == "10" else sky.earth_cns_km) - observer_km(lat, lon, 0.0, 0.0)
        radius = angular_radius_deg(SUN_RADIUS_KM if body == "10" else EARTH_RADIUS_KM, vector)
        upper = np.array([r[2] for r in rows]) + radius
        crossing = None
        for i in range(len(rows) - 1):
            if (upper[i] > 0) != (upper[i + 1] > 0):
                fraction = upper[i] / (upper[i] - upper[i + 1])
                crossing = moments[i] + timedelta(seconds=60 * fraction)
                break
        assert crossing is not None, f"no crossing in {path.name}"
        difference = (engine_utc - crossing).total_seconds()
        differences.append((body, kind, engine_utc.isoformat(), difference))
        assert -60 <= difference < 660, f"{path.name}: {difference:.0f} s"
    with capsys.disabled():
        for body, kind, when, difference in differences:
            print(f"window edge {'Sun' if body == '10' else 'Earth':5s} {kind:4s} {when} engine - Horizons {difference:6.1f} s")
    assert sum(d[0] == "10" for d in differences) >= 2
    assert sum(d[0] == "399" for d in differences) >= 2
