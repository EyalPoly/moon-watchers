import json
import shutil
from pathlib import Path

import numpy as np
import pytest
import yaml
from fastapi.testclient import TestClient

from api.bundle import BundleError
from api.main import create_app
from build.make_masks import build_bundle
from tests.ephemeris_helpers import default_ephemeris
from engine.terrain import project
from tests.test_masks_build import CATALOG, DEM_240
from tests.tif_helpers import write_tif

HALF_M = 400_000.0
CELL_M = 2000.0


def write_world(sources: Path, hole_at: tuple[float, float] | None = None) -> None:
    n = int(2 * HALF_M / CELL_M)
    data = np.zeros((n, n), np.float32)
    if hole_at is not None:
        col = round((hole_at[0] + HALF_M) / CELL_M)
        row = round((HALF_M - hole_at[1]) / CELL_M)
        data[row - 1 : row + 1, col - 1 : col + 1] = np.nan
    write_tif(sources / DEM_240, data, -HALF_M, HALF_M, CELL_M)
    write_tif(
        sources / DEM_240.replace(".TIF", "_ERR.TIF"),
        np.full((n, n), 1.0, np.float32),
        -HALF_M,
        HALF_M,
        CELL_M,
    )


def catalog_yaml(path: Path) -> Path:
    path.write_text(
        yaml.safe_dump({"sites": [site.model_dump() for site in CATALOG.values()]})
    )
    return path


@pytest.fixture(scope="module")
def bundle_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("world")
    write_world(root / "sources")
    return build_bundle(CATALOG, root / "sources", root / "bundle", default_ephemeris())


@pytest.fixture(scope="module")
def holed_bundle_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("holed")
    east_x, east_y = project(-89.0, 0.0)
    write_world(root / "sources", hole_at=(52_000.0, float(east_y)))
    return build_bundle(CATALOG, root / "sources", root / "bundle", default_ephemeris())


@pytest.fixture(scope="module")
def catalog_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return catalog_yaml(tmp_path_factory.mktemp("catalog") / "sites.yaml")


@pytest.fixture(scope="module")
def client(bundle_dir: Path, catalog_path: Path) -> TestClient:
    return TestClient(create_app(catalog_path=catalog_path, bundle_dir=bundle_dir))


def test_horizon_ok(client: TestClient, bundle_dir: Path) -> None:
    response = client.get("/api/v1/sites/s1/horizon")
    body = response.json()
    assert response.status_code == 200
    assert len(body["elevation_deg"]) == 720 and len(body["distance_km"]) == 720
    assert body["mast_m"] == 2 and body["part"] == "full"
    assert body["algo_version"] == json.loads((bundle_dir / "manifest.json").read_text())["algo_version"]
    assert all(v is not None for v in body["elevation_deg"])


def test_far_part(client: TestClient, bundle_dir: Path) -> None:
    body = client.get("/api/v1/sites/s1/horizon?part=far&mast=7").json()
    assert body["mast_m"] == 2.0
    masks = np.load(bundle_dir / "server" / "sites" / "s1" / "masks.npy")
    np.testing.assert_allclose(body["elevation_deg"], masks[0, 10], atol=1e-4)


def test_height_changes_values(client: TestClient) -> None:
    one = client.get("/api/v1/sites/s1/horizon?mast=1").json()["elevation_deg"]
    ten = client.get("/api/v1/sites/s1/horizon?mast=10").json()["elevation_deg"]
    assert one != ten
    assert all(b <= a for a, b in zip(one, ten, strict=True))


def test_unknown_direction_is_null(holed_bundle_dir: Path, catalog_path: Path) -> None:
    client = TestClient(create_app(catalog_path=catalog_path, bundle_dir=holed_bundle_dir))
    response = client.get("/api/v1/sites/s1/horizon")
    assert "NaN" not in response.text
    body = response.json()
    assert body["elevation_deg"][180] is None and body["distance_km"][180] is None
    assert body["elevation_deg"][540] is not None
    assert "DEM_GAPS" in body["warnings"]


@pytest.mark.parametrize("mast", ["0", "11", "abc", ""])
def test_bad_mast(client: TestClient, mast: str) -> None:
    response = client.get(f"/api/v1/sites/s1/horizon?mast={mast}")
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_PARAM"


def test_centimetre_mast(client: TestClient) -> None:
    def elevation(mast: str) -> list[float]:
        return client.get(f"/api/v1/sites/s1/horizon?mast={mast}").json()["elevation_deg"]

    body = client.get("/api/v1/sites/s1/horizon?mast=2.5").json()
    assert body["mast_m"] == 2.5
    two, mid, three = elevation("2"), body["elevation_deg"], elevation("3")
    assert all(b <= m <= a for a, m, b in zip(two, mid, three, strict=True))
    assert mid != two and mid != three


def test_whole_metre_mast_is_the_stored_row(client: TestClient, bundle_dir: Path) -> None:
    masks = np.load(bundle_dir / "server" / "sites" / "s1" / "masks.npy")
    body = client.get("/api/v1/sites/s1/horizon?mast=3").json()
    np.testing.assert_allclose(body["elevation_deg"], masks[0, 2], atol=1e-4)


@pytest.mark.parametrize("mast", ["2.555", "2.001", "10.01", "0.99"])
def test_mast_finer_than_cm_is_422(client: TestClient, mast: str) -> None:
    response = client.get(f"/api/v1/sites/s1/horizon?mast={mast}")
    assert response.status_code == 422 and response.json()["code"] == "INVALID_PARAM"


def test_bad_part(client: TestClient) -> None:
    response = client.get("/api/v1/sites/s1/horizon?part=middle")
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PARAM"


@pytest.mark.parametrize(
    "hostile",
    ["../x", "%2e%2e", "a" * 200, "x y", "%00", "..%2f..%2fetc%2fpasswd", "nope"],
)
def test_unknown_and_hostile_site_ids(client: TestClient, hostile: str) -> None:
    response = client.get(f"/api/v1/sites/{hostile}/horizon")
    assert response.status_code in (404, 422)
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "INVALID_PARAM"


def test_no_bundle_is_503() -> None:
    response = TestClient(create_app()).get("/api/v1/sites/sample_a/horizon")
    assert response.status_code == 503
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "FEATURE_DISABLED"


def test_versioned_get_is_immutable(client: TestClient) -> None:
    versioned = client.get("/api/v1/sites/s1/horizon?v=x")
    assert versioned.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert "immutable" not in client.get("/api/v1/sites/s1/horizon").headers.get("cache-control", "")


def copy_bundle(bundle_dir: Path, tmp_path: Path) -> Path:
    target = tmp_path / "copy"
    shutil.copytree(bundle_dir, target)
    return target


def test_startup_refuses_stale_algo_version(bundle_dir: Path, catalog_path: Path, tmp_path: Path) -> None:
    broken = copy_bundle(bundle_dir, tmp_path)
    manifest = json.loads((broken / "manifest.json").read_text())
    manifest["algo_version"] = "0"
    (broken / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(BundleError, match="algo_version"):
        create_app(catalog_path=catalog_path, bundle_dir=broken)


def test_startup_refuses_missing_masks(bundle_dir: Path, catalog_path: Path, tmp_path: Path) -> None:
    broken = copy_bundle(bundle_dir, tmp_path)
    (broken / "server" / "sites" / "s2" / "masks.npy").unlink()
    with pytest.raises(BundleError, match="masks.npy"):
        create_app(catalog_path=catalog_path, bundle_dir=broken)


def test_startup_refuses_wrong_shape(bundle_dir: Path, catalog_path: Path, tmp_path: Path) -> None:
    broken = copy_bundle(bundle_dir, tmp_path)
    np.save(broken / "server" / "sites" / "s2" / "blocking.npy", np.zeros((3, 3), np.float32))
    with pytest.raises(BundleError, match="blocking.npy"):
        create_app(catalog_path=catalog_path, bundle_dir=broken)


@pytest.mark.parametrize("content", ["{", "[]", '{"bundle_id": 1}'])
def test_startup_refuses_corrupt_manifest(
    bundle_dir: Path, catalog_path: Path, tmp_path: Path, content: str
) -> None:
    broken = copy_bundle(bundle_dir, tmp_path)
    (broken / "manifest.json").write_text(content)
    with pytest.raises(BundleError, match="manifest.json"):
        create_app(catalog_path=catalog_path, bundle_dir=broken)


def test_startup_refuses_empty_masks_file(bundle_dir: Path, catalog_path: Path, tmp_path: Path) -> None:
    broken = copy_bundle(bundle_dir, tmp_path)
    (broken / "server" / "sites" / "s1" / "masks.npy").write_bytes(b"")
    with pytest.raises(BundleError, match="masks.npy"):
        create_app(catalog_path=catalog_path, bundle_dir=broken)


def test_startup_refuses_binary_manifest(bundle_dir: Path, catalog_path: Path, tmp_path: Path) -> None:
    broken = copy_bundle(bundle_dir, tmp_path)
    (broken / "manifest.json").write_bytes(b"\xff\xfe\x00\x80")
    with pytest.raises(BundleError, match="manifest.json"):
        create_app(catalog_path=catalog_path, bundle_dir=broken)


def edited_manifest(bundle_dir: Path, tmp_path: Path, change: object) -> Path:
    broken = copy_bundle(bundle_dir, tmp_path)
    manifest = json.loads((broken / "manifest.json").read_text())
    change(manifest)  # type: ignore[operator]
    (broken / "manifest.json").write_text(json.dumps(manifest))
    return broken


@pytest.mark.parametrize(
    "change",
    [
        lambda m: m.pop("sites"),
        lambda m: m["sites"].pop("s1"),
        lambda m: m["sites"].update(s1="x"),
        lambda m: m["sites"].update(s1={"warnings": "DEM_GAPS"}),
    ],
    ids=["no-sites", "site-missing", "site-not-object", "warnings-not-list"],
)
def test_startup_refuses_bad_site_entries(
    bundle_dir: Path, catalog_path: Path, tmp_path: Path, change: object
) -> None:
    broken = edited_manifest(bundle_dir, tmp_path, change)
    with pytest.raises(BundleError, match="manifest.json"):
        create_app(catalog_path=catalog_path, bundle_dir=broken)
