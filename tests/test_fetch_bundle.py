import hashlib
import json
import zipfile
from pathlib import Path

import pytest

from deploy.fetch_bundle import BundleFetchError, fetch_bundle

BUNDLE_ID = "20260101-abcd1234"


def make_zip(path: Path, entries: dict[str, str] | None = None, top: str = BUNDLE_ID) -> bytes:
    entries = entries or {
        "manifest.json": json.dumps({"bundle_id": BUNDLE_ID}),
        "server/sites/a/masks.npy": "masks",
    }
    with zipfile.ZipFile(path, "w") as z:
        for name, text in entries.items():
            z.writestr(f"{top}/{name}" if top else name, text)
    return path.read_bytes()


def write_lock(path: Path, data: bytes, **overrides: object) -> Path:
    lock = {
        "bundle_id": BUNDLE_ID,
        "url": "https://example.test/bundle.zip",
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        **overrides,
    }
    path.write_text(json.dumps(lock))
    return path


def serving(data: bytes):  # type: ignore[no-untyped-def]
    def download(url: str, dest: Path) -> None:
        dest.write_bytes(data)

    return download


def test_unpacks_the_bundle_without_its_top_folder(tmp_path: Path) -> None:
    data = make_zip(tmp_path / "b.zip")
    lock = write_lock(tmp_path / "lock.json", data)
    out = tmp_path / "out"
    assert fetch_bundle(lock, out, serving(data)) == out
    assert json.loads((out / "manifest.json").read_text())["bundle_id"] == BUNDLE_ID
    assert (out / "server" / "sites" / "a" / "masks.npy").read_text() == "masks"


def test_wrong_checksum_is_refused_and_leaves_nothing(tmp_path: Path) -> None:
    data = make_zip(tmp_path / "b.zip")
    lock = write_lock(tmp_path / "lock.json", data, sha256="0" * 64)
    out = tmp_path / "out"
    with pytest.raises(BundleFetchError, match="sha256"):
        fetch_bundle(lock, out, serving(data))
    assert not out.exists()


def test_truncated_download_is_refused(tmp_path: Path) -> None:
    data = make_zip(tmp_path / "b.zip")
    lock = write_lock(tmp_path / "lock.json", data)
    with pytest.raises(BundleFetchError, match="bytes"):
        fetch_bundle(lock, tmp_path / "out", serving(data[:-10]))


def test_bundle_id_must_match_the_lock(tmp_path: Path) -> None:
    data = make_zip(tmp_path / "b.zip")
    lock = write_lock(tmp_path / "lock.json", data, bundle_id="20260101-other000")
    out = tmp_path / "out"
    with pytest.raises(BundleFetchError, match="bundle_id"):
        fetch_bundle(lock, out, serving(data))
    assert not out.exists()


def test_paths_escaping_the_folder_are_refused(tmp_path: Path) -> None:
    data = make_zip(tmp_path / "b.zip", {"../../evil.txt": "x", "manifest.json": "{}"})
    lock = write_lock(tmp_path / "lock.json", data)
    out = tmp_path / "out"
    with pytest.raises(BundleFetchError, match="outside"):
        fetch_bundle(lock, out, serving(data))
    assert not (tmp_path / "evil.txt").exists() and not out.exists()


def test_archive_without_a_single_top_folder_is_refused(tmp_path: Path) -> None:
    data = make_zip(tmp_path / "b.zip", top="")
    lock = write_lock(tmp_path / "lock.json", data)
    with pytest.raises(BundleFetchError, match="folder"):
        fetch_bundle(lock, tmp_path / "out", serving(data))


def test_existing_output_is_replaced(tmp_path: Path) -> None:
    data = make_zip(tmp_path / "b.zip")
    lock = write_lock(tmp_path / "lock.json", data)
    out = tmp_path / "out"
    out.mkdir()
    (out / "stale.txt").write_text("old")
    fetch_bundle(lock, out, serving(data))
    assert not (out / "stale.txt").exists() and (out / "manifest.json").is_file()
