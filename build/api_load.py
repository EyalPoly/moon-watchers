import argparse
import gzip
import http.client
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import urlencode

from api.scenario import (
    DEFAULT_COLORS,
    DEFAULT_SLOPE,
    DEFAULT_STATION,
    DEFAULT_W,
    parse_t0,
)

Fetch = Callable[[str], tuple[int, bytes]]
MAX_CARDS = 3


@dataclass(frozen=True)
class Result:
    path: str
    status: int
    seconds: float


def _number(value: float) -> str:
    return format(round(value, 2), "g")


def _months(t0: str, days: float) -> list[str]:
    start = parse_t0(t0)
    end = start + timedelta(days=days)
    year, month = start.year, start.month
    months: list[str] = []
    while (year, month) <= (end.year, end.month):
        months.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def card_requests(site: str, t0: str, days: float, panel: float = 2.0, antenna: float = 3.0) -> list[str]:
    """The requests the web app makes for one card, with its query keys in the same order."""
    heights = [panel] if round(panel, 2) == round(antenna, 2) else [panel, antenna]
    paths = [f"/api/v1/sites/{site}/horizon?{urlencode({'mast': _number(h), 'part': 'full'})}" for h in heights]
    scenario = {
        "site": site,
        "t0": t0,
        "days": _number(days),
        "panel": _number(panel),
        "antenna": _number(antenna),
        "station": DEFAULT_STATION,
        "w": DEFAULT_W,
        "sun_req": "6",
        "slope": DEFAULT_SLOPE,
        "psr": "1",
        "margin": "12",
        "colors": DEFAULT_COLORS,
    }
    paths += [f"/api/v1/scenario/series?{urlencode({**scenario, 'month': m})}" for m in _months(t0, days)]
    paths.append(f"/api/v1/scenario/summary?{urlencode(scenario)}")
    return paths


def run(paths: list[str], fetch: Fetch, workers: int = 6) -> tuple[list[Result], float]:
    def timed(path: str) -> Result:
        began = time.perf_counter()
        status, _ = fetch(path)
        return Result(path, status, time.perf_counter() - began)

    began = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(timed, paths))
    return results, time.perf_counter() - began


def problems(
    results: list[Result], wall_s: float, max_wall_s: float = 3.0, max_request_s: float = 1.0
) -> list[str]:
    found = [f"{r.status} from {r.path}" for r in results if r.status != 200]
    found += [f"{r.seconds:.2f} s for {r.path}" for r in results if r.status == 200 and r.seconds > max_request_s]
    if wall_s > max_wall_s:
        found.append(f"all requests took {wall_s:.2f} s, over {max_wall_s:g} s")
    return found


def http_fetch(base: str) -> Fetch:
    def fetch(path: str) -> tuple[int, bytes]:
        request = urllib.request.Request(base.rstrip("/") + path, headers={"Accept-Encoding": "gzip"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return response.status, body
        except urllib.error.HTTPError as error:
            return error.code, error.read()
        except (urllib.error.URLError, http.client.HTTPException, OSError):
            return 0, b""

    return fetch


def _kind(path: str) -> str:
    return "horizon" if "/horizon?" in path else path.split("/")[-1].split("?")[0]


def _report(results: list[Result], wall_s: float) -> None:
    for kind in ("horizon", "series", "summary"):
        times = [r.seconds for r in results if _kind(r.path) == kind]
        failed = sum(1 for r in results if _kind(r.path) == kind and r.status != 200)
        if times:
            print(
                f"  {kind:8} n={len(times):3}  median={statistics.median(times):.3f} s  "
                f"max={max(times):.3f} s  failed={failed}"
            )
    print(f"  wall {wall_s:.2f} s")


def _card(text: str) -> list[str]:
    parts = text.split(",")
    if len(parts) not in (3, 5):
        raise argparse.ArgumentTypeError("a card is SITE,T0,DAYS or SITE,T0,DAYS,PANEL,ANTENNA")
    site, t0, days, *heights = parts
    return card_requests(site, t0, float(days), *(float(h) for h in heights))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="build.api_load", description="Replay the requests of up to 3 cards.")
    parser.add_argument("--base", required=True, help="API origin, e.g. http://localhost:8000")
    parser.add_argument("--card", type=_card, action="append", required=True, metavar="SITE,T0,DAYS[,PANEL,ANTENNA]")
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--workers", type=int, default=0, help="requests in flight (default: all at once, like the browser)")
    args = parser.parse_args(argv)
    if len(args.card) > MAX_CARDS:
        parser.error(f"at most {MAX_CARDS} cards")
    paths = [p for card in args.card for p in card]
    fetch = http_fetch(args.base)
    failed = False
    last: list[str] = []
    for round_no in range(1, args.rounds + 1):
        results, wall = run(paths, fetch, workers=args.workers or len(paths))
        print(f"round {round_no}: {len(results)} requests")
        _report(results, wall)
        failed = failed or any(r.status != 200 for r in results)
        last = problems(results, wall)
    summary = next(p for p in paths if "/scenario/summary?" in p)
    status, body = fetch(summary)
    if status == 200:
        print(f"version {json.loads(body)['version']}")
    for line in last:
        print(f"problem: {line}")
    return 1 if failed or last else 0


if __name__ == "__main__":
    sys.exit(main())
