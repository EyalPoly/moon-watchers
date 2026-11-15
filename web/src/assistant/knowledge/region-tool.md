# Manual Selection: finding the best areas

Manual Selection grades a grid of points inside an area you outline, and opens the best ones as new sites. It also holds the **Grading Weights** (the score settings).

## How to use it
1. On the Site Calculator screen, in **Map view**, press **Manual Selection** (or ask the guide to open it). A "Manual Selection" panel appears at the top right of the map and a grid is drawn inside the dashed circle (84°S to the pole).
2. Choose the **Grid** spacing: **2, 5 or 10 km**. The spacing is also the size of each graded area. Changing it clears the outline.
3. **Click grid points** to outline the area, in order around it. Each click snaps to the nearest grid point. The panel counts them: "Select at least 3 different grid points · N selected · X more needed", then "outline ready". A click outside the circle shows "That point is outside the custom-point area".
4. **Undo** removes the last point; **Clear** starts again.
5. Press **Apply**. The cells inside the outline are graded, colored (green ≥ 70, amber ≥ 40, red below) and listed **best first** (#1, #2, …) with their grade and center coordinates. When the guide opened the tool, it finds them automatically once the outline has 3 points and reports them in the chat.
6. Tick the areas you want (the best one is ticked) and press **Apply**. Each becomes a new site card named "<site name> · area #N", with the same dates, heights and stations as the site the tool was opened from. The outline and the ranked areas stay on the map as the **Selected region** and **Ranked areas** polygon layers.
7. **Grading Weights** (in the panel) opens the score settings: weights, required sunlight, slope scale, PSR rejection, landing margin and colors. Press Apply there to use them for every site. "Grading Weights (custom)" means something differs from the defaults.
8. Close the tool with ✕ or the Manual Selection button.

## Tips
- Smaller spacing gives more, smaller areas; a big outline with 2 km spacing can be slow.
- Opened areas are custom points: they use 80 m terrain (catalog sites use 20 m), so near-horizon angles can differ by up to about 0.7°.
- The grade of an area is meant to be the same kind of 0–100 grade as the score, under the current Grading Weights.

Sources: `web/src/map/AreaTool.tsx`, `web/src/map/RegionOverlay.tsx`, `web/src/api/areas.ts`, `web/src/ui/SharedSiteMap.tsx`.
