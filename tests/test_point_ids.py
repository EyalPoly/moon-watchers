import pytest

from api.point_ids import format_point_id, in_custom_area, parse_point_id


def test_round_trip() -> None:
    assert format_point_id(-87.5, 45.0) == "pt_s87500_e045000"
    assert parse_point_id("pt_s87500_e045000") == (-87.5, 45.0)


def test_longitude_wraps() -> None:
    assert format_point_id(-89.0, 360.0) == "pt_s89000_e000000"
    assert format_point_id(-89.0, -90.0) == "pt_s89000_e270000"
    assert parse_point_id("pt_s89000_e360000") == (-89.0, 0.0)


def test_rounds_to_a_thousandth() -> None:
    assert format_point_id(-87.5004, 45.0006) == "pt_s87500_e045001"


def test_non_canonical_spelling_parses() -> None:
    assert parse_point_id("pt_s87500_e45000") == (-87.5, 45.0)


@pytest.mark.parametrize(
    "site_id",
    ["", "pt_x1_e1", "pt_s87500_e045000x", "pt_s87500_e360001", "pt_s../etc_e000000",
     "PT_s87500_e045000", "pt_s87500_e045000/", "pt_s9999999_e000000"],
)
def test_rejects_malformed_ids(site_id: str) -> None:
    assert parse_point_id(site_id) is None


def test_area() -> None:
    assert in_custom_area(-84.0, 10.0, -90.0, -84.0)
    assert not in_custom_area(-83.999, 10.0, -90.0, -84.0)
    assert in_custom_area(-90.0, 10.0, -90.0, -84.0)
