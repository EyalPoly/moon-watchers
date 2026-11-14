from pathlib import Path

import pytest
from pydantic import ValidationError

from api.models import CustomArea, Health, Meta, Problem

SAMPLES = Path("contract/samples")


def test_meta_sample_validates() -> None:
    meta = Meta.model_validate_json((SAMPLES / "meta.json").read_text())
    assert meta.limits.max_cards == 3
    assert meta.regions[0].custom_area == CustomArea(min_lat_deg=-90, max_lat_deg=-84)


def test_health_sample_validates() -> None:
    health = Health.model_validate_json((SAMPLES / "health.json").read_text())
    assert health.status == "ok"


def test_problem_rejects_unknown_code() -> None:
    with pytest.raises(ValidationError):
        Problem.model_validate(
            {"type": "about:blank", "title": "x", "status": 400, "code": "NOPE", "detail": None}
        )
