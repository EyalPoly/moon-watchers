import json
import re
from pathlib import Path

LOCK = Path("data/sources.lock.json")

EXPECTED = {
    "layers/slope/LDSM_80S_80MPP_ADJ.TIF",
    "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.SHP",
    "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.DBF",
    "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.SHX",
    "layers/psr_1km2/LPSR_80S_20MPP_ADJ_1km2.PRJ",
    "layers/psr_large/NAC_POLE_PSR_SOUTH.ZIP",
    "layers/mission_sites/ANTHROPOGENIC_OBJECTS_180.ZIP",
    "layers/artemis3/A3_9regions-lonlat-simplified.geojson",
    "layers/artemis3/A3_Named_regions.geojson",
    "layers/endurance/EnduranceTraverse_240129-v2.geojson",
}


def test_layer_sources_are_pinned() -> None:
    entries = [e for e in json.loads(LOCK.read_text())["files"] if e["path"].startswith("layers/")]
    assert {e["path"] for e in entries} == EXPECTED
    for entry in entries:
        assert re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]), entry["path"]
        assert entry["bytes"] > 0
        assert entry["url"].startswith("https://")
