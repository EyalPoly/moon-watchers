import hashlib
import json
from collections.abc import Callable
from pathlib import Path

import pytest

from deploy.fetch_terrain import TerrainFetchError, fetch_terrain

FILES = {"lola/a.TIF": b"alpha" * 100, "layers/slope/b.TIF": b"beta" * 100}


def write_lock(path: Path, files: dict[str, bytes], **overrides: object) -> Path:
    entries = []
    for name, data in files.items():
        entry: dict[str, object] = {
            "path": name,
            "url": f"https://example.org/{Path(name).name}",
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
        }
        entry.update(overrides)
        entries.append(entry)
    path.write_text(json.dumps({"files": entries}))
    return path


def serve(files: dict[str, bytes]) -> Callable[[str, Path], None]:
    by_url = {f"https://example.org/{Path(name).name}": data for name, data in files.items()}

    def fetch(url: str, dest: Path) -> None:
        dest.write_bytes(by_url[url])

    return fetch


def test_empty_lock_writes_nothing(tmp_path: Path) -> None:
    lock = tmp_path / "lock.json"
    lock.write_text('{"files": []}')
    assert fetch_terrain(lock, tmp_path / "out", serve({})) == []
    assert not (tmp_path / "out").exists()


def test_fetches_and_checks_every_file(tmp_path: Path) -> None:
    lock = write_lock(tmp_path / "lock.json", FILES)
    paths = fetch_terrain(lock, tmp_path / "out", serve(FILES))
    assert sorted(p.relative_to(tmp_path / "out").as_posix() for p in paths) == sorted(FILES)
    for name, data in FILES.items():
        assert (tmp_path / "out" / name).read_bytes() == data


def test_checksum_mismatch_fails(tmp_path: Path) -> None:
    lock = write_lock(tmp_path / "lock.json", FILES)
    tampered = {name: data[::-1] for name, data in FILES.items()}
    with pytest.raises(TerrainFetchError, match="sha256"):
        fetch_terrain(lock, tmp_path / "out", serve(tampered))
    assert not (tmp_path / "out").exists()


def test_size_mismatch_fails(tmp_path: Path) -> None:
    lock = write_lock(tmp_path / "lock.json", FILES)
    truncated = {name: data[:-1] for name, data in FILES.items()}
    with pytest.raises(TerrainFetchError, match="bytes"):
        fetch_terrain(lock, tmp_path / "out", serve(truncated))
    assert not (tmp_path / "out").exists()


def test_one_bad_file_leaves_nothing_behind(tmp_path: Path) -> None:
    lock = write_lock(tmp_path / "lock.json", FILES)
    mixed = {**FILES, "layers/slope/b.TIF": b"x" * 400}
    with pytest.raises(TerrainFetchError):
        fetch_terrain(lock, tmp_path / "out", serve(mixed))
    assert not (tmp_path / "out").exists()


@pytest.mark.parametrize("bad", ["../escape.TIF", "/abs/escape.TIF", "lola/../../escape.TIF"])
def test_path_must_stay_inside_out_dir(tmp_path: Path, bad: str) -> None:
    lock = write_lock(tmp_path / "lock.json", {bad: b"x" * 10})
    with pytest.raises(TerrainFetchError, match="outside"):
        fetch_terrain(lock, tmp_path / "out", serve({bad: b"x" * 10}))
