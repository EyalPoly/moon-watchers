# Catalog format (`catalog/sites.yaml`)

The physics team owns this file. The API refuses to start if it is invalid, so check it with `uv run pytest tests/test_catalog.py` or `uv run python -c "from pathlib import Path; from api.catalog import load_catalog; print(len(load_catalog(Path('catalog/sites.yaml'))))"`.

Top level is a mapping with one key, `sites`, a list of entries. Every field is required.

| Field | Type | Rule |
|---|---|---|
| `id` | string | lowercase letters, digits and `_`, 1 to 64 characters; unique |
| `name` | string | shown to users |
| `source` | string | `catalog` (or `custom` for user points) |
| `category` | string | free text, e.g. `ridge`, `crater floor`, `rim` |
| `region` | string | `south_pole` |
| `lat_deg` | number | degrees, from -90 to -84 (south-polar custom area) |
| `lon_deg` | number | degrees east, from 0 up to but not including 360 |
| `elevation_m` | number | metres above the 1,737.4 km reference sphere |
| `slope_deg` | number | degrees |
| `slope_resolution_m` | number | metres; the pixel size of the published slope map the slope was read from (the physics team's V3 uses 20) |
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
    slope_resolution_m: 20.0
    source_url: https://example.org/where-this-came-from
    is_placeholder: false
```

The three sample answers in `contract/samples/sites/` must equal the matching catalog entries while those ids exist; `tests/test_catalog.py` checks this, so update both when replacing the placeholders.
