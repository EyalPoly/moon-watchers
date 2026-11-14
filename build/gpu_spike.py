"""Timing proxy for the horizon ray-march: bilinear DEM lookups along straight rays."""

import argparse
import json
import math
import time
from typing import Any

MOON_RADIUS_M = 1_737_400.0
CELL_M = 20.0


def pick_device(torch: Any, requested: str) -> str:
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def synchronize(torch: Any, device: str) -> None:
    if device == "cuda":
        torch.cuda.synchronize()
    elif device == "mps":
        torch.mps.synchronize()


def origin_bounds(dem_size: int, n_steps: int) -> tuple[int, int]:
    """Cell range for ray origins such that no ray leaves the DEM (border clamping would
    re-read the same cached cells and inflate throughput)."""
    low = n_steps + 2
    high = dem_size - n_steps - 3
    if high <= low:
        raise ValueError(f"dem_size {dem_size} is too small for rays of {n_steps} steps")
    return low, high


def run_spike(
    device: str, n_dirs: int, n_steps: int, n_points: int, dem_size: int
) -> dict[str, Any]:
    import torch

    device = pick_device(torch, device)
    low, high = origin_bounds(dem_size, n_steps)
    generator = torch.Generator().manual_seed(0)
    dem = (torch.rand(dem_size, dem_size, generator=generator) * 2000.0).to(device)
    origin = (low + torch.rand(n_points, 2, generator=generator) * (high - low)).to(device)
    angles = torch.arange(n_dirs, dtype=torch.float32) * (2 * math.pi / n_dirs)
    direction = torch.stack([torch.cos(angles), torch.sin(angles)], dim=1).to(device)

    obs_h = dem[origin[:, 1].long(), origin[:, 0].long()].unsqueeze(1)
    best = torch.full((n_points, n_dirs), -math.pi / 2, device=device)
    limit = float(dem_size - 1)

    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
    synchronize(torch, device)
    start = time.perf_counter()
    for step in range(1, n_steps + 1):
        pos = origin.unsqueeze(1) + direction.unsqueeze(0) * step
        x = pos[..., 0].clamp(0.0, limit - 1e-3)
        y = pos[..., 1].clamp(0.0, limit - 1e-3)
        x0 = x.floor().long()
        y0 = y.floor().long()
        fx = x - x0
        fy = y - y0
        h = (
            dem[y0, x0] * (1 - fx) * (1 - fy)
            + dem[y0, x0 + 1] * fx * (1 - fy)
            + dem[y0 + 1, x0] * (1 - fx) * fy
            + dem[y0 + 1, x0 + 1] * fx * fy
        )
        theta = (step * CELL_M) / MOON_RADIUS_M
        radius_t = MOON_RADIUS_M + h
        elevation = torch.atan2(
            h - obs_h - radius_t * 2.0 * math.sin(theta / 2) ** 2,
            radius_t * math.sin(theta),
        )
        best = torch.maximum(best, elevation)
    synchronize(torch, device)
    seconds = time.perf_counter() - start

    lookups = n_points * n_dirs * n_steps
    peak = torch.cuda.max_memory_allocated() / 1e6 if device == "cuda" else None
    return {
        "device": device,
        "lookups": lookups,
        "seconds": seconds,
        "lookups_per_s": lookups / max(seconds, 1e-9),
        "peak_mem_mb": peak,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "mps", "cpu"])
    parser.add_argument("--points", type=int, default=200)
    parser.add_argument("--dirs", type=int, default=720)
    # physics prototype: 40 m steps to 10 km (250) plus 240 m steps to 300 km (1,208)
    parser.add_argument("--steps", type=int, default=1_458)
    parser.add_argument("--dem-size", type=int, default=0)
    args = parser.parse_args()
    dem_size = args.dem_size or max(args.steps * 2 + 8, 8192)
    print(json.dumps(run_spike(args.device, args.dirs, args.steps, args.points, dem_size), indent=2))


if __name__ == "__main__":
    main()
