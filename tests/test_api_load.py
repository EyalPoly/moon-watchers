from urllib.parse import parse_qs, urlsplit

from build.api_load import Result, card_requests, http_fetch, problems, run


def months_of(paths: list[str]) -> list[str]:
    return [parse_qs(urlsplit(p).query)["month"][0] for p in paths if "/scenario/series" in p]


def test_card_requests_month_mission() -> None:
    paths = card_requests("s1", "2027-03-15T00:00Z", 30)
    assert len(paths) == 5
    assert paths[0].startswith("/api/v1/sites/s1/horizon?") and "mast=2" in paths[0] and "part=full" in paths[0]
    assert paths[1].startswith("/api/v1/sites/s1/horizon?") and "mast=3" in paths[1]
    assert months_of(paths) == ["2027-03", "2027-04"]
    assert paths[-1].startswith("/api/v1/scenario/summary?")
    query = parse_qs(urlsplit(paths[-1]).query)
    assert query["site"] == ["s1"] and query["t0"] == ["2027-03-15T00:00Z"] and query["days"] == ["30"]
    assert query["w"] == ["0.25,0.25,0.15,0.15,0.1,0.1,0"] and query["station"] == ["29.7604,-95.3698,0,0"]


def test_card_requests_same_heights() -> None:
    paths = card_requests("s1", "2027-03-01T00:00Z", 30, panel=3, antenna=3)
    assert sum("/horizon?" in p for p in paths) == 1


def test_card_requests_year_mission() -> None:
    months = months_of(card_requests("s1", "2027-03-15T00:00Z", 365))
    assert len(months) == 13
    assert months[0] == "2027-03" and months[-1] == "2028-03"


def test_problems_flags_errors_and_slowness() -> None:
    fast = [Result("/a", 200, 0.1), Result("/b", 200, 0.2)]
    assert problems(fast, 0.5) == []
    assert len(problems([*fast, Result("/c", 500, 0.1)], 0.5)) == 1
    assert len(problems([*fast, Result("/c", 200, 1.2)], 1.3)) == 1
    assert len(problems(fast, 3.5)) == 1


def test_run_uses_fetch_for_every_path() -> None:
    seen: list[str] = []

    def fetch(path: str) -> tuple[int, bytes]:
        seen.append(path)
        return 200, b"{}"

    paths = [f"/p{i}" for i in range(9)]
    results, wall = run(paths, fetch, workers=3)
    assert sorted(seen) == sorted(paths)
    assert [r.path for r in results] == paths
    assert all(r.status == 200 for r in results) and wall >= 0


def test_http_fetch_reports_a_dropped_connection_as_status_zero() -> None:
    import socket
    import threading

    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)

    def accept_and_drop() -> None:
        connection, _ = server.accept()
        connection.recv(1024)
        connection.close()

    threading.Thread(target=accept_and_drop, daemon=True).start()
    status, _ = http_fetch(f"http://127.0.0.1:{server.getsockname()[1]}")("/x")
    server.close()
    assert status == 0
