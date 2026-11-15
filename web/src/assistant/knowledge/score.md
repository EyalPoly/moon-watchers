# The score (grade) and its weights

The score is the physics team's illustrative formula, computed by `engine/score.py` (`raw_grades`, `score_arrays`, `site_score`) with settings from `config/score.yaml`. **Illustrative: not validated landing criteria.**

## Seven grades, each 0 (bad) to 1 (good)
| Id | Grade | How it is computed |
|---|---|---|
| L | sunlight | `sun_disk_mean`: average daily visible fraction of the Sun's disk |
| C | station contact | `contact_mean`: average daily share of time with contact |
| DK | longest darkness | `1 − longest_dark_h / window length` (a 15-day night in a 30.5-day window gives 0.51) |
| OT | longest outage | `1 − longest_no_contact_h / window length` |
| LS | sunlight at landing | 1 if the sunlight at the window start lasts ≥ the required hours (default **6 h**), else 0 (pass/fail) |
| S | slope | 1 at or below "fully good" (0°), falling in a straight line to 0 at "fully bad" (15°) |
| D | lunar regolith (simulated) | `1 − D`, D a simulated lunar regolith (dust) index 0–1 (a fixed wave pattern, not measured) |

## Formula
`score = 100 × Σ w·grade / Σ w` over the seven grades.
- **Weights are relative**: only ratios matter. Each runs 0–1 in steps of 0.05; at least one must be above 0. A weight of 0 switches that grade off.
- **Points lost** by each grade: `100 × w / Σw × (1 − grade)`. They add up to `100 − score`.
- **Deciding factor**: the grade that lost the most points (ties are all named). The explanation gives its raw value, grade, weight share and points lost.
- Light and communication overlap (`both_pct`) is **not** in the score.

## Presets
| Preset | L | C | DK | OT | LS | S | D |
|---|---|---|---|---|---|---|---|
| Default (physics team) | 0.25 | 0.25 | 0.15 | 0.15 | 0.10 | 0.10 | 0 |
| Sunlight first | 0.60 | 0.20 | 0 | 0 | 0 | 0.10 | 0.10 |

## Gates and missing data
- **Inside a PSR** (permanently shadowed region, NASA PSR map): score 0, category "excluded", every grade set to 0. On by default; "Reject sites inside a PSR" can switch it off. If the map has no value at the site, the gate is skipped with the warning `PSR_UNKNOWN`.
- **Slope above the maximum** (default 15°): score 0, "excluded".
- **A missing grade** with a weight above 0 counts as 0, with the warning `NULL_GRADE:<grade>`: missing data can only lower the score.
- **Colors**: green ≥ 70, amber ≥ 40, red below 40 (settable).

## Every setting (the Grading Weights button)
| Setting | Default | Range |
|---|---|---|
| Weights L, C, DK, OT, LS, S, D | 0.25, 0.25, 0.15, 0.15, 0.10, 0.10, 0 | 0–1, step 0.05 |
| Required sunlight at landing (LS) | 6 h | 0–72 h |
| Slope: fully good at, fully bad at, maximum | 0°, 15°, 15° | 0–90° |
| Reject sites inside a PSR | on | on/off |
| Landing margin before landing | 12 h | 0–48 h (moves the mission window) |
| Colors: green from, amber from | 70, 40 | 0–100 |

Changing weights or thresholds re-scores instantly from numbers already computed; no new physics.

## Advising on weights (how goals map to grades)
- "More sunlight / power": raise **L**, and **DK** (shorter nights) and **LS** (sunlight right after landing).
- "Better communication": raise **C**, and **OT** (shorter outages).
- "Survive the night": raise **DK** (and **OT** if commands are needed during the night).
- "Safe landing / flat ground": raise **S** (and consider lowering the maximum slope).
- "Avoid lunar regolith / dust": raise **D**, remembering it is simulated.
Keep the weights summing to about 1 for readability (only ratios matter). Say what the change trades away.

Sources: `engine/score.py`, `config/score.yaml`, `api/summary_json.py`, `web/src/api/scoreSettings.ts`, `web/src/ui/ScoreSettingsPanel.tsx`, design spec §7.5.
