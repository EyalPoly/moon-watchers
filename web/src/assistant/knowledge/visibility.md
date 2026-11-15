# How sunlight and Earth contact are calculated

## The terrain skyline (horizon mask)
- For each site the engine traces the terrain outward in **720 directions (every 0.5°)** and keeps, in each direction, the highest elevation angle of the terrain. That is the **skyline** the Sun and Earth must clear.
- It uses NASA LOLA terrain maps: **20 m** cells near the site (40 m steps out to 10 km), then **80 m** and **240 m** maps farther out (240 m steps). Custom points use 80 m and 240 m.
- How far it looks: `min(200 km, √(2·R·|h|) + 10 km)`, where R = 1,737.4 km and h is the site's terrain height. Beyond that, terrain is hidden by the Moon's curvature.
- The skyline is computed for each equipment height from **1 to 10 m**: the solar panel uses its height, the antenna its own. Higher equipment sees over nearby ridges.
- A direction whose ray crosses missing terrain is **unknown**: never treated as open sky or as blocked (warning `DEM_GAPS`).
- Elevation angles use an exact curvature formula: `el = atan2(Δh − (R + h_t)·2·sin²(θ/2), (R + h_t)·sin θ)`, with θ = distance / R.

## Sun and Earth positions
- From NASA/JPL SPICE kernels (DE440 planetary ephemeris, lunar orientation, Earth orientation), every **10 minutes** of the mission. Libration and the Moon's orbit are included automatically.

## The rules (the physics team's, one function each in `engine/visibility.py`)
- **Three states**: at every 10-minute step each channel is visible, blocked or **unknown**. Unknown time is never counted as darkness or as no contact.
- **Sun disk fraction f**: the share of the Sun's disk above the skyline at panel height. The disk is cut into **128 vertical strips**, each compared with the skyline at its own azimuth. The part of the Sun covered by the Earth (an eclipse) is subtracted.
- **Sun visible**: f > 0 (any part of the disk). This drives Sun %, the Sun windows, LIGHT and the chips.
- **Earth contact** (direct-to-Earth, DTE): both must hold:
  1. the direction from the antenna to the **station** clears the skyline at antenna height, and
  2. the station sees the Moon above its own lowest elevation (its mask).
  Geometry is instantaneous (no light-time delay). No link budget, pointing, schedules or relays.
- **Earth above horizon** (`earth_any`, `earth_whole`): part / all of the Earth's disk clears the skyline. Shown for information; it does **not** mean the station can see the lander.
- A window starts at the first 10-minute step where its condition holds and ends at the first step where it doesn't. Seconds are never shown: terrain errors (5 m of height ≈ 0.29° at 1 km) dominate.

## Live values on a card
- **Elevation**: the body's angle above the flat horizon. **Terrain**: the skyline's angle in that body's direction. **Clearance** = elevation − terrain: positive means visible, negative hidden.
- Countdowns come from the next change in the 10-minute series.

Sources: `engine/horizons.py`, `engine/geometry.py`, `engine/visibility.py`, `engine/series.py`, design spec §7.1–§7.3.
