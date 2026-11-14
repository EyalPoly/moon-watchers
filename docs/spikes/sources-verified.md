# Source data verified (2026-11-14)

The data set follows the physics team's prototype (`MenasimMoon`, retrieved 2026-11-11), so the engine and the prototype read the same files. `data/sources.lock.json` is the machine-readable list; `make fetch` downloads and verifies it.

## SPICE kernels (all from `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/`)

Downloaded and checksummed on 2026-11-14; the checksums equal the ones recorded in the physics team's sidecar files.

| File | Role |
|---|---|
| `lsk/naif0012.tls` | leap seconds |
| `pck/pck00011.tpc` | body radii and constants |
| `spk/planets/de440s.bsp` | Sun, Earth and Moon positions, 1849 to 2150 |
| `fk/satellites/moon_de440_250416.tf` | lunar frames; defines `MOON_ME` (an alias of `MOON_ME_DE440_ME421`) |
| `pck/moon_pa_de440_200625.bpc` | lunar orientation matching DE440 |
| `pck/earth_1962_260806_2126_combined.bpc` | Earth orientation, observed to 2026-08-06 and predicted to 2126; covers 2026 to 2031 |

Choice recorded: the DE440-era pairing (`de440s.bsp` with `moon_pa_de440_200625.bpc` and `moon_de440_250416.tf`). `moon_pa_de421_1900-2050.bpc` also exists but does not match the DE440 positions.

- DSN station kernel (`spk/stations/earthstns_itrf93_260814.bsp`): exists on the NAIF server but is not in the lockfile. The prototype computes station positions from Earth radii and the ITRF93 orientation instead. Add the kernel only if the contact model moves to named DSN stations.
- Earth orientation after 2026-08-06 is a prediction, so far-future contact times carry more uncertainty.

## LOLA terrain (from `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/`)

The server answers HTTP 200 with a byte size and supports range requests for all eight files. They are **not downloaded on this Mac**: the horizon computation runs on the GPU PC, which runs `make fetch`. Their `sha256` fields are empty ("pin on first fetch"): the first `make fetch` prints each hash, and those get written into the lockfile and committed.

| File | Size | Role |
|---|---|---|
| `LDEM_60S_240MPP_ADJ.TIF` | 219 MB | far DEM, 240 m |
| `LDEM_80S_80MPP_ADJ.TIF` | 189 MB | near DEM, 80 m |
| `LDEM_80S_20MPP_ADJ.TIF` | 2.70 GB | fine DEM, 20 m |
| `LDEM_60S_240MPP_ADJ_ERR.TIF` | 267 MB | height error, 240 m |
| `LDEM_80S_80MPP_ADJ_ERR.TIF` | 255 MB | height error, 80 m |
| `LDEM_80S_20MPP_ADJ_ERR.TIF` | 3.95 GB | height error, 20 m |
| `LDEC_80S_80MPP_ADJ.TIF` | 116 MB | measurement counts (warnings only) |
| `LDEM_80S_80MPP_ADJ_EFFRES.TIF` | 250 MB | effective resolution (warnings only) |

Total about 7.9 GB.

- Projection (from the prototype's sidecars): spherical south-polar stereographic on a 1,737.4 km sphere (IAU 30135); heights are above that sphere; source frame `MOON_ME_DE421`.
- Error product: yes, one `_ERR` raster per DEM (sensitivity bounds, not confidence intervals).
- Not included: NASA illumination, PSR and slope layers (PGDA product 69 is named by the prototype as future work).
- Earlier choice replaced: the MIT/imbrium `LDEM_80S_20M.IMG` and `LDEM_75S_240M.IMG` files were dropped in favour of the physics team's set.
