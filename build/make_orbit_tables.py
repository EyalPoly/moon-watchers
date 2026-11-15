"""Export the globe's compact hourly sky tables from the same SPICE bundle as the API.

Run python -m build.make_orbit_tables PATH_TO_BUNDLE after updating the ephemeris.
Each little-endian int16 row stores two unit vectors (Sun, Earth, CN+S / MOON_ME)
and the ITRF93-to-MOON_ME rotation quaternion (w, x, y, z), scaled by 32767.
"""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from engine.geometry import MOON_FRAME


def export(bundle: Path, output: Path) -> None:
    import spiceypy as spice

    meta = json.loads((bundle / "manifest.json").read_text())["ephemeris"]
    if meta["frame"] != MOON_FRAME or meta["step_s"] != 3600:
        raise ValueError("Orbit needs hourly positions in the project's mean-Earth frame")
    epoch = datetime.fromisoformat(meta["start_utc"])
    vectors = np.load(bundle / "server" / "ephemeris.npy", mmap_mode="r")
    rotations = np.load(bundle / "server" / "earth_rotation.npy", mmap_mode="r")
    output.mkdir(parents=True, exist_ok=True)
    for year in range(2026, 2031):
        start = datetime(year, 1, 1, tzinfo=UTC)
        end = datetime(year + 1, 1, 1, tzinfo=UTC)
        index = int((start - epoch).total_seconds() // 3600)
        rows = int((end - start).total_seconds() // 3600) + 1
        if index < 0 or index + rows > min(len(vectors), len(rotations)):
            raise ValueError(f"Bundle does not cover all of {year}")
        subset = slice(index, index + rows)
        positions = vectors[subset, :6].reshape(rows, 2, 3)
        unit = positions / np.linalg.norm(positions, axis=2, keepdims=True)
        quaternions = np.array([spice.m2q(r.copy()) for r in rotations[subset]])
        table = np.column_stack((unit.reshape(rows, 6), quaternions))
        (output / f"{year}.bin").write_bytes(np.rint(table * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--output", type=Path, default=Path("web/public/orbit/ephemeris"))
    args = parser.parse_args()
    export(args.bundle, args.output)
