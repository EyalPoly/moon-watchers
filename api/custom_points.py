import logging
import threading
import time
from contextvars import ContextVar
from collections import OrderedDict, deque
from collections.abc import Callable
from contextlib import AbstractContextManager
from pathlib import Path

from starlette.types import ASGIApp, Receive, Scope, Send

from api.errors import ApiError
from api.models import Site
from api.point_ids import format_point_id, in_custom_area, parse_point_id
from engine.custom_point import (
    NO_ELEVATION,
    NO_SLOPE,
    SLOPE_RESOLUTION_M,
    CustomPoint,
    TerrainMissing,
    compute_custom_point,
)

CAPACITY = 256
NEW_PER_MINUTE = 20  # per client
GLOBAL_PER_MINUTE = 200  # per instance, so no crowd of clients can pin the CPU
CLIENT: ContextVar[str] = ContextVar("custom_point_client", default="")
SOURCE_URL = "https://pgda.gsfc.nasa.gov/products/90"
COARSE_TERRAIN = "CUSTOM_COARSE_TERRAIN"
_LOG = logging.getLogger(__name__)
# Only these messages are ours and safe to show; any other error text can hold server file paths.
_PLAIN_MESSAGES = (NO_ELEVATION, NO_SLOPE)
UNAVAILABLE = "terrain data could not be read on this server"


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


def client_of(scope: Scope) -> str:
    """The caller's address. Behind Cloud Run the last X-Forwarded-For entry is the one its front
    end added; earlier entries come from the caller and can be anything."""
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-for":
            last = str(value.decode("latin-1")).split(",")[-1].strip()
            if last:
                return last[:64]
    peer = scope.get("client")
    return str(peer[0])[:64] if peer else ""


class ClientMiddleware:
    """Makes the caller's address available to `CustomPoints` through `CLIENT`."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        token = CLIENT.set(client_of(scope))
        try:
            await self.app(scope, receive, send)
        finally:
            CLIENT.reset(token)


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
        global_per_minute: int | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._terrain_dir = terrain_dir
        self._guard = guard
        self._area = area
        self._capacity = CAPACITY if capacity is None else capacity
        self._new_per_minute = NEW_PER_MINUTE if new_per_minute is None else new_per_minute
        self._global_per_minute = GLOBAL_PER_MINUTE if global_per_minute is None else global_per_minute
        self._clock = clock
        self._cache: OrderedDict[str, tuple[Site, CustomPoint]] = OrderedDict()
        self._recent: deque[float] = deque()
        self._by_client: dict[str, deque[float]] = {}
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
        try:
            with id_lock:
                with self._lock:
                    hit = self._touch(canonical)
                    if hit is not None:
                        return hit
                    self._count_new_point()
                entry = self._compute(canonical, lat, lon)
                with self._lock:
                    self._cache[canonical] = entry
                    while len(self._cache) > self._capacity:
                        self._cache.popitem(last=False)
                return entry
        finally:
            with self._lock:
                if self._id_locks.get(canonical) is id_lock:
                    del self._id_locks[canonical]

    def _touch(self, canonical: str) -> tuple[Site, CustomPoint] | None:
        entry = self._cache.get(canonical)
        if entry is not None:
            self._cache.move_to_end(canonical)
        return entry

    def _count_new_point(self) -> None:
        """Counts a new computation against the caller and the instance; the caller holds `_lock`."""
        now = self._clock()
        self._forget_before(self._recent, now)
        for client, times in list(self._by_client.items()):
            self._forget_before(times, now)
            if not times:
                del self._by_client[client]
        mine = self._by_client.setdefault(CLIENT.get(), deque())
        if len(mine) >= self._new_per_minute or len(self._recent) >= self._global_per_minute:
            if not mine:
                del self._by_client[CLIENT.get()]
            raise ApiError(429, "RATE_LIMITED", "too many new custom points; try again in a minute")
        mine.append(now)
        self._recent.append(now)

    @staticmethod
    def _forget_before(times: deque[float], now: float) -> None:
        while times and now - times[0] >= 60.0:
            times.popleft()

    def _compute(self, canonical: str, lat: float, lon: float) -> tuple[Site, CustomPoint]:
        try:
            with self._guard:
                point = compute_custom_point(lat, lon, self._terrain_dir)
        except ValueError as error:
            if str(error) in _PLAIN_MESSAGES:
                raise ApiError(422, "OUT_OF_COVERAGE", str(error)) from error
            _LOG.exception("custom point %s: terrain could not be used", canonical)
            raise ApiError(503, "TERRAIN_READ_FAILED", UNAVAILABLE) from error
        except (TerrainMissing, OSError) as error:
            _LOG.exception("custom point %s: terrain could not be read", canonical)
            raise ApiError(503, "TERRAIN_READ_FAILED", UNAVAILABLE) from error
        return _site(canonical, point), point
