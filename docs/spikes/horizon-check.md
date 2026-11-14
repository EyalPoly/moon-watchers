# Horizon check

## Comparison with the physics prototype (Mac, cached 20 m / 80 m / 240 m crops)

`tests/test_reference_horizon.py` runs our `march` and the prototype's `build_horizon` on the same
cached LOLA crops, with the prototype's settings (0.5° azimuths, 40 m steps to 10 km, 240 m steps to
300 km, 20 km ceiling). Demo points A (−89°, 0°) and B (−89°, 8°), at 2 m (panel) and 3 m (antenna).

| Point | Height | Finite directions | Max difference, nominal | low | high |
|---|---|---|---|---|---|
| A | 2 m | 720 / 720 | 1.6e-5° | 1.6e-5° | 1.6e-5° |
| A | 3 m | 720 / 720 | 1.6e-5° | 1.6e-5° | 1.6e-5° |
| B | 2 m | 720 / 720 | 1.4e-5° | 1.4e-5° | 1.6e-5° |
| B | 3 m | 720 / 720 | 1.2e-5° | 1.2e-5° | 1.3e-5° |

Acceptance in the test: nominal within 0.01°, low and high within 0.002°, and the same directions unknown.
Skylines span −0.087° to 6.4° at A and 0.46° to 9.3° at B.

The first comparison caught a defect: low and high differed by 0.015°, because the bounds pass rounded
the target radius (R + h, about 1.7e6 m) to float32, which is only good to 0.125 m. It now works from heights.

## Convergence and the full 20 m terrain (GPU PC)

Not run yet. On the GPU PC: `make fetch ONLY=lola/LDEM_80S_20MPP_ADJ`, then
`uv run python -m build.converge --sites <ids>`, and record the three changes here
(near step 40 m vs 20 m, near window 10 km vs 20 km, reach 300 km vs 400 km).
