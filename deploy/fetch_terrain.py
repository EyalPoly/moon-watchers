"""Fetches the pinned terrain for custom points into the API image at build time.

Standard library only: the Docker build runs it before anything else is installed.
"""

import argparse
import json
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path

from deploy.fetch_bundle import download, sha256_of


class TerrainFetchError(Exception):
    pass


def fetch_terrain(
    lock_path: Path, out_dir: Path, fetch: Callable[[str, Path], None] = download
) -> list[Path]:
    """Downloads every file in the lock, checks size and sha256, and only then moves them into
    `out_dir`. An empty lock fetches nothing and creates nothing: custom points stay off."""
    entries = json.loads(lock_path.read_text())["files"]
    if not entries:
        return []
    root = out_dir.resolve()
    for entry in entries:
        target = (out_dir / entry["path"]).resolve()
        if root != target and root not in target.parents:
            raise TerrainFetchError(f"{entry['path']} would be written outside {out_dir}")
    with tempfile.TemporaryDirectory() as scratch:
        staged: list[tuple[Path, Path]] = []
        for index, entry in enumerate(entries):
            part = Path(scratch) / str(index)
            fetch(entry["url"], part)
            if part.stat().st_size != entry["bytes"]:
                raise TerrainFetchError(
                    f"{entry['url']}: expected {entry['bytes']} bytes, got {part.stat().st_size}"
                )
            actual = sha256_of(part)
            if actual != entry["sha256"]:
                raise TerrainFetchError(f"{entry['url']}: expected sha256 {entry['sha256']}, got {actual}")
            staged.append((part, out_dir / entry["path"]))
        placed: list[Path] = []
        for part, target in staged:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(part), str(target))
            placed.append(target)
    return placed


def main() -> None:
    parser = argparse.ArgumentParser(prog="deploy.fetch_terrain")
    parser.add_argument("--lock", type=Path, default=Path("deploy/terrain.lock.json"))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    placed = fetch_terrain(args.lock, args.out)
    print(f"{len(placed)} terrain file(s) in {args.out}" if placed else "no terrain pinned: custom points stay off")


if __name__ == "__main__":
    main()
