import importlib.util
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from engine.metrics import both_state, compute_metrics, day_bins, mission_window, runs
from engine.series import SeriesArrays
from engine.visibility import visible_state

NAN = float("nan")


def series(n: int, frac=None, contact=None, earth_any=None, earth_whole=None, earth_el=None) -> SeriesArrays:
    zeros = np.zeros(n)
    f32 = np.zeros(n, dtype=np.float32)
    return SeriesArrays(
        sun_az=zeros,
        sun_el=zeros,
        sun_vis_el=zeros,
        sun_horizon_el=zeros,
        sun_lit_frac=zeros if frac is None else np.asarray(frac, dtype=np.float64),
        earth_az=zeros,
        earth_el=zeros if earth_el is None else np.asarray(earth_el, dtype=np.float64),
        earth_vis_el=zeros,
        earth_horizon_el=zeros,
        earth_any=f32 if earth_any is None else np.asarray(earth_any, dtype=np.float32),
        earth_whole=f32 if earth_whole is None else np.asarray(earth_whole, dtype=np.float32),
        contact=f32 if contact is None else np.asarray(contact, dtype=np.float32),
        station_az=zeros,
        station_el=zeros,
        station_horizon_el=zeros,
        earth_station_up=np.zeros(n, dtype=np.bool_),
        station_moon_el=zeros,
    )


def sun(parts: list[tuple[float, int]]) -> np.ndarray:
    return np.concatenate([np.full(count, value, dtype=np.float64) for value, count in parts])


def test_mission_window():
    t0 = datetime(2027, 3, 1, tzinfo=UTC)
    w = mission_window(t0, 30, 12)
    assert w.start == datetime(2027, 2, 28, 12, tzinfo=UTC)
    assert w.n == 4392
    assert w.landing == 72
    assert mission_window(t0, 29.53, 12).n == 72 + 4252
    assert mission_window(t0, 30, 0).landing == 0


def test_day_bins_31_with_margin():
    bins = day_bins(4392)
    assert len(bins) == 31
    assert bins[-1] == (4320, 4392)
    assert bins[0] == (0, 144)


def test_runs_half_open_and_nan_never_matches():
    state = np.array([1, 1, NAN, 1, 0, 0, 1], dtype=np.float32)
    assert runs(state, 1.0) == [(0, 2), (3, 4), (6, 7)]
    assert runs(state, 0.0) == [(4, 6)]
    assert runs(np.zeros(0, dtype=np.float32), 1.0) == []


def test_partial_day_weighted():
    n = 4392
    m = compute_metrics(series(n, frac=sun([(0.0, n - 72), (1.0, 72)])), 72)
    assert m.sun_pct == pytest.approx(100 * 72 / n)
    assert m.daily_sun_pct[-1] == 100
    assert m.daily_sun_pct[0] == 0


def test_L_equals_daily_weighted_mean():
    n = 4392
    rng = np.random.default_rng(1)
    m = compute_metrics(series(n, frac=rng.random(n), contact=(rng.random(n) > 0.5)), 72)
    lengths = np.array([b - a for a, b in day_bins(n)])
    weighted = float(np.sum(m.daily_sun_disk_mean * lengths) / lengths.sum())
    assert m.sun_disk_mean == pytest.approx(weighted, abs=1e-12)
    assert m.contact_mean == pytest.approx(m.dte_pct / 100)


def test_unknown_is_not_darkness():
    n = 432
    frac = sun([(0.0, 10), (NAN, 10), (0.0, 10), (1.0, n - 30)])
    m = compute_metrics(series(n, frac=frac), 0)
    assert m.longest_dark_h == pytest.approx(10 / 6)
    assert np.isnan(m.sun_pct)
    assert np.isnan(m.sun_disk_mean)
    assert np.isnan(m.daily_sun_pct[0])
    assert np.isnan(m.daily_sun_disk_mean[0])
    assert np.isfinite(m.daily_sun_pct[1])
    assert m.unknown_h == pytest.approx(10 / 6)
    assert m.windows["unknown"] == [(10, 20)]


def test_runs_cut_at_edges():
    n = 200
    m = compute_metrics(series(n, frac=sun([(0.0, 30), (1.0, n - 30)])), 0)
    assert m.longest_dark_h == 5
    assert m.longest_dark_at_edge
    mid = compute_metrics(series(n, frac=sun([(1.0, 50), (0.0, 30), (1.0, n - 80)])), 0)
    assert mid.longest_dark_h == 5
    assert not mid.longest_dark_at_edge
    tail = compute_metrics(series(n, frac=sun([(1.0, 100), (0.0, 100)])), 0)
    assert tail.longest_dark_at_edge


def test_no_contact_edge_flags():
    n = 100
    contact = np.ones(n)
    contact[40:60] = 0
    m = compute_metrics(series(n, contact=contact), 0)
    assert m.longest_no_contact_h == pytest.approx(20 / 6)
    assert not m.longest_no_contact_at_edge
    assert compute_metrics(series(n, contact=np.zeros(n)), 0).longest_no_contact_at_edge


def test_first_sun_h():
    n = 100

    def first(frac) -> float:
        return compute_metrics(series(n, frac=frac), 0).first_sun_h

    assert first(sun([(1.0, 36), (0.0, n - 36)])) == 6.0
    assert first(sun([(0.0, 5), (1.0, n - 5)])) == 0
    assert np.isnan(first(sun([(NAN, 1), (1.0, n - 1)])))
    assert np.isnan(first(sun([(1.0, 10), (NAN, n - 10)])))
    assert first(np.ones(n)) == pytest.approx(n / 6)
    assert compute_metrics(series(n, frac=np.ones(n)), 0).window_h == pytest.approx(n / 6)


def test_first_dark_after_landing():
    n = 200

    def first(dark_at: int | None, unknown_at: int | None = None) -> float:
        frac = np.ones(n)
        if dark_at is not None:
            frac[dark_at] = 0
        if unknown_at is not None:
            frac[unknown_at] = NAN
        return compute_metrics(series(n, frac=frac), 72).first_dark_after_landing_h

    assert first(90) == 3.0
    assert first(72) == 0
    assert np.isnan(first(90, unknown_at=80))
    assert first(None) == pytest.approx((n - 72) / 6)
    assert first(10) == pytest.approx((n - 72) / 6)


def test_both_state():
    sun_state = np.array([1, 1, 0, 1], dtype=np.float32)
    contact = np.array([1, 0, NAN, NAN], dtype=np.float32)
    out = both_state(sun_state, contact)
    assert out[:3].tolist() == [1.0, 0.0, 0.0]
    assert np.isnan(out[3])
    m = compute_metrics(series(4, frac=sun_state.astype(np.float64), contact=contact), 0)
    assert np.isnan(m.both_pct)
    assert m.windows["both"] == [(0, 1)]


def test_windows_runs():
    n = 20
    frac = np.zeros(n)
    frac[3:7] = 1
    frac[15:] = 1
    m = compute_metrics(series(n, frac=frac, contact=np.ones(n)), 0)
    assert m.windows["sun"] == [(3, 7), (15, 20)]
    assert m.windows["dte"] == [(0, 20)]
    assert m.windows["both"] == [(3, 7), (15, 20)]
    assert m.windows["unknown"] == []


def test_earth_range_and_earth_pcts():
    n = 10
    el = np.linspace(-5, 40, n)
    m = compute_metrics(
        series(n, earth_el=el, earth_any=[1] * 5 + [0] * 5, earth_whole=[1] * 2 + [0] * 8), 0
    )
    assert m.earth_el_range == (-5.0, 40.0)
    assert m.earth_any_pct == 50
    assert m.earth_whole_pct == 20


def test_matches_prototype_summarize():
    path = Path(__file__).parent.parent / "MenasimMoonV2" / "lunar_nav" / "timing.py"
    if not path.exists():
        pytest.skip("prototype not present")
    spec = importlib.util.spec_from_file_location("prototype_timing", path)
    assert spec is not None and spec.loader is not None
    timing = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(timing)

    n = 4392
    rng = np.random.default_rng(7)
    for known in (True, False):
        # slowly varying states so runs are long, like real series
        base = np.repeat(rng.random(n // 36 + 1), 36)[:n]
        fraction = np.where(base > 0.5, base, 0.0)
        if not known:
            fraction[2000:2050] = NAN
        s = series(n, frac=fraction)
        m = compute_metrics(s, 72)
        state = visible_state(fraction)
        proto_states = np.where(np.isnan(state), -1, state).astype(int)
        times = np.arange(n) * 600.0
        total = times[-1]
        edges = np.r_[np.arange(0, total, 86400.0), total]
        summary = timing.summarize(times, proto_states, day_edges=edges)
        daily = [d["visible_percent"] for d in summary["daily"]]
        assert len(daily) == len(m.daily_sun_pct)
        for expected, ours in zip(daily, m.daily_sun_pct, strict=True):
            if expected is None:
                assert np.isnan(ours)
            else:
                assert ours == pytest.approx(expected, abs=100 / 144)
        assert abs(summary["longest_blocked_hours"] - m.longest_dark_h) <= 1 / 6 + 1e-9
        assert (summary["visible_fraction"] is None) == bool(np.isnan(m.sun_pct))
