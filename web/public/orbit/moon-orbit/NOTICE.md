# Moon Watchers · Component notices

Keep this file and vendor/LICENSE when copying the component. Display a suitable credit for the lunar map in your app (see the demo's Data credits link).

- Lunar global colour in assets/albedo.webp and assets/albedo-quick.webp: **Ruslan Kabatsayev**, derived from LROC WAC; [original Stellarium texture](https://github.com/Stellarium/stellarium/blob/master/textures/moon_4k.jpg), [credits](https://github.com/Stellarium/stellarium/blob/master/CREDITS.md). The colour maps have been tone-adjusted and encoded as WebP; the quick version is downsampled. These adaptations and the demo's rendered startup image are distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Retain attribution and licensing for these works and their adaptations.
- Lunar height and polar reflectance: LRO Lunar Orbiter Laser Altimeter team / NASA, [PDS Geosciences Node](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/). Global LDEM_16; polar LDEM_75N/S_240M; near-infrared polar brightness LDAM_50N/S_1000M. Downsampled, repacked and tone-matched for display.
- Earth: NASA Blue Marble, Reto Stöckli and Robert Simmon / NASA Earth Observatory, [source](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/). Downsampled static cloud composite. The Sun is procedurally drawn.
- Three.js r180: Copyright © 2010–2025 three.js authors, [MIT licence](./vendor/LICENSE); [project](https://threejs.org/).
- The separate UTC demonstration uses [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/); no ephemeris service is required by the component.
