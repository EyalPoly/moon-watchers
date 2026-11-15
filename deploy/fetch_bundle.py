"""Fetches the horizon bundle into the API image at build time.

Standard library only: the Docker build runs it before anything else is installed.
"""

import argparse
import hashlib
import json
import shutil
import tempfile
import urllib.request
import zipfile
from collections.abc import Callable
from pathlib import Path

CHUNK = 1 << 20


class BundleFetchError(Exception):
    pass


def download(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url, timeout=120) as response, dest.open("wb") as out:  # noqa: S310
        shutil.copyfileobj(response, out, CHUNK)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _unpack(archive: Path, target: Path) -> None:
    with zipfile.ZipFile(archive) as z:
        names = [n for n in z.namelist() if n.strip("/")]
        tops = {n.split("/", 1)[0] for n in names}
        if len(tops) != 1 or any("/" not in n.rstrip("/") and not n.endswith("/") for n in names):
            raise BundleFetchError("archive must hold one top-level folder")
        root = target.resolve()
        for info in z.infolist():
            relative = info.filename.split("/", 1)[1] if "/" in info.filename else ""
            if not relative:
                continue
            destination = (target / relative).resolve()
            if root != destination and root not in destination.parents:
                raise BundleFetchError(f"{info.filename} would be written outside {target}")
            if info.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as src, destination.open("wb") as dst:
                    shutil.copyfileobj(src, dst, CHUNK)


def fetch_bundle(
    lock_path: Path, out_dir: Path, fetch: Callable[[str, Path], None] = download
) -> Path:
    lock = json.loads(lock_path.read_text())
    with tempfile.TemporaryDirectory() as scratch:
        archive = Path(scratch) / "bundle.zip"
        fetch(lock["url"], archive)
        if archive.stat().st_size != lock["bytes"]:
            raise BundleFetchError(
                f"{lock['url']}: expected {lock['bytes']} bytes, got {archive.stat().st_size}"
            )
        actual = sha256_of(archive)
        if actual != lock["sha256"]:
            raise BundleFetchError(f"{lock['url']}: expected sha256 {lock['sha256']}, got {actual}")
        staging = Path(scratch) / "unpacked"
        staging.mkdir()
        _unpack(archive, staging)
        try:
            bundle_id = json.loads((staging / "manifest.json").read_text())["bundle_id"]
        except (OSError, ValueError, KeyError) as error:
            raise BundleFetchError(f"bundle has no readable manifest.json: {error}") from error
        if bundle_id != lock["bundle_id"]:
            raise BundleFetchError(
                f"manifest bundle_id {bundle_id!r} differs from the lock's {lock['bundle_id']!r}"
            )
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(staging), str(out_dir))
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(prog="deploy.fetch_bundle")
    parser.add_argument("--lock", type=Path, default=Path("deploy/bundle.lock.json"))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(fetch_bundle(args.lock, args.out))


if __name__ == "__main__":
    main()
