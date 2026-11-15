import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from api.bundle import BundleError, load_bundle, newest_bundle
from api.catalog import load_catalog
from api.errors import ApiError
from api.models import Scenario, SeriesResponse
from api.scenario import (
    DAYS_RANGE,
    DEFAULT_COLORS,
    DEFAULT_SLOPE,
    DEFAULT_STATION,
    DEFAULT_W,
    MARGIN_RANGE,
    PSR_RANGE,
    SUN_REQ_RANGE,
    check_height,
    check_sun_req,
    parse_station,
    scenario_params,
    station_text,
)
from api.score_config import load_configs
from api.series_json import series_response, site_series
from api.summary_json import build_summary, data_codes, mission_series, summary_version
from engine.geometry import OutOfRange
from engine.metrics import compute_metrics, day_bins
from engine.series import STEP_S

FAR_ROW = 10
COLUMNS = "az_deg,elevation_deg,low_deg,high_deg,blocking_distance_km"


def _cell(value: float, digits: int) -> str:
    return "" if np.isnan(value) else f"{value:.{digits}f}".rstrip("0").rstrip(".") or "0"


def _default_bundle() -> Path:
    if os.environ.get("BUNDLE_DIR"):
        return Path(os.environ["BUNDLE_DIR"])
    newest = newest_bundle(Path("bundle"))
    if newest is None:
        raise SystemExit("no bundle found: pass --bundle or run `make masks`")
    return newest


def _rows(masks: NDArray[np.float32], blocking: NDArray[np.float32], row: int) -> list[str]:
    lines = []
    for i in range(masks.shape[2]):
        az = f"{i * 0.5:.1f}"
        cells = [_cell(float(masks[k, row, i]), 4) for k in range(3)]
        lines.append(",".join([az, *cells, _cell(float(blocking[row, i]), 3)]))
    return lines


def _series_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(int(value))
    return str(value)


def _write_series(args: argparse.Namespace) -> int:
    try:
        panel = check_height(args.panel, "panel")
        antenna = check_height(args.antenna, "antenna")
        station = parse_station(args.station)
    except ApiError as error:
        raise SystemExit(f"invalid input: {error.detail}") from error
    catalog = load_catalog(args.catalog)
    if args.site not in catalog:
        raise SystemExit(f"unknown site {args.site!r}")
    bundle_dir: Path = args.bundle or _default_bundle()
    try:
        bundle = load_bundle(bundle_dir, [args.site])
    except BundleError as error:
        raise SystemExit(f"cannot read bundle for site {args.site!r}: {error}") from error
    try:
        arrays, start, n = site_series(bundle, catalog[args.site], args.month, panel, antenna, station)
    except (OutOfRange, ValueError) as error:
        raise SystemExit(f"no ephemeris for month {args.month}: outside the bundle's table") from error
    body = series_response(arrays, start, n).model_dump()
    names = [name for name in SeriesResponse.model_fields if isinstance(body[name], list)]
    header = (
        f"# site={args.site} month={args.month} panel_m={panel:g} antenna_m={antenna:g} "
        f"station={station_text(station)} bundle={bundle.bundle_id}"
    )
    lines = [header, ",".join(["utc", *names])]
    for i in range(n):
        utc = (start + timedelta(seconds=600 * i)).strftime("%Y-%m-%dT%H:%MZ")
        lines.append(",".join([utc, *(_series_cell(body[name][i]) for name in names)]))
    args.out.write_text("\n".join(lines) + "\n")
    return 0


def _in_range(value: float, name: str, low: float, high: float) -> float:
    if not low <= value <= high:
        raise ApiError(422, "INVALID_PARAM", f"{name} must be between {low:g} and {high:g}")
    return value


def _summary_scenario(args: argparse.Namespace) -> Scenario:
    _in_range(args.days, "days", *DAYS_RANGE)
    _in_range(args.psr, "psr", *PSR_RANGE)
    _in_range(args.margin, "margin", *MARGIN_RANGE)
    return scenario_params(
        site=args.site,
        t0=args.t0,
        days=args.days,
        panel=check_height(args.panel, "panel"),
        antenna=check_height(args.antenna, "antenna"),
        station=args.station,
        w=args.w,
        sun_req=check_sun_req(_in_range(args.sun_req, "sun_req", *SUN_REQ_RANGE)),
        slope=args.slope,
        psr=args.psr,
        margin=args.margin,
        colors=args.colors,
    )


def _stamp(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%MZ")


def _write_summary(args: argparse.Namespace) -> int:
    try:
        scenario = _summary_scenario(args)
    except ApiError as error:
        raise SystemExit(f"invalid input: {error.detail}") from error
    catalog = load_catalog(args.catalog)
    if args.site not in catalog:
        raise SystemExit(f"unknown site {args.site!r}")
    bundle_dir: Path = args.bundle or _default_bundle()
    try:
        bundle = load_bundle(bundle_dir, [args.site])
    except BundleError as error:
        raise SystemExit(f"cannot read bundle for site {args.site!r}: {error}") from error
    try:
        arrays, window = mission_series(bundle, catalog[args.site], scenario)
    except OutOfRange as error:
        raise SystemExit("no ephemeris for the mission window: outside the bundle's table") from error
    except (ValueError, OverflowError) as error:
        raise SystemExit(f"cannot compute the mission window: {error}") from error
    metrics = compute_metrics(arrays, window.landing)
    summary = build_summary(
        catalog[args.site], scenario, window, metrics, data_codes(bundle, args.site, window),
        load_configs(args.config), summary_version(bundle),
    )
    score = summary.score
    lines = [
        f"# site={args.site} t0={scenario.t0} days={scenario.days:g} panel_m={scenario.panel:g} "
        f"antenna_m={scenario.antenna:g} station={station_text(scenario.station)} bundle={bundle.bundle_id}",
        f"# window={summary.metrics.window[0]}/{summary.metrics.window[1]}",
    ]
    for name, value in summary.metrics.model_dump().items():
        text = "/".join(map(str, value)) if isinstance(value, tuple) else _series_cell(value)
        lines.append(f"# metric {name}={text}")
    lines.append(
        f"# score value={score.value:g} category={score.category} deciding={';'.join(score.deciding)} "
        f"excluded={score.excluded_reason or ''}"
    )
    for f in score.factors:
        lines.append(
            f"# factor {f.name} weight={f.weight:g} weight_share={f.weight_share:g} "
            f"raw={_series_cell(f.raw)} grade={f.grade:g} points_lost={f.points_lost:g}"
        )
    for w in summary.warnings:
        lines.append(f"# warning {w.code} {w.severity}: {w.text}")
    lines.append("day,start_utc,end_utc,hours,sun_pct,dte_pct,sun_disk_mean")
    daily = summary.daily
    for i, (a, b) in enumerate(day_bins(window.n)):
        start = window.start + timedelta(seconds=a * STEP_S)
        end = window.start + timedelta(seconds=b * STEP_S)
        cells = [str(i + 1), _stamp(start), _stamp(end), f"{(b - a) * STEP_S / 3600:g}"]
        cells += [_series_cell(series[i]) for series in (daily.sun_pct, daily.dte_pct, daily.sun_disk_mean)]
        lines.append(",".join(cells))
    args.out.write_text("\n".join(lines) + "\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="engine.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    horizon = sub.add_parser("horizon")
    horizon.add_argument("--site", required=True)
    horizon.add_argument("--height", type=int, default=2, choices=range(1, 11), metavar="1-10")
    horizon.add_argument("--part", choices=["full", "far"], default="full")
    horizon.add_argument("--bundle", type=Path)
    horizon.add_argument("--out", type=Path, required=True)
    series = sub.add_parser("series")
    series.add_argument("--site", required=True)
    series.add_argument("--month", required=True, help="YYYY-MM")
    series.add_argument("--panel", type=float, default=2.0)
    series.add_argument("--antenna", type=float, default=3.0)
    series.add_argument("--station", default=DEFAULT_STATION)
    series.add_argument("--bundle", type=Path)
    series.add_argument("--catalog", type=Path, default=Path("catalog/sites.yaml"))
    series.add_argument("--out", type=Path, required=True)
    summary = sub.add_parser("summary")
    summary.add_argument("--site", required=True)
    summary.add_argument("--t0", required=True, help="YYYY-MM-DDTHH:MMZ")
    summary.add_argument("--days", type=float, default=30)
    summary.add_argument("--panel", type=float, default=2.0)
    summary.add_argument("--antenna", type=float, default=3.0)
    summary.add_argument("--station", default=DEFAULT_STATION)
    summary.add_argument("--w", default=DEFAULT_W)
    summary.add_argument("--sun-req", type=float, default=6)
    summary.add_argument("--slope", default=DEFAULT_SLOPE)
    summary.add_argument("--psr", type=int, default=1)
    summary.add_argument("--margin", type=int, default=12)
    summary.add_argument("--colors", default=DEFAULT_COLORS)
    summary.add_argument("--bundle", type=Path)
    summary.add_argument("--catalog", type=Path, default=Path("catalog/sites.yaml"))
    summary.add_argument("--config", type=Path, default=Path("config"))
    summary.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == "series":
        return _write_series(args)
    if args.command == "summary":
        return _write_summary(args)

    bundle_dir: Path = args.bundle or _default_bundle()
    try:
        bundle = load_bundle(bundle_dir, [args.site])
    except BundleError as error:
        raise SystemExit(f"cannot read bundle for site {args.site!r}: {error}") from error

    row = FAR_ROW if args.part == "far" else args.height - 1
    height = "far" if args.part == "far" else str(args.height)
    warnings = ";".join(bundle.warnings.get(args.site, []))
    header = (
        f"# site={args.site} height_m={height} bundle={bundle.bundle_id} "
        f"algo_version={bundle.algo_version} warnings={warnings}"
    )
    lines = [header, COLUMNS, *_rows(bundle.masks[args.site], bundle.blocking[args.site], row)]
    args.out.write_text("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
