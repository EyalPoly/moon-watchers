import math
from datetime import datetime, timedelta

import numpy as np

from api.bundle import Bundle
from api.models import (
    ChipColor,
    Daily,
    Grade,
    Metrics,
    Rag,
    RagChip,
    RagThresholds,
    Scenario,
    Score,
    ScoreFactor,
    ScoreSettings,
    ScoreWeights,
    Site,
    SummaryResponse,
    Warning,
    Windows,
)
from api.scenario import parse_t0
from api.score_config import Configs, is_custom
from api.series_json import _floats
from api.warnings import make_warning, sort_warnings
from engine import __version__
from engine.geometry import EARTH_ORIENTATION_OBSERVED_UNTIL, Station
from engine.horizons import mask_at_height
from engine.metrics import MissionMetrics, MissionWindow, Runs, mission_window
from engine.score import GRADE_IDS, GRADE_NAMES, GradeInputs, ScorePolicy, SiteScore, dust_index, site_score
from engine.series import STEP_S, SeriesArrays, compute_series


def mission_series(bundle: Bundle, site: Site, scenario: Scenario) -> tuple[SeriesArrays, MissionWindow]:
    window = mission_window(parse_t0(scenario.t0), scenario.days, scenario.margin)
    masks = bundle.masks[site.id]
    station = scenario.station
    arrays = compute_series(
        bundle.ephemeris,
        site.lat_deg,
        site.lon_deg,
        site.elevation_m,
        mask_at_height(masks, scenario.panel)[0].astype(np.float64),
        mask_at_height(masks, scenario.antenna)[0].astype(np.float64),
        scenario.panel,
        scenario.antenna,
        Station(station.lat_deg, station.lon_deg, station.alt_m, station.min_el_deg),
        window.start,
        window.n,
    )
    return arrays, window


def data_codes(bundle: Bundle, site_id: str, window: MissionWindow) -> list[str]:
    codes = list(bundle.warnings.get(site_id, []))
    if window.start + timedelta(seconds=window.n * STEP_S) > EARTH_ORIENTATION_OBSERVED_UNTIL:
        codes.append("EARTH_ORIENTATION_PREDICTED")
    return codes


def summary_version(bundle: Bundle) -> str:
    return f"{bundle.bundle_id}.{__version__}"


def policy_from(scenario: Scenario) -> ScorePolicy:
    return ScorePolicy(
        weights=scenario.w,
        sun_req_h=scenario.sun_req,
        slope_good_deg=scenario.slope[0],
        slope_bad_deg=scenario.slope[1],
        slope_max_deg=scenario.slope[2],
        reject_psr=scenario.psr,
        green_from=scenario.colors[0],
        amber_from=scenario.colors[1],
    )


def _g(value: float) -> str:
    return format(value, "g")


def _chip(value: float, green: bool, amber: bool, text: str, name: str, unknown_h: float) -> RagChip:
    if math.isnan(value):
        return RagChip(color="unknown", reason=f"{name} unavailable: terrain unknown for {unknown_h:.1f} h of the mission")
    color: ChipColor = "green" if green else "amber" if amber else "red"
    return RagChip(color=color, reason=text)


def rag_chips(metrics: MissionMetrics, slope_deg: float, rag: RagThresholds) -> Rag:
    green, amber = rag.pct.green_from, rag.pct.amber_from
    limits = f"(green ≥ {_g(green)}%, red < {_g(amber)}%)"

    def pct_chip(value: float, name: str, label: str) -> RagChip:
        shown = f"{value:.1f}"
        return _chip(
            value, float(shown) >= green, float(shown) >= amber,
            f"{label} {shown}% of the mission {limits}", name, metrics.unknown_h,
        )

    slope = rag.slope_deg
    color: ChipColor = "green" if slope_deg <= slope.green_max else "amber" if slope_deg <= slope.amber_max else "red"
    return Rag(
        sun=pct_chip(metrics.sun_pct, "Sun visibility", "Sun visible"),
        dte=pct_chip(metrics.dte_pct, "Earth contact", "Earth contact"),
        slope=RagChip(
            color=color,
            reason=f"Slope {_g(round(slope_deg, 1))}° (green ≤ {_g(slope.green_max)}°, red > {_g(slope.amber_max)}°)",
        ),
    )


def _raw_text(value: float) -> str:
    return "unavailable" if math.isnan(value) else _g(round(value, 2))


def explain(score: SiteScore, grades: list[Grade], warnings: list[Warning]) -> str:
    """`warnings` are the score's own; an excluded site is explained by its blocking warning."""
    by_id: dict[str, Grade] = {g.id: g for g in grades}
    excluded = next((w.text for w in warnings if w.code.startswith("EXCLUDED_")), None)
    if score.excluded_reason and excluded:
        text = excluded
    elif not score.deciding:
        text = "No grade lost points."
    else:
        factors = {f.id: f for f in score.factors}
        parts = []
        for gid in score.deciding:
            f, grade = factors[gid], by_id[gid]
            parts.append(
                f"{grade.label} ({grade.raw_label} {_raw_text(f.raw)}{grade.raw_unit}; "
                f"weight share {_g(round(f.weight_share, 4))}; lost {_g(round(f.points_lost, 2))} points)"
            )
        text = f"Deciding factor: {parts[0]}." if len(parts) == 1 else f"Tied deciding factors: {'; '.join(parts)}."
    missing = [by_id[gid].label for gid in GRADE_IDS if f"NULL_GRADE:{GRADE_NAMES[gid]}" in score.codes]
    if missing:
        text += f" Missing grades counted as 0: {', '.join(missing)}."
    return text


def _stamp(window: MissionWindow, index: int) -> str:
    return (window.start + timedelta(seconds=index * STEP_S)).strftime("%Y-%m-%dT%H:%MZ")


def _spans(window: MissionWindow, found: Runs) -> list[tuple[str, str]]:
    return [(_stamp(window, a), _stamp(window, b)) for a, b in found]


def _opt(value: float, digits: int) -> float | None:
    return None if math.isnan(value) else round(value, digits)


_RAW_DIGITS = {"L": 4, "C": 4, "DK": 2, "OT": 2, "LS": 2, "S": 2, "D": 4}


def build_summary(
    site: Site,
    scenario: Scenario,
    window: MissionWindow,
    metrics: MissionMetrics,
    data_codes: list[str],
    configs: Configs,
    version: str,
) -> SummaryResponse:
    policy = policy_from(scenario)
    in_psr = float("nan") if site.in_psr is None else float(site.in_psr)
    m = metrics
    score = site_score(
        GradeInputs(
            m.sun_disk_mean, m.contact_mean, m.longest_dark_h, m.longest_no_contact_h, m.window_h,
            m.first_sun_h, site.slope_deg, float(dust_index(site.lat_deg, site.lon_deg)), in_psr,
        ),
        policy,
    )
    grades = configs.score.grades
    labels = {GRADE_NAMES[g.id]: g.label.capitalize() for g in grades}

    def warning(code: str) -> Warning:
        label = labels.get(code.split(":", 1)[1], "") if code.startswith("NULL_GRADE:") else ""
        if code.split(":", 1)[0] not in configs.warnings:
            return Warning(
                code=code, text=f"Data warning {code}: no description available.", severity="caution", affects="all"
            )
        return make_warning(code, configs.warnings, label=label, slope=_g(site.slope_deg), max=_g(scenario.slope[2]))

    score_warnings = sort_warnings([warning(c) for c in score.codes], configs.warnings)
    everything = sort_warnings([warning(c) for c in [*data_codes, *score.codes]], configs.warnings)
    weights = dict(zip(GRADE_IDS, scenario.w, strict=True))
    return SummaryResponse(
        scenario=scenario,
        version=version,
        metrics=Metrics(
            sun_pct=_opt(m.sun_pct, 2),
            dte_pct=_opt(m.dte_pct, 2),
            both_pct=_opt(m.both_pct, 2),
            sun_disk_mean=_opt(m.sun_disk_mean, 4),
            contact_mean=_opt(m.contact_mean, 4),
            earth_any_pct=_opt(m.earth_any_pct, 2),
            earth_whole_pct=_opt(m.earth_whole_pct, 2),
            longest_dark_h=round(m.longest_dark_h, 2),
            longest_no_contact_h=round(m.longest_no_contact_h, 2),
            longest_dark_at_edge=m.longest_dark_at_edge,
            longest_no_contact_at_edge=m.longest_no_contact_at_edge,
            first_sun_h=_opt(m.first_sun_h, 2),
            first_dark_after_landing_h=_opt(m.first_dark_after_landing_h, 2),
            window=(_stamp(window, 0), _stamp(window, window.n)),
            earth_el_range=(round(m.earth_el_range[0], 2), round(m.earth_el_range[1], 2)),
            unknown_h=round(m.unknown_h, 2),
        ),
        rag=rag_chips(m, site.slope_deg, configs.rag),
        score=Score(
            value=score.value,
            category=score.category,  # type: ignore[arg-type]
            status=configs.score.status,
            weights=ScoreWeights(**weights),
            factors=[
                ScoreFactor(
                    name=f.id,  # type: ignore[arg-type]
                    weight=f.weight,
                    weight_share=round(f.weight_share, 4),
                    raw=_opt(f.raw, _RAW_DIGITS[f.id]),
                    grade=round(f.grade, 4),
                    points_lost=round(f.points_lost, 2),
                )
                for f in score.factors
            ],
            deciding=score.deciding,  # type: ignore[arg-type]
            excluded_reason=score.excluded_reason,  # type: ignore[arg-type]
            settings=ScoreSettings(
                sun_req_h=scenario.sun_req,
                slope_deg=scenario.slope,
                reject_psr=scenario.psr,
                margin_h=scenario.margin,
                colors=scenario.colors,
                custom=is_custom(scenario, configs.score),
            ),
            warnings=score_warnings,
            explanation=explain(score, grades, score_warnings),
            formula=configs.score.formula,
        ),
        windows=Windows(**{key: _spans(window, found) for key, found in m.windows.items()}),
        daily=Daily(
            sun_pct=_floats(m.daily_sun_pct, 2),
            dte_pct=_floats(m.daily_dte_pct, 2),
            sun_disk_mean=_floats(m.daily_sun_disk_mean, 4),
        ),
        warnings=everything,
    )


def span_text(start: datetime, rows: int, step_s: int) -> str:
    end = start + timedelta(seconds=(rows - 1) * step_s)
    return f"{start:%Y-%m-%d} to {end:%Y-%m-%d}"
