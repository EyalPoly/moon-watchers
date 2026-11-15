import csv
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from build.make_masks import build_bundle
from tests.ephemeris_helpers import default_ephemeris
from engine.cli import main
from tests.test_api_horizon import catalog_yaml, write_world
from tests.test_masks_build import CATALOG


def read_csv(path: Path) -> tuple[str, list[dict[str, str]]]:
    lines = path.read_text().splitlines()
    return lines[0], list(csv.DictReader(lines[1:]))


@pytest.fixture(scope="module")
def bundle_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("cli")
    write_world(root / "sources")
    return build_bundle(CATALOG, root / "sources", root / "bundle", default_ephemeris())


def run(bundle_dir: Path, out: Path, *extra: str) -> None:
    assert main(["horizon", "--site", "s1", "--bundle", str(bundle_dir), "--out", str(out), *extra]) == 0


def test_cli_writes_720_rows(bundle_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "h.csv"
    run(bundle_dir, out, "--height", "3")
    comment, rows = read_csv(out)
    assert comment.startswith("# site=s1 height_m=3 bundle=")
    assert "algo_version=" in comment and "warnings=" in comment
    assert len(rows) == 720
    assert rows[0]["az_deg"] == "0.0" and rows[-1]["az_deg"] == "359.5"
    assert list(rows[0]) == ["az_deg", "elevation_deg", "low_deg", "high_deg", "blocking_distance_km"]


def test_cli_matches_api(bundle_dir: Path, catalog_path: Path, tmp_path: Path) -> None:
    out = tmp_path / "h.csv"
    run(bundle_dir, out, "--height", "5")
    _, rows = read_csv(out)
    api = TestClient(create_app(catalog_path=catalog_path, bundle_dir=bundle_dir))
    body = api.get("/api/v1/sites/s1/horizon?mast=5").json()
    assert [float(r["elevation_deg"]) for r in rows] == body["elevation_deg"]
    assert [float(r["blocking_distance_km"]) for r in rows] == body["distance_km"]


@pytest.fixture(scope="module")
def catalog_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return catalog_yaml(tmp_path_factory.mktemp("cat") / "sites.yaml")


def test_cli_far_part(bundle_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "far.csv"
    run(bundle_dir, out, "--part", "far")
    comment, rows = read_csv(out)
    assert "height_m=far" in comment and len(rows) == 720


def test_cli_unknown_is_empty_cell(tmp_path: Path) -> None:
    root = tmp_path / "holed"
    write_world(root / "sources", hole_at=(52_000.0, 30_300.0))
    bundle = build_bundle(CATALOG, root / "sources", root / "bundle", default_ephemeris())
    out = tmp_path / "h.csv"
    run(bundle, out)
    _, rows = read_csv(out)
    assert rows[180]["elevation_deg"] == "" and rows[180]["blocking_distance_km"] == ""
    assert rows[540]["elevation_deg"] != ""
    assert np.isfinite(float(rows[540]["elevation_deg"]))


def test_cli_unknown_site_fails(bundle_dir: Path, tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        main(["horizon", "--site", "nope", "--bundle", str(bundle_dir), "--out", str(tmp_path / "x.csv")])


def run_series(bundle_dir: Path, catalog: Path, out: Path, *extra: str) -> int:
    return main(
        ["series", "--site", "s1", "--month", "2027-03", "--bundle", str(bundle_dir),
         "--catalog", str(catalog), "--out", str(out), *extra]
    )


@pytest.fixture(scope="module")
def catalog_file(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return catalog_yaml(tmp_path_factory.mktemp("cat") / "sites.yaml")


def test_series_cli_rows(bundle_dir: Path, catalog_file: Path, tmp_path: Path) -> None:
    out = tmp_path / "s.csv"
    assert run_series(bundle_dir, catalog_file, out) == 0
    header, rows = read_csv(out)
    assert header.startswith("# site=s1 month=2027-03 panel_m=2 antenna_m=3 station=29.7604,-95.3698,0,0 bundle=")
    assert len(rows) == 4464
    assert rows[0]["utc"] == "2027-03-01T00:00Z" and rows[-1]["utc"] == "2027-03-31T23:50Z"
    assert list(rows[0])[:3] == ["utc", "sun_az", "sun_el"] and "contact" in rows[0]
    assert set(r["earth_station_up"] for r in rows) == {"0", "1"}


def test_series_cli_matches_api(bundle_dir: Path, catalog_file: Path, tmp_path: Path) -> None:
    out = tmp_path / "s.csv"
    assert run_series(bundle_dir, catalog_file, out, "--panel", "2.5", "--antenna", "4.25") == 0
    _, rows = read_csv(out)
    api = TestClient(create_app(catalog_path=catalog_file, bundle_dir=bundle_dir))
    body = api.get("/api/v1/scenario/series?site=s1&t0=2027-03-01T00:00Z&month=2027-03&panel=2.5&antenna=4.25").json()
    for name in ("sun_az", "station_el", "sun_lit_frac", "sun_horizon_el"):
        assert [float(r[name]) for r in rows] == body[name]
    assert [int(r["contact"]) for r in rows] == body["contact"]
    assert [int(r["earth_station_up"]) for r in rows] == [int(v) for v in body["earth_station_up"]]


def test_series_cli_unknown_is_empty_cell(tmp_path: Path) -> None:
    root = tmp_path / "holed"
    write_world(root / "sources", hole_at=(52_000.0, 30_300.0))
    bundle = build_bundle(CATALOG, root / "sources", root / "bundle", default_ephemeris())
    catalog = catalog_yaml(tmp_path / "c.yaml")
    out = tmp_path / "s.csv"
    assert run_series(bundle, catalog, out) == 0
    _, rows = read_csv(out)
    assert any(r["sun_horizon_el"] == "" for r in rows) and any(r["sun_horizon_el"] != "" for r in rows)


@pytest.mark.parametrize("extra", [["--station", "1,2,3"], ["--panel", "2.555"], ["--station", "95,0,0,0"]])
def test_series_cli_bad_input_exits_nonzero(bundle_dir: Path, catalog_file: Path, tmp_path: Path, extra: list[str]) -> None:
    with pytest.raises(SystemExit) as error:
        run_series(bundle_dir, catalog_file, tmp_path / "s.csv", *extra)
    assert error.value.code not in (0, None)
    assert not (tmp_path / "s.csv").exists()


def test_series_cli_month_outside_table_exits_nonzero(bundle_dir: Path, catalog_file: Path, tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as error:
        main(["series", "--site", "s1", "--month", "2031-05", "--bundle", str(bundle_dir),
              "--catalog", str(catalog_file), "--out", str(tmp_path / "s.csv")])
    assert error.value.code not in (0, None)


def run_summary(bundle_dir: Path, catalog: Path, out: Path, *extra: str) -> int:
    return main(
        ["summary", "--site", "s1", "--t0", "2027-03-01T00:00Z", "--bundle", str(bundle_dir),
         "--catalog", str(catalog), "--out", str(out), *extra]
    )


def split_summary(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    lines = path.read_text().splitlines()
    comments = [line for line in lines if line.startswith("#")]
    return comments, list(csv.DictReader(line for line in lines if not line.startswith("#")))


def test_summary_cli_rows(bundle_dir: Path, catalog_file: Path, tmp_path: Path) -> None:
    out = tmp_path / "m.csv"
    assert run_summary(bundle_dir, catalog_file, out, "--margin", "12") == 0
    comments, rows = split_summary(out)
    assert comments[0].startswith("# site=s1 t0=2027-03-01T00:00Z days=30 panel_m=2 antenna_m=3 station=")
    assert any(c.startswith("# score value=") for c in comments)
    assert any(c.startswith("# metric sun_pct=") for c in comments)
    assert any(c.startswith("# factor L weight=") for c in comments)
    assert list(rows[0]) == ["day", "start_utc", "end_utc", "hours", "sun_pct", "dte_pct", "sun_disk_mean"]
    assert len(rows) == 31
    assert rows[0]["hours"] == "24" and rows[-1]["hours"] == "12"
    assert rows[0]["start_utc"] == "2027-02-28T12:00Z"


def test_summary_cli_matches_api(bundle_dir: Path, catalog_file: Path, tmp_path: Path) -> None:
    out = tmp_path / "m.csv"
    assert run_summary(bundle_dir, catalog_file, out, "--w", "0.6,0.2,0,0,0,0.1,0.1", "--slope", "0,10,20") == 0
    comments, rows = split_summary(out)
    api = TestClient(create_app(catalog_path=catalog_file, bundle_dir=bundle_dir))
    body = api.get(
        "/api/v1/scenario/summary?site=s1&t0=2027-03-01T00:00Z&w=0.6,0.2,0,0,0,0.1,0.1&slope=0,10,20"
    ).json()
    metrics = {c.split()[2].split("=")[0]: c.split("=", 1)[1] for c in comments if c.startswith("# metric ")}
    assert float(metrics["sun_pct"]) == body["metrics"]["sun_pct"]
    assert float(metrics["longest_dark_h"]) == body["metrics"]["longest_dark_h"]
    score = next(c for c in comments if c.startswith("# score "))
    assert f"value={body['score']['value']} category={body['score']['category']}" in score
    assert [float(r["sun_pct"]) for r in rows] == body["daily"]["sun_pct"]


@pytest.mark.parametrize(
    ("extra", "word"),
    [(["--w", "1,1,1,0"], "w"), (["--slope", "20,10,15"], "slope"), (["--days", "400"], "days"), (["--t0", "2027-03-01T00:07Z"], "t0")],
)
def test_summary_cli_bad_setting_exits_nonzero(
    bundle_dir: Path, catalog_file: Path, tmp_path: Path, extra: list[str], word: str
) -> None:
    with pytest.raises(SystemExit) as error:
        run_summary(bundle_dir, catalog_file, tmp_path / "m.csv", *extra)
    assert word in str(error.value.code)
    assert not (tmp_path / "m.csv").exists()


def test_summary_api_rejects_off_grid_t0(bundle_dir: Path, catalog_file: Path) -> None:
    api = TestClient(create_app(catalog_path=catalog_file, bundle_dir=bundle_dir))
    response = api.get("/api/v1/scenario/summary?site=s1&t0=2027-03-01T00:07Z")
    assert response.status_code == 422 and response.json()["code"] == "INVALID_PARAM"
