import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from api.bundle import load_bundle
from build.converge import max_mask_change

# Rows of masks.npy: the panel and antenna masts the physics team uses, and the far-only row.
ROWS: dict[str, int] = {"panel 2 m": 1, "antenna 3 m": 2, "far-only": 10}


@dataclass(frozen=True)
class Change:
    site_id: str
    row: str
    max_change_deg: float | None
    unknown_differs: int


def _manifest(bundle_dir: Path) -> dict[str, object]:
    manifest: dict[str, object] = json.loads((bundle_dir / "manifest.json").read_text())
    return manifest


def _sites(bundle_dir: Path) -> dict[str, object]:
    sites = _manifest(bundle_dir).get("sites")
    if not isinstance(sites, dict):
        raise ValueError(f"{bundle_dir / 'manifest.json'} has no sites")
    return sites


def _label(bundle_dir: Path) -> str:
    manifest = _manifest(bundle_dir)
    parameters = manifest.get("parameters")
    terrain = parameters.get("terrain", "?") if isinstance(parameters, dict) else "?"
    return f"{terrain} ({manifest['bundle_id']})"


def compare(base_dir: Path, other_dir: Path) -> list[Change]:
    """Nominal skyline changes from `base_dir` to `other_dir`, per site and row."""
    base_sites = list(_sites(base_dir))
    if set(base_sites) != set(_sites(other_dir)):
        raise ValueError(f"{base_dir.name} and {other_dir.name} cover different sites")
    base = load_bundle(base_dir, base_sites)
    other = load_bundle(other_dir, base_sites)
    changes: list[Change] = []
    for site_id in base_sites:
        for label, row in ROWS.items():
            a = base.masks[site_id][0, row]
            b = other.masks[site_id][0, row]
            try:
                change: float | None = max_mask_change(a, b)
            except ValueError:
                change = None
            differs = int((np.isfinite(a) != np.isfinite(b)).sum())
            changes.append(Change(site_id, label, change, differs))
    return changes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="build.compare_bundles")
    parser.add_argument("base", type=Path, help="the bundle to compare against")
    parser.add_argument("others", type=Path, nargs="+")
    args = parser.parse_args(argv)
    for other in args.others:
        print(f"{_label(other)} vs {_label(args.base)}")
        for c in compare(args.base, other):
            change = "no direction known in both" if c.max_change_deg is None else f"{c.max_change_deg:.4f}°"
            print(f"  {c.site_id}: {c.row}: max change {change}, unknown in one only: {c.unknown_differs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
