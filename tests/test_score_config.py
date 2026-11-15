import shutil
from pathlib import Path

import pytest

from api.models import Meta, Scenario, StationPoint
from api.score_config import Configs, is_custom, load_configs
from api.warnings import make_warning, sort_warnings


@pytest.fixture(scope="module")
def configs() -> Configs:
    return load_configs()


def scenario(**overrides: object) -> Scenario:
    data: dict[str, object] = {
        "site": "sample_a",
        "t0": "2027-03-01T00:00Z",
        "days": 30,
        "panel": 2,
        "antenna": 3,
        "station": StationPoint(lat_deg=29.7604, lon_deg=-95.3698, alt_m=0, min_el_deg=0),
        "w": (0.25, 0.25, 0.15, 0.15, 0.1, 0.1, 0),
        "sun_req": 6,
        "slope": (0, 15, 15),
        "psr": True,
        "margin": 12,
        "colors": (70, 40),
    }
    data.update(overrides)
    return Scenario.model_validate(data)


def test_configs_load(configs: Configs) -> None:
    score = configs.score
    assert [g.id for g in score.grades] == ["L", "C", "DK", "OT", "LS", "S", "D"]
    assert [s.key for s in score.settings] == ["w", "sun_req", "slope", "psr", "margin", "colors"]
    assert len(score.presets) == 2
    for spec in score.settings:
        for value in spec.default:
            assert spec.min <= value <= spec.max
            steps = (value - spec.min) / spec.step
            assert abs(steps - round(steps)) < 1e-9


def test_meta_sample_matches_config(configs: Configs) -> None:
    meta = Meta.model_validate_json(Path("contract/samples/meta.json").read_text())
    assert meta.score == configs.score
    assert meta.rag == configs.rag
    assert meta.warning_catalog == list(configs.warnings.values())


def test_bad_config_names_file(tmp_path: Path) -> None:
    for name in ("score.yaml", "rag.yaml", "warnings.yaml"):
        shutil.copy(Path("config") / name, tmp_path / name)
    text = (tmp_path / "score.yaml").read_text().replace("step: 0.05", "step: 0")
    (tmp_path / "score.yaml").write_text(text)
    with pytest.raises(ValueError, match=r"score\.yaml"):
        load_configs(tmp_path)


def test_make_warning_fills_and_keeps_suffix(configs: Configs) -> None:
    warning = make_warning("NULL_GRADE:light", configs.warnings, label="Sunlight")
    assert warning.code == "NULL_GRADE:light"
    assert warning.severity == "caution"
    assert warning.text.startswith("Sunlight could not be computed")


def test_make_warning_unknown_code_raises(configs: Configs) -> None:
    with pytest.raises(KeyError):
        make_warning("NOPE", configs.warnings)


def test_sort_warnings(configs: Configs) -> None:
    codes = ["PSR_UNKNOWN", "EXCLUDED_SLOPE", "DEM_GAPS", "DEM_GAPS"]
    items = [make_warning(c, configs.warnings, slope="20", max="15") for c in codes]
    ordered = sort_warnings(items, configs.warnings)
    assert [w.code for w in ordered] == ["EXCLUDED_SLOPE", "DEM_GAPS", "PSR_UNKNOWN"]


def test_is_custom(configs: Configs) -> None:
    assert not is_custom(scenario(), configs.score)
    assert is_custom(scenario(margin=0), configs.score)
    assert not is_custom(scenario(days=10), configs.score)


def test_settings_config_matches_scenario_validators(configs: Configs) -> None:
    import inspect

    from api import scenario as sc
    from api.errors import ApiError

    spec = {s.key: s for s in configs.score.settings}
    defaults = {k: v.default for k, v in spec.items()}
    sig = inspect.signature(sc.scenario_params).parameters

    assert sc.parse_weights(sc.DEFAULT_W) == tuple(defaults["w"])
    assert sc.parse_slope(sc.DEFAULT_SLOPE) == tuple(defaults["slope"])
    assert sc.parse_colors(sc.DEFAULT_COLORS) == tuple(defaults["colors"])
    assert [sig["sun_req"].default] == defaults["sun_req"]
    assert [sig["psr"].default] == defaults["psr"]
    assert [sig["margin"].default] == defaults["margin"]

    assert (spec["sun_req"].min, spec["sun_req"].max) == sc.SUN_REQ_RANGE
    assert (spec["psr"].min, spec["psr"].max) == sc.PSR_RANGE
    assert (spec["margin"].min, spec["margin"].max) == sc.MARGIN_RANGE

    def accepts(parse: object, text: str) -> bool:
        try:
            parse(text)  # type: ignore[operator]
        except ApiError:
            return False
        return True

    w = spec["w"]
    assert accepts(sc.parse_weights, f"{w.max},{w.min},{w.min},{w.min},{w.min},{w.min},{w.min}")
    assert not accepts(sc.parse_weights, f"{w.max + w.step},{w.min},{w.min},{w.min},{w.min},{w.min},{w.min}")
    assert not accepts(sc.parse_weights, f"{w.step / 2},{w.min},{w.min},{w.min},{w.min},{w.min},{w.min}")
    s = spec["slope"]
    assert accepts(sc.parse_slope, f"{s.min},{s.max},{s.max}")
    assert not accepts(sc.parse_slope, f"{s.min},{s.max + s.step},{s.max}")
    assert not accepts(sc.parse_slope, f"{s.min},{s.min + s.step / 2},{s.max}")
    c = spec["colors"]
    assert accepts(sc.parse_colors, f"{c.max:g},{c.min:g}")
    assert not accepts(sc.parse_colors, f"{c.max + c.step:g},{c.min:g}")
    assert not accepts(sc.parse_colors, f"{c.max:g},{c.min - c.step:g}")
    assert sc.check_sun_req(spec["sun_req"].step) == spec["sun_req"].step
    with pytest.raises(ApiError):
        sc.check_sun_req(spec["sun_req"].step / 2)
