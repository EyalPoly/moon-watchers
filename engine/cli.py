import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from api.bundle import BundleError, load_bundle
from api.catalog import load_catalog
from api.errors import ApiError
from api.models import SeriesResponse
from api.scenario import DEFAULT_STATION, check_height, parse_station, station_text
from api.series_json import series_response, site_series
from engine.geometry import OutOfRange

FAR_ROW = 10
COLUMNS = "az_deg,elevation_deg,low_deg,high_deg,blocking_distance_km"


def _cell(value: float, digits: int) -> str:
    return "" if np.isnan(value) else f"{value:.{digits}f}".rstrip("0").rstrip(".") or "0"


def _default_bundle() -> Path:
    if os.environ.get("BUNDLE_DIR"):
        return Path(os.environ["BUNDLE_DIR"])
    candidates = sorted(p for p in Path("bundle").glob("*") if (p / "manifest.json").is_file())
    if not candidates:
        raise SystemExit("no bundle found: pass --bundle or run `make masks`")
    return candidates[-1]


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
    args = parser.parse_args(argv)
    if args.command == "series":
        return _write_series(args)

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
