# Catalog format (`catalog/sites.yaml`)

The physics team owns this file. The API refuses to start if it is invalid. Check it with:

```
uv run python -m api.catalog            # the format: prints "N sites OK" or each problem
uv run python -m api.catalog --final    # also refuses placeholders and a source_url that is not a web link
```

The committed catalog must pass `--final` before the G3 gate.

Every site must lie inside the finest terrain file, the 20 m DEM for the served bundle, with room for its 12 km near zone on every side. `make masks` stops and names any site that doesn't, instead of building it on coarser terrain.

Top level is a mapping with one key, `sites`, a list of entries. Every field is required.

| Field | Type | Rule |
|---|---|---|
| `id` | string | lowercase letters, digits and `_`, 1 to 64 characters; unique |
| `name` | string | shown to users |
| `source` | string | `catalog` (or `custom` for user points) |
| `category` | string | free text, e.g. `ridge`, `crater floor`, `rim` |
| `region` | string | `south_pole` |
| `lat_deg` | number | degrees, from -90 to -84 (south-polar custom area) |
| `lon_deg` | number | degrees east, from -180 up to but not including 180 |
| `elevation_m` | number | metres above the 1,737.4 km reference sphere |
| `slope_deg` | number | degrees |
| `slope_baseline_m` | number | metres; the distance the slope is measured over (the prototype uses 240) |
| `source_url` | string | where the site comes from; required |
| `is_placeholder` | boolean | `true` while the entry is not a real catalog site |

Example:

```yaml
sites:
  - id: shackleton_rim_a
    name: Shackleton rim A
    source: catalog
    category: rim
    region: south_pole
    lat_deg: -89.67
    lon_deg: 129.0
    elevation_m: 1520.0
    slope_deg: 5.5
    slope_baseline_m: 240.0
    source_url: https://example.org/where-this-came-from
    is_placeholder: false
```

The three sample answers in `contract/samples/sites/` keep the placeholder ids and match `tests/fixtures/catalog.yaml`, which the tests read instead of this file. Replacing the placeholders here changes no test. If a real site reuses a sample id, `tests/test_catalog.py` checks that the two agree.
