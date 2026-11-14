import hashlib
import json
from pathlib import Path

import pytest

from build.fetch_sources import ChecksumMismatch, fetch_all, verify_file

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
        fetch_all(lock, dest, FakeFetch(b"wrong"))
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
