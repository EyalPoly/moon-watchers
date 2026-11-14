# Moon Trek WMTS spike (south pole basemap)

Date: 2026-11-14. Everything below was opened and downloaded successfully.

## How the layer was found

- Layer list for polar products: `https://trek.nasa.gov/moon/TrekServices/ws/index/polar/searchItems?start=0&rows=2147483647&facetKeys=itemType%7CproductCat2%7CserviceTypes%7CthumbnailURLDir&facetValues=product%7C-%28DEM%20ConfidenceRaw%20Slope%29%7CMosaic%7C%5B%2A%20TO%20%2A%5D` (taken from `https://trek.nasa.gov/tiles/apidoc/config/config.json`, which the WMTS API page uses).
- Service endpoint: `https://trek.nasa.gov/moon/TrekServices/ws/index/getLayerServices?uuid=a7e437ed-3b26-4546-be2b-eab90986b059`.

## Chosen layer

- Id: `LRO_LOLA_ClrShade_SPole75_30mp_v04` ("LRO LOLA DEM, S Pole, 75 deg, ColorHillshade").
- Capabilities: `https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_ClrShade_SPole75_30mp_v04/1.0.0/WMTSCapabilities.xml`.
- Tile URL: `https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_ClrShade_SPole75_30mp_v04/1.0.0//default/default028mm/{z}/{y}/{x}.png` (`{y}` = row, `{x}` = column).
- Tile matrix set `default028mm`, tile 256 px, origin (top-left) (-1095930, 1095930) m, levels 0 to 6 only.
- Resolution = ScaleDenominator x 0.00028 m: 8561.953, 4280.976, 2140.488, 1070.244, 535.122, 267.561, 133.780 m/px.
- Layer bounding box: -457440 to 457440 m in both axes (the disc down to 75°S).
- Tiles checked: z6 row 31/32 col 31/32 returned HTTP 200 PNG; z8 and z10 returned 404 (no deeper levels).
- The capabilities file lists `MatrixWidth`/`MatrixHeight` of 2x1, 4x2 ... 128x64; these disagree with the extent (the grid is square, 2^z tiles per side at 256 px). The geometry above (origin and resolution) is consistent with the layer's bounding box, so we use origin and resolutions and ignore the matrix sizes.

## Projection check

- The catalog projection is Polar Stereographic, origin latitude -90, central meridian 0, sphere radius 1,737,400 m (its `scale_factor` field says 0, which is an export quirk).
- Our interim proj4 (`+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +R=1737400`) gives the 75°S radius 2R·tan(7.5°) = 457,440 m, equal to the layer's bounding box edge, so the projection matches. The tile at z6 row 32, column 32 starts at x = -1095930 + 32 x 34,247 = 0.5 m, i.e. at the pole.
- Not checked: the spec §11.4 service point (20000, -15000); the spec text restored in this repo does not contain it.
- No change to the proj4 in the sample.

## Credit and licence

- FGDC metadata (`https://trek.nasa.gov/moon/TrekWS/rest/cat/metadata/fgdc/html?label=LRO_LOLA_ClrShade_SPole75_30mp_v04`): originator "LOLA Instrument Team", Access_Constraints: None, Use_Constraints: None.
- Attribution shown in the app: "NASA Moon Trek / LOLA".

## Limits worth knowing

- Resolution tops out at 134 m/px, enough for a polar overview, not for site detail (that is the app's own tile job later).
- Tile responses send `Access-Control-Allow-Origin: *`, so browsers can load them cross-origin. Unit tests mock tiles; the Playwright smoke test uses a stubbed tile route so it does not depend on NASA being up.
