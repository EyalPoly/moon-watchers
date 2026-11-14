import argparse
import hashlib
import http.client
import json
import shutil
import threading
import time
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
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


class SizeMismatch(Exception):
    def __init__(self, path: str, expected: int, actual: int) -> None:
        super().__init__(f"{path}: expected {expected} bytes, got {actual} (truncated download?)")
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


ReadRange = Callable[[str, int, int], bytes]

# PGDA serves about 80 KB/s per connection, so the 2-4 GB terrain files come as parallel ranges.
CONNECTIONS = 16
RANGE_BYTES = 4 * CHUNK
ATTEMPTS = 5


def byte_ranges(size: int, step: int) -> list[tuple[int, int]]:
    """Inclusive (first, last) byte pairs covering the file once."""
    return [(start, min(start + step, size) - 1) for start in range(0, size, step)]


def read_range(url: str, first: int, last: int) -> bytes:
    request = urllib.request.Request(url, headers={"Range": f"bytes={first}-{last}"})  # noqa: S310
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        content_range = response.headers.get("Content-Range", "")
        if response.status != 206 or not content_range.startswith(f"bytes {first}-{last}/"):
            raise OSError(f"bytes {first}-{last}: got status {response.status}, range {content_range!r}")
        data: bytes = response.read()
    if len(data) != last - first + 1:
        raise OSError(f"bytes {first}-{last}: got {len(data)} bytes")
    return data


def download_ranges(
    url: str,
    dest: Path,
    size: int,
    read: ReadRange = read_range,
    connections: int = CONNECTIONS,
    step: int = RANGE_BYTES,
    pause: Callable[[float], None] = time.sleep,
    report: Callable[[int], None] | None = None,
) -> None:
    with dest.open("wb") as out:
        out.truncate(size)
    lock = threading.Lock()
    done = 0

    def fetch_one(first: int, last: int) -> None:
        nonlocal done
        for attempt in range(1, ATTEMPTS + 1):
            try:
                data = read(url, first, last)
                break
            except (OSError, http.client.HTTPException) as error:
                if attempt == ATTEMPTS:
                    raise OSError(f"{url} bytes {first}-{last}: {error}") from error
                pause(2.0 * attempt)
        with dest.open("r+b") as out:
            out.seek(first)
            out.write(data)
        with lock:
            done += len(data)
            if report is not None:
                report(done)

    with ThreadPoolExecutor(max_workers=connections) as pool:
        futures = [pool.submit(fetch_one, first, last) for first, last in byte_ranges(size, step)]
        try:
            for future in futures:
                future.result()
        except BaseException:
            pool.shutdown(cancel_futures=True)
            raise


def remote_size(url: str) -> int | None:
    """The file's size when the server accepts byte ranges, else None."""
    request = urllib.request.Request(url, method="HEAD")  # noqa: S310
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        length = response.headers.get("Content-Length")
        if response.headers.get("Accept-Ranges") != "bytes" or length is None:
            return None
        return int(length)


def download(url: str, dest: Path) -> None:
    size = remote_size(url)
    if size is None or size <= RANGE_BYTES:
        with urllib.request.urlopen(url, timeout=60) as response, dest.open("wb") as out:  # noqa: S310
            shutil.copyfileobj(response, out, CHUNK)
        return
    tenth = max(1, size // 10)
    last_tenth = [0]

    def report(done: int) -> None:
        if done // tenth > last_tenth[0]:
            last_tenth[0] = done // tenth
            print(f"  {dest.name}: {100 * done // size}% of {size / 1e9:.2f} GB", flush=True)

    download_ranges(url, dest, size, report=report)


def fetch_all(
    lock_path: Path,
    dest: Path,
    fetch: Callable[[str, Path], None] = download,
    on_unpinned: Callable[[str, str], None] | None = None,
    only: str | None = None,
) -> list[str]:
    """An entry with an empty sha256 is pinned on first download: it is accepted and
    its hash reported through `on_unpinned`, to be written into the lockfile."""
    entries = json.loads(lock_path.read_text())["files"]
    fetched: list[str] = []
    for entry in entries:
        relative: str = entry["path"]
        expected: str = entry["sha256"]
        size: int = entry["bytes"]
        if only is not None and not relative.startswith(only):
            continue
        target = dest / relative
        if expected == "" and target.is_file() and target.stat().st_size == size:
            continue
        if expected != "" and verify_file(target, expected):
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_name(target.name + ".part")
        fetch(entry["url"], part)
        if part.stat().st_size != size:
            actual_size = part.stat().st_size
            part.unlink()
            raise SizeMismatch(relative, size, actual_size)
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
    parser = argparse.ArgumentParser(prog="build.fetch_sources")
    parser.add_argument("--only", help="download only lock entries whose path starts with this prefix")
    args = parser.parse_args()
    fetched = fetch_all(
        LOCK_PATH,
        DEST,
        on_unpinned=lambda path, sha: print(f"unpinned {path}: add sha256 {sha} to the lockfile"),
        only=args.only,
    )
    print(f"fetched {len(fetched)} file(s)" + "".join(f"\n  {p}" for p in fetched))


if __name__ == "__main__":
    main()
