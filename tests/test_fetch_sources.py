import http.client
import hashlib
import json
from pathlib import Path

import pytest

from build.fetch_sources import (
    ChecksumMismatch,
    SizeMismatch,
    byte_ranges,
    download_ranges,
    fetch_all,
    read_range,
    verify_file,
)

CONTENT = b"known bytes"
SHA = hashlib.sha256(CONTENT).hexdigest()


def write_lock(path: Path, sha: str = SHA) -> None:
    path.write_text(
        json.dumps(
            {"files": [{"path": "spice/a.bsp", "url": "https://x/a.bsp", "sha256": sha, "bytes": 11, "note": ""}]}
        )
    )


class FakeFetch:
    def __init__(self, data: bytes = CONTENT) -> None:
        self.data = data
        self.calls: list[str] = []

    def __call__(self, url: str, dest: Path) -> None:
        self.calls.append(url)
        dest.write_bytes(self.data)


def test_verify_file(tmp_path: Path) -> None:
    f = tmp_path / "f"
    f.write_bytes(CONTENT)
    assert verify_file(f, SHA)
    assert not verify_file(f, "0" * 64)
    assert not verify_file(tmp_path / "missing", SHA)


def test_skips_verified_files(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock)
    dest = tmp_path / "sources"
    (dest / "spice").mkdir(parents=True)
    (dest / "spice" / "a.bsp").write_bytes(CONTENT)
    fetch = FakeFetch()
    assert fetch_all(lock, dest, fetch) == []
    assert fetch.calls == []


def test_downloads_missing_file_and_renames(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock)
    dest = tmp_path / "sources"
    fetch = FakeFetch()
    assert fetch_all(lock, dest, fetch) == ["spice/a.bsp"]
    assert (dest / "spice" / "a.bsp").read_bytes() == CONTENT
    assert not (dest / "spice" / "a.bsp.part").exists()


def test_mismatch_deletes_part_and_raises(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock)
    dest = tmp_path / "sources"
    with pytest.raises(ChecksumMismatch):
        fetch_all(lock, dest, FakeFetch(b"wrong byte!"))
    assert not (dest / "spice" / "a.bsp.part").exists()
    assert not (dest / "spice" / "a.bsp").exists()


def test_unpinned_entry_downloads_and_reports_its_hash(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock, sha="")
    dest = tmp_path / "sources"
    reported: list[tuple[str, str]] = []
    fetch = FakeFetch()
    fetched = fetch_all(lock, dest, fetch, on_unpinned=lambda path, sha: reported.append((path, sha)))
    assert fetched == ["spice/a.bsp"]
    assert reported == [("spice/a.bsp", SHA)]
    assert (dest / "spice" / "a.bsp").read_bytes() == CONTENT


def test_unpinned_existing_file_is_not_redownloaded(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock, sha="")
    dest = tmp_path / "sources"
    (dest / "spice").mkdir(parents=True)
    (dest / "spice" / "a.bsp").write_bytes(CONTENT)
    fetch = FakeFetch()
    assert fetch_all(lock, dest, fetch) == []
    assert fetch.calls == []


def test_corrupt_existing_file_is_redownloaded(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock)
    dest = tmp_path / "sources"
    (dest / "spice").mkdir(parents=True)
    (dest / "spice" / "a.bsp").write_bytes(b"corrupt")
    fetch = FakeFetch()
    assert fetch_all(lock, dest, fetch) == ["spice/a.bsp"]
    assert (dest / "spice" / "a.bsp").read_bytes() == CONTENT


def test_truncated_unpinned_download_is_rejected(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock, sha="")
    dest = tmp_path / "sources"
    with pytest.raises(SizeMismatch):
        fetch_all(lock, dest, FakeFetch(CONTENT[:5]))
    assert not (dest / "spice" / "a.bsp").exists()
    assert not (dest / "spice" / "a.bsp.part").exists()


def test_truncated_pinned_download_is_rejected_before_hashing(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock)
    with pytest.raises(SizeMismatch):
        fetch_all(lock, tmp_path / "sources", FakeFetch(CONTENT[:5]))


def test_unpinned_existing_file_of_wrong_size_is_redownloaded(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    write_lock(lock, sha="")
    dest = tmp_path / "sources"
    (dest / "spice").mkdir(parents=True)
    (dest / "spice" / "a.bsp").write_bytes(CONTENT[:5])
    fetch = FakeFetch()
    assert fetch_all(lock, dest, fetch) == ["spice/a.bsp"]
    assert (dest / "spice" / "a.bsp").read_bytes() == CONTENT


def test_fetch_only_filters_by_prefix(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    entries = [
        {"path": "lola/LDEM_80S_80MPP_ADJ.TIF", "url": "https://x/a", "sha256": "", "bytes": 11, "note": ""},
        {"path": "lola/LDEM_80S_80MPP_ADJ_ERR.TIF", "url": "https://x/b", "sha256": "", "bytes": 11, "note": ""},
        {"path": "lola/LDEM_60S_240MPP_ADJ.TIF", "url": "https://x/c", "sha256": "", "bytes": 11, "note": ""},
    ]
    lock.write_text(json.dumps({"files": entries}))
    fetch = FakeFetch()
    fetched = fetch_all(lock, tmp_path / "sources", fetch, only="lola/LDEM_80S_80MPP")
    assert fetched == ["lola/LDEM_80S_80MPP_ADJ.TIF", "lola/LDEM_80S_80MPP_ADJ_ERR.TIF"]
    assert fetch.calls == ["https://x/a", "https://x/b"]


def test_byte_ranges_cover_the_file_once() -> None:
    assert byte_ranges(10, 4) == [(0, 3), (4, 7), (8, 9)]
    assert byte_ranges(8, 4) == [(0, 3), (4, 7)]


BLOB = bytes(range(256)) * 40


class FakeRanges:
    """Serves byte ranges of BLOB; the ranges listed in `fail_first` fail on their first request."""

    def __init__(self, fail_first: frozenset[int] = frozenset(), always_fail: int | None = None) -> None:
        self.fail_first = set(fail_first)
        self.always_fail = always_fail
        self.calls: list[int] = []

    def __call__(self, url: str, first: int, last: int) -> bytes:
        self.calls.append(first)
        if first == self.always_fail:
            raise OSError("connection reset")
        if first in self.fail_first:
            self.fail_first.discard(first)
            raise OSError("connection reset")
        return BLOB[first : last + 1]


def test_download_ranges_assembles_the_file(tmp_path: Path) -> None:
    dest = tmp_path / "f.part"
    download_ranges("https://x/f", dest, len(BLOB), FakeRanges(), connections=4, step=1000)
    assert dest.read_bytes() == BLOB


def test_download_ranges_retries_a_failed_range(tmp_path: Path) -> None:
    dest = tmp_path / "f.part"
    read = FakeRanges(fail_first=frozenset({3000}))
    download_ranges("https://x/f", dest, len(BLOB), read, connections=4, step=1000, pause=lambda s: None)
    assert dest.read_bytes() == BLOB
    assert read.calls.count(3000) == 2


def test_download_ranges_gives_up_after_retries(tmp_path: Path) -> None:
    read = FakeRanges(always_fail=2000)
    with pytest.raises(OSError, match="2000"):
        download_ranges(
            "https://x/f", tmp_path / "f.part", len(BLOB), read, connections=2, step=1000, pause=lambda s: None
        )
    assert read.calls.count(2000) == 5


def test_download_ranges_retries_a_cut_connection(tmp_path: Path) -> None:
    calls: list[int] = []

    def read(url: str, first: int, last: int) -> bytes:
        calls.append(first)
        if first == 1000 and calls.count(1000) == 1:
            raise http.client.IncompleteRead(b"partial", 10)
        return BLOB[first : last + 1]

    dest = tmp_path / "f.part"
    download_ranges("https://x/f", dest, len(BLOB), read, connections=2, step=1000, pause=lambda s: None)
    assert dest.read_bytes() == BLOB
    assert calls.count(1000) == 2


def test_download_ranges_stops_queued_ranges_after_a_failure(tmp_path: Path) -> None:
    read = FakeRanges(always_fail=0)
    with pytest.raises(OSError):
        download_ranges(
            "https://x/f", tmp_path / "f.part", len(BLOB), read, connections=1, step=100, pause=lambda s: None
        )
    assert read.calls.count(0) == 5
    assert len(set(read.calls)) < 10, "the queued ranges should be cancelled, not fetched"


class FakeResponse:
    """A 206 answer that hands out its body `chunk` bytes per read1 call."""

    def __init__(self, first: int, last: int, chunk: int) -> None:
        self.status = 206
        self.headers = {"Content-Range": f"bytes {first}-{last}/{len(BLOB)}"}
        self.body = BLOB[first : last + 1]
        self.chunk = chunk

    def read1(self, n: int) -> bytes:
        part, self.body = self.body[: min(n, self.chunk)], self.body[min(n, self.chunk) :]
        return part

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *exc: object) -> None:
        return None


def test_read_range_returns_the_requested_bytes() -> None:
    def opener(request: object, timeout: float) -> FakeResponse:
        return FakeResponse(1000, 1999, chunk=300)

    assert read_range("https://x/f", 1000, 1999, open_url=opener, clock=lambda: 0.0) == BLOB[1000:2000]


def test_read_range_gives_up_on_a_slow_trickle() -> None:
    ticks = iter(range(0, 100_000, 100))

    def opener(request: object, timeout: float) -> FakeResponse:
        return FakeResponse(0, 999, chunk=10)

    with pytest.raises(TimeoutError, match="0-999"):
        read_range("https://x/f", 0, 999, open_url=opener, clock=lambda: float(next(ticks)), deadline_s=250.0)
