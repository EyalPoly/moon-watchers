import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

from api.bundle import BundleError, load_bundle
from build.make_ephemeris import KERNELS, build_ephemeris, direct_sky
from build.make_masks import add_ephemeris, build_bundle
from engine.geometry import Ephemeris, interpolate
from tests.ephemeris_helpers import synthetic_ephemeris
from tests.test_masks_build import CATALOG, make_sources

EPH_START = datetime(2027, 2, 27, tzinfo=UTC)
SPICE_DIR = Path("data/sources/spice")


def synthetic() -> Ephemeris:
    return synthetic_ephemeris(EPH_START, 5)


def spice_ready() -> bool:
    return all((SPICE_DIR / name).is_file() for name in KERNELS)


needs_spice = pytest.mark.skipif(not spice_ready(), reason="SPICE kernels not downloaded")


def test_bundle_holds_ephemeris(tmp_path: Path) -> None:
    sources = make_sources(tmp_path)
    eph = synthetic()
    bundle = build_bundle(CATALOG, sources, tmp_path / "bundle", eph)
    loaded = load_bundle(bundle, CATALOG).ephemeris
    assert np.array_equal(loaded.vectors_km, eph.vectors_km)
    assert np.array_equal(loaded.earth_rotation, eph.earth_rotation)
    assert loaded.start == eph.start and loaded.step_s == eph.step_s
    entry = json.loads((bundle / "manifest.json").read_text())["ephemeris"]
    assert entry["rows"] == eph.vectors_km.shape[0]
    assert entry["corrections"] == {"sun": "CN+S", "earth_occultor": "CN+S", "earth_contact": "NONE"}

    changed = Ephemeris(eph.start, eph.step_s, eph.vectors_km.copy(), eph.earth_rotation)
    changed.vectors_km[3, 4] += 1.0
    assert build_bundle(CATALOG, sources, tmp_path / "bundle2", changed).name != bundle.name


def s2_style_bundle(tmp_path: Path) -> Path:
    built = build_bundle(CATALOG, make_sources(tmp_path), tmp_path / "full", synthetic())
    old = tmp_path / "old" / "20261110-5a5a5a5a"
    shutil.copytree(built, old)
    (old / "server" / "ephemeris.npy").unlink()
    (old / "server" / "earth_rotation.npy").unlink()
    manifest = json.loads((old / "manifest.json").read_text())
    del manifest["ephemeris"]
    manifest["bundle_id"] = old.name
    (old / "manifest.json").write_text(json.dumps(manifest))
    return old


def test_add_ephemeris_keeps_masks(tmp_path: Path) -> None:
    old = s2_style_bundle(tmp_path)
    new = add_ephemeris(old, tmp_path / "new", synthetic())
    assert new.name != old.name
    for site_id in CATALOG:
        for name in ("masks.npy", "blocking.npy"):
            before = (old / "server" / "sites" / site_id / name).read_bytes()
            assert (new / "server" / "sites" / site_id / name).read_bytes() == before
    assert load_bundle(new, CATALOG).ephemeris.vectors_km.shape[1] == 9
    with pytest.raises(ValueError, match="already has"):
        add_ephemeris(new, tmp_path / "again", synthetic())


def test_add_ephemeris_refuses_other_algo_version(tmp_path: Path) -> None:
    old = s2_style_bundle(tmp_path)
    manifest = json.loads((old / "manifest.json").read_text())
    manifest["algo_version"] = "0"
    (old / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="algo_version"):
        add_ephemeris(old, tmp_path / "new", synthetic())


@pytest.fixture(scope="module")
def good_bundle(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("eph")
    return build_bundle(CATALOG, make_sources(root), root / "bundle", synthetic())


def broken_copy(good: Path, tmp_path: Path) -> Path:
    broken = tmp_path / "broken"
    shutil.copytree(good, broken)
    return broken


def test_bundle_without_ephemeris_key_refused(good_bundle: Path, tmp_path: Path) -> None:
    broken = broken_copy(good_bundle, tmp_path)
    manifest = json.loads((broken / "manifest.json").read_text())
    del manifest["ephemeris"]
    (broken / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(BundleError, match="ephemeris"):
        load_bundle(broken, CATALOG)


def test_bundle_without_rotation_file_refused(good_bundle: Path, tmp_path: Path) -> None:
    broken = broken_copy(good_bundle, tmp_path)
    (broken / "server" / "earth_rotation.npy").unlink()
    with pytest.raises(BundleError, match="earth_rotation.npy"):
        load_bundle(broken, CATALOG)


def test_bundle_with_wrong_shape_refused(good_bundle: Path, tmp_path: Path) -> None:
    broken = broken_copy(good_bundle, tmp_path)
    np.save(broken / "server" / "ephemeris.npy", np.zeros((10, 8)))
    with pytest.raises(BundleError, match="ephemeris.npy"):
        load_bundle(broken, CATALOG)


@needs_spice
def test_table_matches_direct_spice() -> None:
    start = datetime(2027, 3, 1, tzinfo=UTC)
    eph = build_ephemeris(SPICE_DIR, start, start + timedelta(days=3))
    rng = np.random.default_rng(11)
    t = np.sort(rng.uniform(3600, 3 * 86400 - 7200, 50))
    times = [start + timedelta(seconds=float(s)) for s in t]
    direct = direct_sky(SPICE_DIR, times)
    table = interpolate(eph, t)

    def separation(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        cos = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
        return np.degrees(np.arccos(np.clip(cos, -1, 1)))

    assert separation(table.sun_cns_km, direct.sun_cns_km).max() < 1e-5
    assert separation(table.earth_cns_km, direct.earth_cns_km).max() < 1e-5
    assert np.abs(table.earth_geo_km - direct.earth_geo_km).max() < 0.01
    assert np.abs(table.earth_rotation - direct.earth_rotation).max() < 1e-9


@needs_spice
def test_table_frame_is_moon_me() -> None:
    start = datetime(2027, 3, 1, tzinfo=UTC)
    eph = build_ephemeris(SPICE_DIR, start, start + timedelta(days=400), step_s=6 * 3600)
    earth = eph.vectors_km[0, 6:9]
    sub_lon = np.degrees(np.arctan2(earth[1], earth[0]))
    assert abs(sub_lon) < 8
    sun = eph.vectors_km[:, 0:3]
    latitude = np.degrees(np.arcsin(sun[:, 2] / np.linalg.norm(sun, axis=1)))
    assert latitude.max() > 0 > latitude.min()
    assert np.abs(latitude).max() < 1.6


def test_newest_bundle_follows_creation_time_not_name(tmp_path: Path) -> None:
    from api.bundle import newest_bundle

    for name, created in (("20261114-ffffffff", "2026-11-14T08:00:00+00:00"), ("20261114-00000000", "2026-11-14T09:00:00+00:00")):
        folder = tmp_path / name
        folder.mkdir()
        (folder / "manifest.json").write_text(json.dumps({"bundle_id": name, "created": created}))
    (tmp_path / "stray").mkdir()
    assert newest_bundle(tmp_path).name == "20261114-00000000"  # type: ignore[union-attr]
    assert newest_bundle(tmp_path / "missing") is None
