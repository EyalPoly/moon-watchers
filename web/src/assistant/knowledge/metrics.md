# Mission metrics and the colored chips

## The mission window
- **[landing − margin, landing + mission length]**. The margin defaults to **12 h** (the physics team's landing margin: the real landing can come a few hours early). It is a score setting, 0–48 h.
- **Days** are 24-hour bins from the window start (not calendar dates). A shorter last day counts in proportion.

## The metrics (all over the window)
| Metric | Meaning |
|---|---|
| Sun % (`sun_pct`) | Share of the mission with any part of the Sun visible |
| Earth % (`dte_pct`) | Share of the mission with Earth contact to the chosen station |
| Sun + Earth together (`both_pct`) | Share with both at once |
| Sunlight (L) (`sun_disk_mean`) | Average visible fraction of the Sun's disk, averaged per day then over the days; a half-hidden Sun counts half |
| Station contact (C) (`contact_mean`) | Average daily share of time with contact |
| Earth above horizon (`earth_any_pct`) | Share with part of the Earth's disk above the terrain (information only) |
| Longest darkness (`longest_dark_h`) | Longest period without sunlight, cut at the window edges; unknown time breaks it |
| Longest comm gap (`longest_no_contact_h`) | Longest period without contact, counted the same way |
| First sunlight (`first_sun_h`) | Hours of sunlight under way at the window start; 0 if it starts dark |
| First dark after landing | Hours from landing until the first darkness; "lands in dark" if 0 |
| Unknown hours (`unknown_h`) | Time whose answer is unknown because of missing terrain |

**Unavailable**: a percentage that includes unknown time is shown as "unavailable", not lowered. The hours known to be visible are still counted.

## The chips (verdict)
Facts about the scenario: score weights never change them. Thresholds are in `config/rag.yaml`:
- **Sun** and **Earth** %: green ≥ 60%, amber 30–59%, red < 30%.
- **Slope**: green ≤ 5°, amber 5–10°, red > 10°.
Each chip's reason is on hover, for example "Sun visible 17.6% of the mission (green ≥ 60%, red < 30%)".

## Why a site can be poor at one time and good at another
Near the pole the Sun stays within a few degrees of the horizon and circles it once a month, so sunlight depends on which ridges lie in its direction. The Earth's elevation swings about ±7° with libration over a month. Moving the landing date by days or by one lunar day (+29.5 d) can change everything.

Sources: `engine/metrics.py`, `api/summary_json.py`, `config/rag.yaml`, design spec §7.4.
