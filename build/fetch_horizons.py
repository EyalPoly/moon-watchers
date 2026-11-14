import argparse
import sys
import time
import subprocess
import urllib.parse
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
FIXTURES = Path("tests/fixtures/horizons")
USER_AGENT = "moon-watchers-validation/1.0"

CHECK_SITES = {"A": (-89.0, 0.0), "B": (-89.0, 8.0), "pole": (-90.0, 0.0), "far": (-85.0, 120.0)}
CHECK_WINDOWS = [("2026-03-01", "2026-03-03"), ("2027-09-15", "2027-09-17"), ("2030-06-01", "2030-06-03")]
BODIES: dict[str, str] = {"10": "Sun (10)", "399": "Earth (399)"}
BACKOFF_S = (1, 2, 4, 8)

Body = Literal["10", "399"]


def horizons_url(lat: float, lon: float, body: Body, start: str, stop: str) -> str:
    params = {
        "format": "text",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon:g},{lat:g},0'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": "'1h'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
        "APPARENT": "'AIRLESS'",
        "EXTRA_PREC": "'YES'",
        "COMMAND": f"'{body}'",
    }
    return f"{API}?" + "&".join(f"{k}={urllib.parse.quote(v, safe=chr(39) + ',@')}" for k, v in params.items())


def expected_rows(start: str, stop: str) -> int:
    days = (datetime.fromisoformat(stop) - datetime.fromisoformat(start)).days
    return days * 24 + 1


def parse_answer(text: str, body: str, rows: int | None = None) -> list[tuple[datetime, float, float]]:
    """(utc, azimuth, elevation) rows; ValueError unless the answer is for the expected body and center."""
    if f"Target body name: {BODIES[body]}" not in text:
        raise ValueError(f"answer does not name the target {BODIES[body]}")
    if "Center body name: Moon (301)" not in text:
        raise ValueError("answer does not name the center Moon (301)")
    if "$$SOE" not in text or "$$EOE" not in text:
        raise ValueError("answer has no ephemeris table")
    table = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    parsed: list[tuple[datetime, float, float]] = []
    for line in table.strip().splitlines():
        cells = [c.strip() for c in line.split(",")]
        try:
            moment = datetime.strptime(cells[0], "%Y-%b-%d %H:%M").replace(tzinfo=UTC)
            numbers = [float(c) for c in cells[1:] if c not in ("",) and _is_number(c)]
            parsed.append((moment, numbers[-2], numbers[-1]))
        except (ValueError, IndexError) as error:
            raise ValueError(f"unreadable table row: {line!r}") from error
    if rows is not None and len(parsed) != rows:
        raise ValueError(f"expected {rows} rows, got {len(parsed)}")
    if not parsed:
        raise ValueError("answer has no rows")
    return parsed


def _is_number(cell: str) -> bool:
    try:
        float(cell)
    except ValueError:
        return False
    return True


class FetchError(RuntimeError):
    pass


def fetch(url: str, sleep: Callable[[float], None] = time.sleep) -> str:
    """GET through curl: it verifies certificates against the system trust store, which Python's
    own CA list may not match (for example behind a TLS-inspecting proxy)."""
    for wait in (*BACKOFF_S, None):
        done = subprocess.run(
            ["curl", "-sS", "--max-time", "60", "-A", USER_AGENT, "-w", "\n%{http_code}", url],
            capture_output=True,
            text=True,
            check=False,
        )
        body, _, status = done.stdout.rpartition("\n")
        if done.returncode == 0 and status == "200":
            return body
        if done.returncode == 0 and status == "503" and wait is not None:
            sleep(wait)
            continue
        raise FetchError(f"HTTP {status or '?'} {done.stderr.strip()}".strip())
    raise FetchError("unreachable")


def fixture_path(site: str, body: str, start: str, folder: Path = FIXTURES) -> Path:
    return folder / f"{site}_{body}_{start}.txt"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="build.fetch_horizons")
    parser.add_argument("--force", action="store_true", help="fetch again even if the file exists")
    args = parser.parse_args(argv)
    FIXTURES.mkdir(parents=True, exist_ok=True)
    failures = 0
    for site, (lat, lon) in CHECK_SITES.items():
        for start, stop in CHECK_WINDOWS:
            for body in BODIES:
                path = fixture_path(site, body, start)
                if path.exists() and not args.force:
                    continue
                try:
                    text = fetch(horizons_url(lat, lon, body, start, stop))  # type: ignore[arg-type]
                    parse_answer(text, body, expected_rows(start, stop))
                except (ValueError, FetchError) as error:
                    print(f"{path.name}: {error}", file=sys.stderr)
                    failures += 1
                    continue
                path.write_text(text)
                print(path)
                time.sleep(1)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
