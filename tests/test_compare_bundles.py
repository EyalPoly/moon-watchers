import json
from pathlib import Path

import numpy as np
import pytest
from numpy.typing import NDArray

from build.compare_bundles import ROWS, compare, main
from engine.horizons import HORIZON_ALGO_VERSION

SKY: NDArray[np.float32] = np.linspace(-0.5, 4.0, 720, dtype=np.float32)


def write_bundle(root: Path, bundle_id: str, terrain: str, nominal: dict[str, NDArray[np.float32]]) -> Path:
    folder = root / bundle_id
    for site_id, rows in nominal.items():
        site_dir = folder / "server" / "sites" / site_id
        site_dir.mkdir(parents=True)
        masks = np.zeros((3, 11, 720), np.float32)
        masks[0] = rows
        np.save(site_dir / "masks.npy", masks)
        np.save(site_dir / "blocking.npy", np.zeros((11, 720), np.float32))
    manifest = {
        "bundle_id": bundle_id,
        "algo_version": HORIZON_ALGO_VERSION,
        "parameters": {"terrain": terrain},
        "sites": {site_id: {"warnings": []} for site_id in nominal},
    }
    (folder / "manifest.json").write_text(json.dumps(manifest))
    return folder


def skyline_rows() -> NDArray[np.float32]:
    return np.tile(SKY, (11, 1))


def test_identical_bundles_have_no_change(tmp_path: Path) -> None:
    base = write_bundle(tmp_path, "b20", "20m", {"a": skyline_rows(), "b": skyline_rows()})
    other = write_bundle(tmp_path, "b40", "40m", {"a": skyline_rows(), "b": skyline_rows()})
    changes = compare(base, other)
    assert [(c.site_id, c.row) for c in changes] == [(s, r) for s in ("a", "b") for r in ROWS]
    assert all(c.max_change_deg == 0.0 and c.unknown_differs == 0 for c in changes)


def test_change_is_reported_on_its_row(tmp_path: Path) -> None:
    raised = skyline_rows()
    raised[ROWS["panel 2 m"], 90] += 0.25
    base = write_bundle(tmp_path, "b20", "20m", {"a": skyline_rows()})
    other = write_bundle(tmp_path, "b40", "40m", {"a": raised})
    by_row = {c.row: c for c in compare(base, other)}
    assert by_row["panel 2 m"].max_change_deg == pytest.approx(0.25)
    assert by_row["antenna 3 m"].max_change_deg == 0.0


def test_unknown_directions_that_differ_are_counted(tmp_path: Path) -> None:
    holes = skyline_rows()
    holes[ROWS["far-only"], [10, 20, 30]] = np.nan
    base = write_bundle(tmp_path, "b20", "20m", {"a": skyline_rows()})
    other = write_bundle(tmp_path, "b80", "80m", {"a": holes})
    by_row = {c.row: c for c in compare(base, other)}
    assert by_row["far-only"].unknown_differs == 3
    assert by_row["far-only"].max_change_deg == 0.0


def test_all_unknown_has_no_change_value(tmp_path: Path) -> None:
    empty = np.full((11, 720), np.nan, np.float32)
    base = write_bundle(tmp_path, "b20", "20m", {"a": skyline_rows()})
    other = write_bundle(tmp_path, "b80", "80m", {"a": empty})
    assert all(c.max_change_deg is None and c.unknown_differs == 720 for c in compare(base, other))


def test_bundles_with_different_sites_are_rejected(tmp_path: Path) -> None:
    base = write_bundle(tmp_path, "b20", "20m", {"a": skyline_rows()})
    other = write_bundle(tmp_path, "b40", "40m", {"b": skyline_rows()})
    with pytest.raises(ValueError, match="sites"):
        compare(base, other)


def test_main_prints_one_line_per_site_and_row(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    base = write_bundle(tmp_path, "b20", "20m", {"a": skyline_rows()})
    other = write_bundle(tmp_path, "b40", "40m", {"a": skyline_rows()})
    assert main([str(base), str(other)]) == 0
    out = capsys.readouterr().out
    assert "40m (b40) vs 20m (b20)" in out
    assert out.count("a: ") == len(ROWS)


def test_mask_of_the_wrong_shape_is_rejected(tmp_path: Path) -> None:
    base = write_bundle(tmp_path, "b20", "20m", {"a": skyline_rows()})
    other = write_bundle(tmp_path, "b40", "40m", {"a": skyline_rows()})
    np.save(other / "server" / "sites" / "a" / "masks.npy", np.zeros((3, 10, 720), np.float32))
    with pytest.raises(ValueError, match="shape"):
        compare(base, other)
