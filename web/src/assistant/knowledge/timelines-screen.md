# The Timelines screen

Open it with the **Timelines** tab or **Compare timelines** in the calculator. It shows every site that is shown in the explorer and has a location.

- **One panel per site**, in the calculator's order and colors: the letter and name (click to open it on the South pole screen), the landing date and mission length, and the **score box** (same as the card's: color, breakdown on hover, "illustrative").
- **Four rows of bars**, each with its share of the mission:
  - **Sun visible**: when any part of the Sun's disk is above the terrain at panel height.
  - **Earth contact**: when the chosen station and the antenna can see each other over the terrain.
  - **Sun + Earth**: both at once (useful for powered communication).
  - **Unknown terrain** (hatched): times the answer is unknown because terrain data is missing.
- **The x-axis is mission days** (time since landing), so sites with different landing dates line up. Hover a bar for its real UTC start and end and its length.
- **Dashed line**: the viewed mission time, moved by the slider at the top (with Play) or by clicking any row. It is shared with the South pole screen.
- **Shaded stripes** after a shorter site's mission end.
- **Compare sites** table below: score, Sun %, Earth %, Sun + Earth, longest darkness, longest comm gap, first dark after landing, slope, warnings; ★ marks the best value per row, "Optimal" the best score.

Not shown yet: mission steps with dependencies, times when the Earth is up but the station can't see the Moon, and export.

Sources: `web/src/ui/TimelineScreen.tsx`, `web/src/timeline/bars.ts`, `web/src/ui/CompareView.tsx`.
