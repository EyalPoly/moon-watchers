import hashlib
from pathlib import Path

from build.pack_terrain import pack_terrain
from engine.custom_point import TERRAIN_FILES


def test_lock_matches_the_files(tmp_path: Path) -> None:
    present = TERRAIN_FILES[:2]
    for name in present:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(name.encode() * 50)
    lock = pack_terrain(tmp_path, "Owner/repo", "terrain-x")
    entries = lock["files"]
    assert [e["path"] for e in entries] == list(present)
    for entry, name in zip(entries, present, strict=True):
        data = (tmp_path / name).read_bytes()
        assert entry["bytes"] == len(data)
        assert entry["sha256"] == hashlib.sha256(data).hexdigest()
        assert entry["url"] == f"https://github.com/Owner/repo/releases/download/terrain-x/{Path(name).name}"


def test_cli_refuses_when_a_file_is_missing(tmp_path: Path, capsys) -> None:  # type: ignore[no-untyped-def]
    from build.pack_terrain import main

    out = tmp_path / "lock.json"
    assert main(["--sources", str(tmp_path), "--repo", "O/r", "--tag", "t", "--out", str(out)]) == 1
    assert "missing under" in capsys.readouterr().err
    assert not out.exists()


def test_cli_writes_the_lock_and_prints_the_upload_command(tmp_path: Path, capsys) -> None:  # type: ignore[no-untyped-def]
    import json

    from build.pack_terrain import main

    for name in TERRAIN_FILES:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * 10)
    out = tmp_path / "lock.json"
    assert main(["--sources", str(tmp_path), "--repo", "O/r", "--tag", "terrain-t", "--out", str(out)]) == 0
    assert len(json.loads(out.read_text())["files"]) == len(TERRAIN_FILES)
    assert "gh release create terrain-t --repo O/r" in capsys.readouterr().out
