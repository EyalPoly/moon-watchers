import json
import shutil
import subprocess
import sys
from pathlib import Path


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "api.contract", *args], capture_output=True, text=True
    )


def test_check_passes_when_in_sync(tmp_path: Path) -> None:
    assert run("generate", "--out", str(tmp_path)).returncode == 0
    result = run("check", "--against", str(tmp_path))
    assert result.returncode == 0, result.stderr


def test_check_fails_on_stale_openapi(tmp_path: Path) -> None:
    run("generate", "--out", str(tmp_path))
    path = tmp_path / "openapi.json"
    path.write_text(path.read_text().replace('"title"', '"titel"', 1))
    result = run("check", "--against", str(tmp_path))
    assert result.returncode == 1
    assert "openapi.json" in result.stderr


def test_check_fails_on_invalid_sample(tmp_path: Path) -> None:
    run("generate", "--out", str(tmp_path))
    samples = tmp_path / "samples"
    shutil.copytree("contract/samples", samples)
    data = json.loads((samples / "health.json").read_text())
    data["status"] = "broken"
    (samples / "health.json").write_text(json.dumps(data))
    result = run("check", "--against", str(tmp_path), "--samples", str(samples))
    assert result.returncode == 1
    assert "health.json" in result.stderr
