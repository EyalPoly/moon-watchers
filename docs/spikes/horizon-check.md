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

## Skyline at centimetre heights (blend of whole-metre rows)

The bundle keeps one skyline per whole metre; any other height blends the two neighbouring rows
(`mask_at_height`). `tests/test_reference_horizon.py::test_mask_at_height_on_real_terrain` compares the
blend with a direct `march` at that height on the cached crops (Mac).

| Point | Height | Max difference | Directions above 0.01° | Most negative |
|---|---|---|---|---|
| A | 2.5 m | 0.044° | 8 / 720 | −1.4e-5° |
| A | 2.55 m | 0.049° | 8 / 720 | −1.4e-5° |
| B | 2.5 m | 0.035° | 12 / 720 | −3.1e-5° |
| B | 2.55 m | 0.032° | 10 / 720 | −3.1e-5° |

The blend is never lower than the true skyline (conservative). The plan's target was 0.01° everywhere; it
holds in all but 1-2% of directions. Those are directions where the skyline switches between a near and a
far ridge as the height changes, and the blend then follows the higher of the two. On smooth terrain (a
single mountain) the error stays under 0.003°; on bumpy ground of +-3 m within 200 m it reaches 0.2° at
1.5 m. 0.05° is a fifth of the Sun's diameter.

## Convergence and the full 20 m terrain (GPU PC)

Not run yet. On the GPU PC: `make fetch ONLY=lola/LDEM_80S_20MPP_ADJ`, then
`uv run python -m build.converge --sites <ids>`, and record the three changes here
(near step 40 m vs 20 m, near window 10 km vs 20 km, reach 300 km vs 400 km).
