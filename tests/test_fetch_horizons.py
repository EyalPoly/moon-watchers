from datetime import UTC, datetime

import pytest

from build.fetch_horizons import expected_rows, flat_events, horizons_url, parse_answer
from tests.ephemeris_helpers import synthetic_ephemeris


def answer(target: str = "Sun (10)", center: str = "Moon (301)", rows: int = 3) -> str:
    table = "\n".join(
        f"2026-Mar-01 {h:02d}:00, , ,{100 + h:.4f}, {1.5 - h / 10:.4f}," for h in range(rows)
    )
    return (
        f"Target body name: {target}   {{source: DE441}}\n"
        f"Center body name: {center}   {{source: DE441}}\n"
        "Date__(UT)__HR:MN, , , Azi_(a-app), Elev_(a-app),\n$$SOE\n" + table + "\n$$EOE\n"
    )


def test_url_has_recipe() -> None:
    url = horizons_url(-89.0, 8.0, "10", "2026-03-01", "2026-03-03")
    for fragment in (
        "OBJ_DATA='NO'", "MAKE_EPHEM='YES'", "EPHEM_TYPE='OBSERVER'", "CENTER='coord@301'",
        "COORD_TYPE='GEODETIC'", "STEP_SIZE='1h'", "QUANTITIES='4'", "APPARENT='AIRLESS'",
        "EXTRA_PREC='YES'", "COMMAND='10'", "CSV_FORMAT='YES'", "ANG_FORMAT='DEG'",
    ):
        assert fragment in url, fragment
    assert "SITE_COORD='8,-89,0'" in url  # east longitude first
    assert horizons_url(-89.0, 8.0, "399", "a", "b").endswith("COMMAND='399'")


def test_parse_reads_rows() -> None:
    rows = parse_answer(answer(), "10", 3)
    assert [round(r[1], 1) for r in rows] == [100.0, 101.0, 102.0]
    assert rows[0][0].isoformat() == "2026-03-01T00:00:00+00:00"
    assert rows[2][2] == pytest.approx(1.3)


def test_parse_rejects_wrong_target() -> None:
    with pytest.raises(ValueError, match="target"):
        parse_answer(answer(target="Mars (499)"), "10")
    with pytest.raises(ValueError, match="target"):
        parse_answer(answer(), "399")


def test_parse_rejects_wrong_center() -> None:
    with pytest.raises(ValueError, match="center"):
        parse_answer(answer(center="Earth (399)"), "10")


def test_parse_rejects_short_table() -> None:
    with pytest.raises(ValueError, match="expected 49 rows"):
        parse_answer(answer(rows=3), "10", 49)
    with pytest.raises(ValueError):
        parse_answer("Target body name: Sun (10)\nCenter body name: Moon (301)\nerror text", "10")


def test_expected_rows() -> None:
    assert expected_rows("2026-03-01", "2026-03-03") == 49


def test_url_step() -> None:
    assert "STEP_SIZE='1m'" in horizons_url(-85.0, 120.0, "10", "2027-03-01 12:00", "2027-03-01 13:00", "1m")
    assert "STEP_SIZE='1h'" in horizons_url(-85.0, 120.0, "10", "a", "b")
    assert expected_rows("2027-03-01 12:00", "2027-03-01 13:00", 1) == 61


def test_flat_events_on_synthetic() -> None:
    eph = synthetic_ephemeris(datetime(2027, 2, 27, tzinfo=UTC), 35)
    start = datetime(2027, 2, 28, tzinfo=UTC)
    # Stops before day 29.5, where the synthetic Sun passes behind the fixed Earth and adds a dip.
    events = [e for e in flat_events(eph, -85.0, 0.0, start, 25 * 144) if e[0] == "10"]
    assert [kind for _, kind, _ in events] == ["set", "rise"]
    for _, _, moment in events:
        assert (moment - start).total_seconds() % 600 == 0
