from api.models import Warning, WarningEntry

_SEVERITY_RANK = {"blocking": 0, "caution": 1, "info": 2}


def _base(code: str) -> str:
    return code.split(":", 1)[0]


def make_warning(code: str, catalog: dict[str, WarningEntry], **fill: str) -> Warning:
    entry = catalog[_base(code)]
    return Warning(code=code, text=entry.text.format(**fill), severity=entry.severity, affects=entry.affects)


def sort_warnings(items: list[Warning], catalog: dict[str, WarningEntry]) -> list[Warning]:
    order = {code: index for index, code in enumerate(catalog)}
    unique = {item.code: item for item in items}.values()
    return sorted(unique, key=lambda item: (_SEVERITY_RANK[item.severity], order.get(_base(item.code), len(order))))
