import argparse
import os
import sys
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from api.bundle import BundleError, load_bundle

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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="engine.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    horizon = sub.add_parser("horizon")
    horizon.add_argument("--site", required=True)
    horizon.add_argument("--height", type=int, default=2, choices=range(1, 11), metavar="1-10")
    horizon.add_argument("--part", choices=["full", "far"], default="full")
    horizon.add_argument("--bundle", type=Path)
    horizon.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

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
