from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
from numpy.typing import NDArray

from engine.series import STEP_S, STEPS_PER_DAY, SeriesArrays
from engine.visibility import visible_state

F32 = NDArray[np.float32]
F64 = NDArray[np.float64]
Runs = list[tuple[int, int]]

STEPS_PER_HOUR = 3600 // STEP_S


@dataclass(frozen=True)
class MissionWindow:
    start: datetime
    n: int
    landing: int


@dataclass(frozen=True)
class MissionMetrics:
    sun_pct: float
    dte_pct: float
    both_pct: float
    sun_disk_mean: float
    contact_mean: float
    earth_any_pct: float
    earth_whole_pct: float
    longest_dark_h: float
    longest_no_contact_h: float
    longest_dark_at_edge: bool
    longest_no_contact_at_edge: bool
    first_sun_h: float
    first_dark_after_landing_h: float
    earth_el_range: tuple[float, float]
    unknown_h: float
    window_h: float
    windows: dict[str, Runs]
    daily_sun_pct: F64
    daily_dte_pct: F64
    daily_sun_disk_mean: F64


def mission_window(t0: datetime, days: float, margin_h: int) -> MissionWindow:
    landing = margin_h * STEPS_PER_HOUR
    return MissionWindow(
        start=t0 - timedelta(hours=margin_h),
        n=landing + int(days * STEPS_PER_DAY + 0.5),
        landing=landing,
    )


def runs(state: F32, value: float) -> Runs:
    """Half-open index runs where state == value; NaN never matches."""
    match = np.concatenate(([False], state == value, [False]))
    edges = np.flatnonzero(match[1:] != match[:-1])
    return [(int(a), int(b)) for a, b in zip(edges[::2], edges[1::2], strict=True)]


def day_bins(n: int) -> Runs:
    return [(a, min(a + STEPS_PER_DAY, n)) for a in range(0, n, STEPS_PER_DAY)]


def both_state(sun: F32, contact: F32) -> F32:
    """1 where both are 1, 0 where either is 0, unknown otherwise."""
    out: F32 = np.where(
        (sun == 0) | (contact == 0), 0.0, np.where((sun == 1) & (contact == 1), 1.0, np.nan)
    ).astype(np.float32)
    return out


def _mean_or_nan(values: F64) -> float:
    return float("nan") if values.size == 0 or bool(np.isnan(values).any()) else float(values.mean())


def _pct(state: F64) -> float:
    return float("nan") if np.isnan(state).any() else 100 * float(np.mean(state == 1))


def _daily(values: F64, bins: Runs, reducer: Callable[[F64], float]) -> F64:
    return np.array([reducer(values[a:b]) for a, b in bins], dtype=np.float64)


def _longest(state: F32, value: float) -> tuple[float, bool]:
    found = runs(state, value)
    if not found:
        return 0.0, False
    a, b = max(found, key=lambda r: r[1] - r[0])
    return (b - a) / STEPS_PER_HOUR, a == 0 or b == state.shape[0]


def _first_sun_h(sun: F32) -> float:
    n = len(sun)
    not_lit = np.flatnonzero(sun != 1)
    if not_lit.size == 0:
        return n / STEPS_PER_HOUR
    first = int(not_lit[0])
    return float("nan") if np.isnan(sun[first]) else first / STEPS_PER_HOUR


def _first_dark_after_landing_h(sun: F32, landing: int) -> float:
    tail = sun[landing:]
    not_lit = np.flatnonzero(tail != 1)
    if not_lit.size == 0:
        return len(tail) / STEPS_PER_HOUR
    first = int(not_lit[0])
    return float("nan") if np.isnan(tail[first]) else first / STEPS_PER_HOUR


def compute_metrics(s: SeriesArrays, landing: int) -> MissionMetrics:
    n = s.sun_lit_frac.shape[0]
    sun = visible_state(s.sun_lit_frac)
    contact = s.contact
    both = both_state(sun, contact)
    bins = day_bins(n)
    dark_h, dark_edge = _longest(sun, 0.0)
    no_contact_h, no_contact_edge = _longest(contact, 0.0)
    unknown = np.isnan(sun) | np.isnan(contact)
    return MissionMetrics(
        sun_pct=_pct(sun.astype(np.float64)),
        dte_pct=_pct(contact.astype(np.float64)),
        both_pct=_pct(both.astype(np.float64)),
        sun_disk_mean=_mean_or_nan(s.sun_lit_frac),
        contact_mean=_mean_or_nan(contact.astype(np.float64)),
        earth_any_pct=_pct(s.earth_any.astype(np.float64)),
        earth_whole_pct=_pct(s.earth_whole.astype(np.float64)),
        longest_dark_h=dark_h,
        longest_no_contact_h=no_contact_h,
        longest_dark_at_edge=dark_edge,
        longest_no_contact_at_edge=no_contact_edge,
        first_sun_h=_first_sun_h(sun),
        first_dark_after_landing_h=_first_dark_after_landing_h(sun, landing),
        earth_el_range=(float(np.min(s.earth_el)), float(np.max(s.earth_el))),
        unknown_h=float(unknown.sum()) / STEPS_PER_HOUR,
        window_h=n / STEPS_PER_HOUR,
        windows={
            "sun": runs(sun, 1.0),
            "dte": runs(contact, 1.0),
            "both": runs(both, 1.0),
            "unknown": runs(unknown.astype(np.float32), 1.0),
        },
        daily_sun_pct=_daily(sun.astype(np.float64), bins, _pct),
        daily_dte_pct=_daily(contact.astype(np.float64), bins, _pct),
        daily_sun_disk_mean=_daily(s.sun_lit_frac, bins, _mean_or_nan),
    )
