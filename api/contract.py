import argparse
import json
import subprocess
import sys
import tempfile
from fnmatch import fnmatch
from pathlib import Path

from pydantic import BaseModel, ValidationError

from api.main import create_app
from api.models import Health, HorizonResponse, Meta, Site, SitesResponse

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OPENAPI = ROOT / "contract" / "openapi.json"
DEFAULT_TYPES = ROOT / "web" / "src" / "api" / "schema.d.ts"
DEFAULT_SAMPLES = ROOT / "contract" / "samples"

SAMPLE_MODELS: dict[str, type[BaseModel]] = {
    "meta.json": Meta,
    "health.json": Health,
    "sites.json": SitesResponse,
    "sites/*.json": Site,
    "horizon/*.json": HorizonResponse,
}


def build_schema() -> dict[str, object]:
    return create_app(DEFAULT_SAMPLES).openapi()


def render_openapi() -> str:
    return json.dumps(build_schema(), indent=2, sort_keys=True) + "\n"


def render_types(openapi_path: Path, out: Path) -> None:
    subprocess.run(
        [
            "pnpm", "--dir", str(ROOT / "web"), "exec", "openapi-typescript",
            str(openapi_path), "-o", str(out),
        ],
        check=True,
        capture_output=True,
    )


def generate(openapi_out: Path, types_out: Path) -> None:
    openapi_out.parent.mkdir(parents=True, exist_ok=True)
    types_out.parent.mkdir(parents=True, exist_ok=True)
    openapi_out.write_text(render_openapi())
    render_types(openapi_out, types_out)


def model_for(relative: str) -> type[BaseModel] | None:
    for pattern, model in SAMPLE_MODELS.items():
        if fnmatch(relative, pattern):
            return model
    return None


def check_samples(samples: Path) -> list[str]:
    problems: list[str] = []
    for path in sorted(samples.rglob("*.json")):
        relative = path.relative_to(samples).as_posix()
        model = model_for(relative)
        if model is None:
            problems.append(f"{relative}: no model registered in SAMPLE_MODELS")
            continue
        try:
            model.model_validate_json(path.read_text())
        except ValidationError as error:
            problems.append(f"{relative}: invalid sample\n{error}")
    return problems


def check(openapi_path: Path, types_path: Path, samples: Path) -> list[str]:
    problems: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        fresh_openapi = Path(tmp) / "openapi.json"
        fresh_types = Path(tmp) / "schema.d.ts"
        generate(fresh_openapi, fresh_types)
        for name, fresh, current in (
            ("openapi.json", fresh_openapi, openapi_path),
            ("schema.d.ts", fresh_types, types_path),
        ):
            if not current.exists() or current.read_text() != fresh.read_text():
                problems.append(f"{name} is stale: run `make contract` ({current})")
    problems += check_samples(samples)
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="api.contract")
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("generate")
    gen.add_argument("--out", type=Path)
    chk = sub.add_parser("check")
    chk.add_argument("--against", type=Path)
    chk.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    args = parser.parse_args(argv)

    if args.command == "generate":
        if args.out:
            generate(args.out / "openapi.json", args.out / "schema.d.ts")
        else:
            generate(DEFAULT_OPENAPI, DEFAULT_TYPES)
        return 0

    openapi_path = args.against / "openapi.json" if args.against else DEFAULT_OPENAPI
    types_path = args.against / "schema.d.ts" if args.against else DEFAULT_TYPES
    problems = check(openapi_path, types_path, args.samples)
    for problem in problems:
        print(problem, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
