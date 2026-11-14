"""The V2 landing-site score: grades, gates, penalties and the simulated dust index."""

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

from engine.terrain import project

GRADE_IDS = ("L", "C", "DK", "OT", "LS", "S", "D")
GRADE_NAMES = {
    "L": "light",
    "C": "communication",
    "DK": "dark_time",
    "OT": "outage_time",
    "LS": "landing_sunlight",
    "S": "slope",
    "D": "dust",
}

DUST_SEED = 42
DUST_MODES = 6
DUST_SCALE_M = 5_000.0

PENALTY_TIE = 1e-9
NO_PENALTY = 1e-10

Array = NDArray[np.float64]


def dust_index(lat_deg: ArrayLike, lon_deg: ArrayLike) -> Array:
    rng = np.random.default_rng(DUST_SEED)
    angles = rng.uniform(0, 2 * np.pi, DUST_MODES)
    phases = rng.uniform(0, 2 * np.pi, DUST_MODES)
    x, y = project(lat_deg, lon_deg)
    waves = np.sin(
        x[..., None] / DUST_SCALE_M * np.cos(angles)
        + y[..., None] / DUST_SCALE_M * np.sin(angles)
        + phases
    )
    return np.clip(0.5 + waves.mean(axis=-1) / 2, 0.0, 1.0)


@dataclass(frozen=True)
class ScorePolicy:
    weights: tuple[float, ...]
    sun_req_h: float
    slope_good_deg: float
    slope_bad_deg: float
    slope_max_deg: float
    reject_psr: bool
    green_from: float
    amber_from: float


@dataclass(frozen=True)
class GradeInputs:
    sun_disk_mean: ArrayLike
    contact_mean: ArrayLike
    longest_dark_h: ArrayLike
    longest_no_contact_h: ArrayLike
    window_h: ArrayLike
    first_sun_h: ArrayLike
    slope_deg: ArrayLike
    dust: ArrayLike
    in_psr: ArrayLike


def raw_grades(x: GradeInputs, policy: ScorePolicy) -> dict[str, Array]:
    def f(v: ArrayLike) -> Array:
        return np.asarray(v, dtype=np.float64)

    window = f(x.window_h)
    slope = f(x.slope_deg)
    first_sun = f(x.first_sun_h)
    good, bad = policy.slope_good_deg, policy.slope_bad_deg
    with np.errstate(divide="ignore", invalid="ignore"):
        if bad > good:
            slope_grade = np.clip((bad - slope) / (bad - good), 0.0, 1.0)
        else:
            slope_grade = np.where(slope <= good, 1.0, 0.0)
        slope_grade = np.where(np.isnan(slope), np.nan, slope_grade)
        dark = np.clip(1.0 - f(x.longest_dark_h) / window, 0.0, 1.0)
        outage = np.clip(1.0 - f(x.longest_no_contact_h) / window, 0.0, 1.0)
    landing = np.where(np.isnan(first_sun), np.nan, (first_sun >= policy.sun_req_h).astype(np.float64))
    return {
        "L": f(x.sun_disk_mean),
        "C": f(x.contact_mean),
        "DK": dark,
        "OT": outage,
        "LS": landing,
        "S": slope_grade,
        "D": np.clip(1.0 - f(x.dust), 0.0, 1.0),
    }


@dataclass(frozen=True)
class ScoreArrays:
    value: Array
    raw: dict[str, Array]
    grades: dict[str, Array]
    penalties: dict[str, Array]
    excluded: NDArray[np.str_]
    category: NDArray[np.str_]
    null_grades: dict[str, NDArray[np.bool_]]
    psr_unknown: NDArray[np.bool_]


def score_arrays(x: GradeInputs, policy: ScorePolicy) -> ScoreArrays:
    weights = np.asarray(policy.weights, dtype=np.float64)
    shares = weights / weights.sum()
    nominal = raw_grades(x, policy)
    in_psr = np.asarray(x.in_psr, dtype=np.float64)
    slope = np.asarray(x.slope_deg, dtype=np.float64)
    shape = np.broadcast_shapes(*(g.shape for g in nominal.values()), in_psr.shape)

    psr_hit = np.broadcast_to(policy.reject_psr & (in_psr == 1), shape)
    slope_hit = np.broadcast_to(slope > policy.slope_max_deg, shape)
    excluded = np.where(psr_hit, "psr", np.where(slope_hit, "slope", ""))

    grades: dict[str, Array] = {}
    penalties: dict[str, Array] = {}
    null_grades: dict[str, NDArray[np.bool_]] = {}
    total = np.zeros(shape)
    for share, weight, gid in zip(shares, weights, GRADE_IDS, strict=True):
        grade = np.broadcast_to(nominal[gid], shape)
        if weight > 0:
            null_grades[gid] = np.isnan(grade)
        used = np.where(psr_hit | np.isnan(grade), 0.0, grade)
        grades[gid] = used
        penalties[gid] = 100.0 * share * (1.0 - used)
        total = total + 100.0 * share * used

    value = np.where(excluded != "", 0.0, np.round(total, 1))
    category = np.where(
        value >= policy.green_from,
        "green",
        np.where(value >= policy.amber_from, "amber", "red"),
    )
    category = np.where(excluded != "", "excluded", category)
    raw = {
        "L": np.asarray(x.sun_disk_mean, dtype=np.float64),
        "C": np.asarray(x.contact_mean, dtype=np.float64),
        "DK": np.asarray(x.longest_dark_h, dtype=np.float64),
        "OT": np.asarray(x.longest_no_contact_h, dtype=np.float64),
        "LS": np.asarray(x.first_sun_h, dtype=np.float64),
        "S": slope,
        "D": np.asarray(x.dust, dtype=np.float64),
    }
    return ScoreArrays(
        value=value,
        raw={k: np.broadcast_to(v, shape) for k, v in raw.items()},
        grades=grades,
        penalties=penalties,
        excluded=excluded,
        category=category,
        null_grades=null_grades,
        psr_unknown=np.broadcast_to(policy.reject_psr & np.isnan(in_psr), shape),
    )


@dataclass(frozen=True)
class Factor:
    id: str
    weight: float
    weight_share: float
    raw: float
    grade: float
    points_lost: float


@dataclass(frozen=True)
class SiteScore:
    value: float
    category: str
    factors: list[Factor]
    deciding: list[str]
    excluded_reason: str | None
    codes: list[str]


def site_score(x: GradeInputs, policy: ScorePolicy) -> SiteScore:
    s = score_arrays(x, policy)
    total = sum(policy.weights)
    factors = [
        Factor(
            id=gid,
            weight=float(w),
            weight_share=float(w) / total,
            raw=float(s.raw[gid]),
            grade=float(s.grades[gid]),
            points_lost=float(s.penalties[gid]),
        )
        for gid, w in zip(GRADE_IDS, policy.weights, strict=True)
    ]
    excluded = str(s.excluded)
    biggest = max(f.points_lost for f in factors)
    deciding = (
        []
        if excluded or biggest <= NO_PENALTY
        else [f.id for f in factors if abs(f.points_lost - biggest) <= PENALTY_TIE]
    )
    codes = [f"NULL_GRADE:{GRADE_NAMES[gid]}" for gid in GRADE_IDS if gid in s.null_grades and bool(s.null_grades[gid])]
    if bool(s.psr_unknown):
        codes.append("PSR_UNKNOWN")
    if excluded:
        codes.append(f"EXCLUDED_{excluded.upper()}")
    return SiteScore(
        value=float(s.value),
        category=str(s.category),
        factors=factors,
        deciding=deciding,
        excluded_reason=excluded or None,
        codes=codes,
    )
