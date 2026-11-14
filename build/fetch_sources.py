import hashlib
import json
import shutil
import urllib.request
from collections.abc import Callable
from pathlib import Path

LOCK_PATH = Path("data/sources.lock.json")
DEST = Path("data/sources")
CHUNK = 1 << 20


class ChecksumMismatch(Exception):
    def __init__(self, path: str, expected: str, actual: str) -> None:
        super().__init__(f"{path}: expected sha256 {expected}, got {actual}")
        self.path = path
        self.expected = expected
        self.actual = actual


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def verify_file(path: Path, sha256: str) -> bool:
    return path.is_file() and sha256_of(path) == sha256


def download(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url) as response, dest.open("wb") as out:  # noqa: S310
        shutil.copyfileobj(response, out, CHUNK)


def fetch_all(
    lock_path: Path,
    dest: Path,
    fetch: Callable[[str, Path], None] = download,
    on_unpinned: Callable[[str, str], None] | None = None,
) -> list[str]:
    """An entry with an empty sha256 is pinned on first download: it is accepted and
    its hash reported through `on_unpinned`, to be written into the lockfile."""
    entries = json.loads(lock_path.read_text())["files"]
    fetched: list[str] = []
    for entry in entries:
        relative: str = entry["path"]
        expected: str = entry["sha256"]
        target = dest / relative
        if expected == "" and target.is_file():
            continue
        if expected != "" and verify_file(target, expected):
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_name(target.name + ".part")
        fetch(entry["url"], part)
        actual = sha256_of(part)
        if expected == "":
            if on_unpinned is not None:
                on_unpinned(relative, actual)
        elif actual != expected:
            part.unlink()
            raise ChecksumMismatch(relative, expected, actual)
        part.replace(target)
        fetched.append(relative)
    return fetched


def main() -> None:
    fetched = fetch_all(
        LOCK_PATH,
        DEST,
        on_unpinned=lambda path, sha: print(f"unpinned {path}: add sha256 {sha} to the lockfile"),
    )
    print(f"fetched {len(fetched)} file(s)" + "".join(f"\n  {p}" for p in fetched))


if __name__ == "__main__":
    main()
