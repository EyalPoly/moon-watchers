import sys
from pathlib import Path

import numpy as np
import pytest

from engine.score import GradeInputs, ScorePolicy, dust_index, score_arrays

sys.path.insert(0, str(Path(__file__).parents[1] / "MenasimMoonV3"))
try:
    from lunar_nav.models import Scoring
    from lunar_nav.scoring import MockDust, score_metrics
except ImportError:
    pytest.skip("lunar_nav is not importable (use --group reference)", allow_module_level=True)

NAMES = {"L": "light", "C": "communication", "DK": "dark_time", "OT": "outage_time",
         "LS": "landing_sunlight", "S": "slope", "D": "dust"}


def maybe_nan(rng: np.random.Generator, v: float) -> float:
    return np.nan if rng.random() < 0.1 else v


def test_matches_prototype_score_metrics() -> None:
    rng = np.random.default_rng(7)
    for _ in range(2000):
        w = rng.integers(0, 5, 7).astype(float)
        w[[0, 1, 5, 6]] += 1
        good = float(rng.integers(0, 10))
        bad = good + float(rng.integers(1, 10))
        max_slope = float(rng.integers(5, 20))
        green = float(rng.integers(50, 90))
        amber = float(rng.integers(10, int(green)))
        sun_req = float(rng.integers(0, 20))
        reject = bool(rng.random() < 0.7)
        window = 732.0
        dark, outage = rng.random() * window, rng.random() * window
        vals = dict(L=maybe_nan(rng, rng.random()), C=maybe_nan(rng, rng.random()),
                    LS=maybe_nan(rng, rng.random() * 25), S=rng.random() * 25,
                    D=maybe_nan(rng, rng.random()))
        in_psr = float(rng.random() < 0.2)
        policy = ScorePolicy(tuple(w), sun_req, good, bad, max_slope, reject, green, amber)
        ours = score_arrays(GradeInputs(vals["L"], vals["C"], dark, outage, window, vals["LS"],
                                        vals["S"], vals["D"], in_psr), policy)
        ref = score_metrics(
            {"light": vals["L"], "communication": vals["C"], "dark_time": 1 - dark / window,
             "outage_time": 1 - outage / window, "landing_sunlight_hours": vals["LS"],
             "slope_deg": vals["S"], "dust": vals["D"], "in_psr": in_psr},
            Scoring(dict(zip(NAMES.values(), w, strict=True)), good, bad, max_slope,
                    green_at=green, yellow_at=amber, required_sunlight_hours=sun_req,
                    reject_psr=reject))
        assert float(ours.value) == pytest.approx(float(ref["score"]), abs=0.05)
        assert bool(ours.excluded != "") == bool(ref["excluded"])
        ref_cat = str(ref["category"]).replace("yellow", "amber")
        if str(ours.category) != ref_cat:
            # a value within rounding of a threshold may fall either side
            assert abs(float(ref["score"]) - green) < 0.05 or abs(float(ref["score"]) - amber) < 0.05
        if not ref["excluded"]:
            from engine.score import site_score
            s = site_score(GradeInputs(vals["L"], vals["C"], dark, outage, window, vals["LS"],
                                       vals["S"], vals["D"], in_psr), policy)
            expected = [k for k, n in NAMES.items() if n in str(ref["largest_penalty"]).split(", ")]
            assert s.deciding == expected


def test_dust_matches_prototype() -> None:
    rng = np.random.default_rng(3)
    lat = -90 + rng.random(100) * 12
    lon = rng.random(100) * 360 - 180
    assert np.allclose(dust_index(lat, lon), MockDust(42).sample(lat, lon), atol=1e-12)
