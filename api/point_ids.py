import re

# The web app writes these ids (web/src/api/points.ts); the server reads them back so a shared
# link works after a restart. Only digits reach the arithmetic, so an id never touches the disk.
_ID = re.compile(r"^pt_([ns])(\d{1,5})_e(\d{1,6})$")
_MAX_LON_THOUSANDTHS = 360_000


def _wrap_lon(lon_deg: float) -> float:
    wrapped = round(((lon_deg % 360.0) + 360.0) % 360.0, 3)
    return 0.0 if wrapped >= 360.0 else wrapped


def format_point_id(lat_deg: float, lon_deg: float) -> str:
    lat = round(abs(lat_deg) * 1000)
    lon = round(_wrap_lon(lon_deg) * 1000)
    return f"pt_{'s' if lat_deg < 0 else 'n'}{lat}_e{lon:06d}"


def parse_point_id(site_id: str) -> tuple[float, float] | None:
    match = _ID.fullmatch(site_id)
    if match is None:
        return None
    lon_thousandths = int(match.group(3))
    if lon_thousandths > _MAX_LON_THOUSANDTHS:
        return None
    lat = (-1 if match.group(1) == "s" else 1) * int(match.group(2)) / 1000
    return lat, _wrap_lon(lon_thousandths / 1000)


def in_custom_area(lat_deg: float, lon_deg: float, min_lat_deg: float, max_lat_deg: float) -> bool:
    return min_lat_deg <= lat_deg <= max_lat_deg and 0.0 <= lon_deg < 360.0
