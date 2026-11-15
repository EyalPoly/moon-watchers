import json
import warnings
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from api.score_config import load_configs
from api.summary_json import explain
from api.warnings import make_warning, sort_warnings
from engine.score import (
    GRADE_NAMES,
    GRADE_IDS,
    GradeInputs,
    ScorePolicy,
    dust_index,
    score_arrays,
    site_score,
)
from engine.terrain import project

POLICY = ScorePolicy(
    weights=(0.25, 0.25, 0.15, 0.15, 0.1, 0.1, 0.0),
    sun_req_h=6.0,
    slope_good_deg=0.0,
    slope_bad_deg=15.0,
    slope_max_deg=15.0,
    reject_psr=True,
    green_from=70.0,
    amber_from=40.0,
)


def inputs(**kw: float) -> GradeInputs:
    base = dict(
        sun_disk_mean=0.8,
        contact_mean=0.6,
        longest_dark_h=100.0,
        longest_no_contact_h=50.0,
        window_h=732.0,
        first_sun_h=10.0,
        slope_deg=5.0,
        dust=0.3,
        in_psr=0.0,
    )
    return GradeInputs(**{**base, **kw})


def perfect(**kw: float) -> GradeInputs:
    return inputs(
        **{
            **dict(
                sun_disk_mean=1.0,
                contact_mean=1.0,
                longest_dark_h=0.0,
                longest_no_contact_h=0.0,
                first_sun_h=10.0,
                slope_deg=0.0,
                dust=0.0,
            ),
            **kw,
        }
    )


def test_penalties_sum_to_lost_points() -> None:
    rng = np.random.default_rng(1)
    n = 1000
    w = rng.integers(0, 5, 7).astype(float)
    w[0] = 1.0
    policy = replace(POLICY, weights=tuple(w))
    x = GradeInputs(
        sun_disk_mean=rng.random(n),
        contact_mean=rng.random(n),
        longest_dark_h=rng.random(n) * 700,
        longest_no_contact_h=rng.random(n) * 700,
        window_h=np.full(n, 732.0),
        first_sun_h=rng.random(n) * 12,
        slope_deg=rng.random(n) * 15,
        dust=rng.random(n),
        in_psr=np.zeros(n),
    )
    s = score_arrays(x, policy)
    grades = np.array([s.grades[g] for g in GRADE_IDS])
    unrounded = 100 * (np.asarray(policy.weights)[:, None] * grades).sum(0) / sum(policy.weights)
    lost = sum(s.penalties[g] for g in GRADE_IDS)
    assert np.allclose(lost, 100 - unrounded, atol=1e-9)


def test_zero_weight_removes_grade() -> None:
    p0 = replace(POLICY, weights=(0.0, 0.25, 0.15, 0.15, 0.1, 0.1, 0.0))
    nan = site_score(inputs(sun_disk_mean=np.nan), p0)
    assert "NULL_GRADE:light" not in nan.codes
    assert nan.value == site_score(inputs(sun_disk_mean=0.123), p0).value


def test_null_grade_counts_zero() -> None:
    nan = site_score(inputs(sun_disk_mean=np.nan), POLICY)
    zero = site_score(inputs(sun_disk_mean=0.0), POLICY)
    assert nan.factors[0].grade == 0
    assert "NULL_GRADE:light" in nan.codes
    assert nan.value == zero.value


def test_ties_all_reported() -> None:
    p = replace(POLICY, weights=(0.5, 0.5, 0, 0, 0, 0, 0))
    r = site_score(inputs(sun_disk_mean=0.5, contact_mean=0.5), p)
    assert r.deciding == ["L", "C"]


def test_no_penalty_no_deciding() -> None:
    r = site_score(perfect(), POLICY)
    assert r.value == 100.0
    assert r.deciding == []


def test_slope_gate() -> None:
    r = site_score(inputs(slope_deg=15.5), POLICY)
    assert r.value == 0
    assert r.excluded_reason == "slope"
    assert "EXCLUDED_SLOPE" in r.codes
    assert r.factors[5].grade == 0
    assert r.deciding == []
    unknown = site_score(inputs(slope_deg=np.nan), POLICY)
    assert unknown.excluded_reason is None
    assert "NULL_GRADE:slope" in unknown.codes


def test_psr_gate() -> None:
    r = site_score(inputs(in_psr=1.0), POLICY)
    assert r.value == 0
    assert all(f.grade == 0 for f in r.factors)
    assert sum(f.points_lost for f in r.factors) == pytest.approx(100)
    assert r.excluded_reason == "psr"
    assert "EXCLUDED_PSR" in r.codes
    off = replace(POLICY, reject_psr=False)
    assert site_score(inputs(in_psr=1.0), off).excluded_reason is None
    assert site_score(inputs(in_psr=1.0), off).value > 0
    unknown = site_score(inputs(in_psr=np.nan), POLICY)
    assert "PSR_UNKNOWN" in unknown.codes and unknown.excluded_reason is None
    assert "PSR_UNKNOWN" not in site_score(inputs(in_psr=np.nan), off).codes
    both = site_score(inputs(in_psr=1.0, slope_deg=20.0), POLICY)
    assert both.excluded_reason == "psr"


def test_landing_sunlight_flips_at_requirement() -> None:
    assert site_score(inputs(first_sun_h=5.99), POLICY).factors[4].grade == 0
    assert site_score(inputs(first_sun_h=6.0), POLICY).factors[4].grade == 1
    p = replace(POLICY, sun_req_h=0.0)
    assert site_score(inputs(first_sun_h=0.0), p).factors[4].grade == 1


def test_slope_scale_step_when_equal() -> None:
    p = replace(POLICY, slope_good_deg=10.0, slope_bad_deg=10.0, slope_max_deg=90.0)
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        assert site_score(inputs(slope_deg=10.0), p).factors[5].grade == 1
        assert site_score(inputs(slope_deg=10.5), p).factors[5].grade == 0


def test_dk_ot() -> None:
    r = site_score(inputs(longest_dark_h=360.0, window_h=732.0), POLICY)
    assert r.factors[2].grade == pytest.approx(1 - 360 / 732)


def test_color_boundary() -> None:
    p = replace(POLICY, weights=(1, 0, 0, 0, 0, 0, 0))
    assert site_score(inputs(sun_disk_mean=0.6996), p).category == "green"
    assert site_score(inputs(sun_disk_mean=0.6996), p).value == 70.0
    q = replace(p, green_from=50.0, amber_from=50.0)
    assert site_score(inputs(sun_disk_mean=0.499), q).category == "red"
    assert site_score(inputs(sun_disk_mean=0.5), q).category == "green"


def test_dust_index() -> None:
    lat = np.array([-89.0, -85.0, -80.0])
    lon = np.array([0.0, 45.0, -120.0])
    d = dust_index(lat, lon)
    assert np.all((d >= 0) & (d <= 1))
    assert np.array_equal(d, dust_index(lat, lon))
    rng = np.random.default_rng(42)
    rng.uniform(0, 2 * np.pi, 6)
    p = rng.uniform(0, 2 * np.pi, 6)
    assert float(dust_index(-90.0, 0.0)) == pytest.approx(0.5 + np.sin(p).mean() / 2)
    x, y = project(-85.0, 45.0)
    assert np.isfinite(x) and np.isfinite(y)


SAMPLES = sorted((Path(__file__).parents[1] / "contract/samples/summary").glob("*.json"))


@pytest.mark.parametrize("path", SAMPLES, ids=lambda p: p.stem)
def test_summary_samples_follow_formula(path: Path) -> None:
    doc = json.loads(path.read_text())
    sc, scen = doc["score"], doc["scenario"]
    from datetime import datetime

    t0, t1 = (datetime.fromisoformat(t.replace("Z", "+00:00")) for t in doc["metrics"]["window"])
    raw = {f["name"]: np.nan if f["raw"] is None else f["raw"] for f in sc["factors"]}
    policy = ScorePolicy(
        weights=tuple(scen["w"]),
        sun_req_h=scen["sun_req"],
        slope_good_deg=scen["slope"][0],
        slope_bad_deg=scen["slope"][1],
        slope_max_deg=scen["slope"][2],
        reject_psr=bool(scen["psr"]),
        green_from=scen["colors"][0],
        amber_from=scen["colors"][1],
    )
    x = GradeInputs(
        sun_disk_mean=raw["L"],
        contact_mean=raw["C"],
        longest_dark_h=raw["DK"],
        longest_no_contact_h=raw["OT"],
        window_h=(t1 - t0).total_seconds() / 3600,
        first_sun_h=raw["LS"],
        slope_deg=raw["S"],
        dust=raw["D"],
        in_psr=np.nan,
    )
    r = site_score(x, policy)
    assert r.value == pytest.approx(sc["value"], abs=0.01)
    assert r.category == sc["category"]
    assert r.deciding == sc["deciding"]
    assert [f.points_lost for f in r.factors] == pytest.approx([f["points_lost"] for f in sc["factors"]], abs=0.01)

    configs = load_configs(Path("config"))
    labels = {GRADE_NAMES[g.id]: g.label.capitalize() for g in configs.score.grades}
    built = [
        make_warning(
            code, configs.warnings,
            label=labels[code.split(":", 1)[1]] if code.startswith("NULL_GRADE:") else "",
            slope=format(raw["S"], "g"), max=format(scen["slope"][2], "g"),
        )
        for code in r.codes
    ]
    ordered = sort_warnings(built, configs.warnings)
    assert [w["code"] for w in sc["warnings"]] == [w.code for w in ordered]
    # The sample's raw values are rounded, which can move a penalty by 0.01; use its own unrounded penalties for the text.
    factors = [replace(f, points_lost=g["points_lost"]) for f, g in zip(r.factors, sc["factors"], strict=True)]
    assert sc["explanation"] == explain(replace(r, factors=factors), configs.score.grades, ordered)


def test_only_dust_weighted() -> None:
    policy = replace(POLICY, weights=(0, 0, 0, 0, 0, 0, 1))
    nan = float("nan")
    unknown = dict(sun_disk_mean=nan, contact_mean=nan, longest_dark_h=nan, longest_no_contact_h=nan, first_sun_h=nan)
    r = site_score(inputs(dust=0.35, **unknown), policy)
    assert r.value == pytest.approx(100 * (1 - 0.35), abs=0.05)
    assert r.deciding == ["D"]
    assert not any(code.startswith("NULL_GRADE") for code in r.codes)
    clean = site_score(inputs(dust=0.0, **unknown), policy)
    assert clean.value == 100
    assert clean.deciding == []
    assert not any(code.startswith("NULL_GRADE") for code in clean.codes)
