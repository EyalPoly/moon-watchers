# Select region: finding the best areas

The region tool grades a grid of points inside an area you outline, and opens the best ones as new sites.

## How to use it
1. On the South pole screen, in **Map view**, press **Select region** (or ask the guide to open it). A panel "Select region" appears on the map and a grid is drawn inside the dashed circle (84°S to the pole).
2. Choose the **Grid** spacing: **2, 5 or 10 km**. The spacing is also the size of each graded area. Changing it clears the outline.
3. **Click grid points** to outline the area, in order around it. Each click snaps to the nearest grid point and is numbered. At least **3 points** are needed. A click outside the circle shows "That point is outside the custom-point area".
4. **Undo point** removes the last point; **Clear** starts again.
5. Press **Find best areas**. The cells inside the outline are graded, colored (green ≥ 70, amber ≥ 40, red below) and listed **best first** (#1, #2, …) with their grade and center coordinates. When the guide opened the tool, it finds them automatically once the outline has 3 points and reports them in the chat.
6. Tick the areas you want (the best one is ticked) and press **Open N sites**. Each becomes a new site card named "<site name> · area #N", with the same dates, heights and stations as the site the tool was opened from.
7. Close the tool with ✕ or the Select region button.

## Tips
- Smaller spacing gives more, smaller areas; a big outline with 2 km spacing can be slow.
- Opened areas are custom points: they use 80 m terrain (catalog sites use 20 m), so near-horizon angles can differ by up to about 0.7°.
- The grade of an area is meant to be the same kind of 0–100 grade as the score, under the current score settings.

Sources: `web/src/map/AreaTool.tsx`, `web/src/api/areas.ts`, `web/src/ui/SharedSiteMap.tsx`.
