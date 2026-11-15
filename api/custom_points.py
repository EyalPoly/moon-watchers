import threading
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from contextlib import AbstractContextManager
from pathlib import Path

from api.errors import ApiError
from api.models import Site
from api.point_ids import format_point_id, in_custom_area, parse_point_id
from engine.custom_point import SLOPE_RESOLUTION_M, CustomPoint, TerrainMissing, compute_custom_point

CAPACITY = 256
NEW_PER_MINUTE = 20
SOURCE_URL = "https://pgda.gsfc.nasa.gov/products/90"
COARSE_TERRAIN = "CUSTOM_COARSE_TERRAIN"


def point_name(lat_deg: float, lon_deg: float) -> str:
    return f"Custom point {abs(lat_deg):.3f}°{'S' if lat_deg < 0 else 'N'}, {lon_deg:.3f}°E"


def _site(site_id: str, point: CustomPoint) -> Site:
    return Site(
        id=site_id,
        name=point_name(point.lat_deg, point.lon_deg),
        source="custom",
        category="custom point",
        region="south_pole",
        lat_deg=point.lat_deg,
        lon_deg=point.lon_deg,
        elevation_m=round(point.elevation_m, 1),
        slope_deg=round(point.slope_deg, 2),
        slope_resolution_m=SLOPE_RESOLUTION_M,
        source_url=SOURCE_URL,
        is_placeholder=False,
        in_psr=None,
    )


class CustomPoints:
    """Points the user placed, computed on first use and kept in a bounded LRU.

    `guard` limits how many computations run at once; it is held only while computing, never on a
    cache hit. Two requests for the same new point compute it once.
    """

    def __init__(
        self,
        terrain_dir: Path,
        guard: AbstractContextManager[object],
        area: tuple[float, float],
        capacity: int | None = None,
        new_per_minute: int | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._terrain_dir = terrain_dir
        self._guard = guard
        self._area = area
        self._capacity = CAPACITY if capacity is None else capacity
        self._new_per_minute = NEW_PER_MINUTE if new_per_minute is None else new_per_minute
        self._clock = clock
        self._cache: OrderedDict[str, tuple[Site, CustomPoint]] = OrderedDict()
        self._recent: deque[float] = deque()
        self._id_locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()

    def get(self, site_id: str) -> tuple[Site, CustomPoint]:
        parsed = parse_point_id(site_id)
        if parsed is None:
            raise ApiError(404, "INVALID_PARAM", "unknown site id")
        lat, lon = parsed
        if not in_custom_area(lat, lon, *self._area):
            raise ApiError(
                422,
                "OUT_OF_COVERAGE",
                f"custom points must lie between {self._area[0]}° and {self._area[1]}° latitude",
            )
        canonical = format_point_id(lat, lon)
        with self._lock:
            hit = self._touch(canonical)
            if hit is not None:
                return hit
            id_lock = self._id_locks.setdefault(canonical, threading.Lock())
        with id_lock:
            with self._lock:
                hit = self._touch(canonical)
                if hit is not None:
                    return hit
                self._count_new_point()
            try:
                entry = self._compute(canonical, lat, lon)
            except BaseException:
                with self._lock:
                    self._id_locks.pop(canonical, None)
                raise
            with self._lock:
                self._cache[canonical] = entry
                while len(self._cache) > self._capacity:
                    self._cache.popitem(last=False)
                self._id_locks.pop(canonical, None)
            return entry

    def _touch(self, canonical: str) -> tuple[Site, CustomPoint] | None:
        entry = self._cache.get(canonical)
        if entry is not None:
            self._cache.move_to_end(canonical)
        return entry

    def _count_new_point(self) -> None:
        now = self._clock()
        while self._recent and now - self._recent[0] >= 60.0:
            self._recent.popleft()
        if len(self._recent) >= self._new_per_minute:
            raise ApiError(429, "RATE_LIMITED", "too many new custom points; try again in a minute")
        self._recent.append(now)

    def _compute(self, canonical: str, lat: float, lon: float) -> tuple[Site, CustomPoint]:
        try:
            with self._guard:
                point = compute_custom_point(lat, lon, self._terrain_dir)
        except TerrainMissing as error:
            raise ApiError(503, "TERRAIN_READ_FAILED", str(error)) from error
        except ValueError as error:
            raise ApiError(422, "OUT_OF_COVERAGE", str(error)) from error
        except OSError as error:
            raise ApiError(503, "TERRAIN_READ_FAILED", f"terrain could not be read: {error}") from error
        return _site(canonical, point), point
