# GPU timing spike

`build/gpu_spike.py` times bilinear DEM lookups along straight rays with the spec's 32-bit elevation formula and a running maximum per direction. It is a timing proxy for the horizon computation, not the engine.

## Workload to extrapolate with

From the physics prototype (`MenasimMoon`, `scripts/make_notebook.py`, `lunar_nav/terrain.py:98-165`): 720 azimuths (0.5° apart), 40 m steps out to 10 km (250 steps) and 240 m steps out to 300 km (1,208 steps), so about 1,458 steps per direction and about 1.05 million lookups per observer point. Their CPU run takes about 9 s per point.

## How to run

```
uv sync --extra gpu
uv run python build/gpu_spike.py --device cuda --points 200 --dirs 720 --steps 1458
```

Scale `--points` up (2,000, 40,000) while watching GPU memory; the tensors per step are `points x dirs` floats.

## Results

| Device | Points | Lookups | Seconds | Lookups/s | Peak MB |
|---|---|---|---|---|---|
| Mac (Intel) | - | - | - | - | not measured: PyTorch has no wheel for Intel macOS |
| RTX 4060 (Windows) | | | | | to be filled in by running the command above |

Extrapolation (fill in after the 4060 run): time for the 5 to 15 billion lookup grid = lookups / lookups_per_s; time for a 1 to 2 million lookup mask likewise.
