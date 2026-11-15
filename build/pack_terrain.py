import argparse
import hashlib
import json
import sys
from pathlib import Path

from engine.custom_point import TERRAIN_FILES


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def pack_terrain(sources: Path, repo: str, tag: str) -> dict[str, list[dict[str, object]]]:
    """The lock entries for the terrain files found under `sources`, in `TERRAIN_FILES` order."""
    entries: list[dict[str, object]] = []
    for name in TERRAIN_FILES:
        path = sources / name
        if not path.is_file():
            continue
        entries.append(
            {
                "path": name,
                "url": f"https://github.com/{repo}/releases/download/{tag}/{path.name}",
                "sha256": _sha256(path),
                "bytes": path.stat().st_size,
            }
        )
    return {"files": entries}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="build.pack_terrain")
    parser.add_argument("--sources", type=Path, default=Path("data/sources"))
    parser.add_argument("--repo", required=True, help="GitHub owner/name that holds the release")
    parser.add_argument("--tag", required=True)
    parser.add_argument("--out", type=Path, default=Path("deploy/terrain.lock.json"))
    args = parser.parse_args(argv)
    lock = pack_terrain(args.sources, args.repo, args.tag)
    missing = [name for name in TERRAIN_FILES if name not in {e["path"] for e in lock["files"]}]
    if missing:
        print(f"missing under {args.sources}: {', '.join(missing)}", file=sys.stderr)
        return 1
    args.out.write_text(json.dumps(lock, indent=2) + "\n")
    files = " ".join(f'"{args.sources / name}"' for name in TERRAIN_FILES)
    print(f"wrote {args.out}; upload the files with:")
    print(
        f'gh release create {args.tag} --repo {args.repo} --title "Terrain for custom points" '
        f'--notes "NASA PGDA LOLA product 90: 80 m and 240 m elevation, error rasters, 80 m slope." {files}'
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
