import pytest

pytest.importorskip("torch")

from build.gpu_spike import run_spike  # noqa: E402


def small() -> dict[str, object]:
    return run_spike(device="cpu", n_dirs=4, n_steps=16, n_points=3, dem_size=32)


def test_result_has_all_keys() -> None:
    assert set(small()) == {"device", "lookups", "seconds", "lookups_per_s", "peak_mem_mb"}


def test_lookup_count_is_points_times_dirs_times_steps() -> None:
    assert small()["lookups"] == 3 * 4 * 16


def test_cpu_device_is_honoured() -> None:
    assert small()["device"] == "cpu"


def test_throughput_is_positive() -> None:
    rate = small()["lookups_per_s"]
    assert isinstance(rate, float) and rate > 0
