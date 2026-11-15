from dataclasses import dataclass
from pathlib import Path

import yaml
from pydantic import TypeAdapter, ValidationError

from api.models import RagThresholds, Scenario, ScoreConfig, WarningEntry


@dataclass(frozen=True)
class Configs:
    score: ScoreConfig
    rag: RagThresholds
    warnings: dict[str, WarningEntry]


def _read[T](path: Path, adapter: TypeAdapter[T]) -> T:
    try:
        return adapter.validate_python(yaml.safe_load(path.read_text()))
    except (ValidationError, yaml.YAMLError) as error:
        raise ValueError(f"{path.name} is invalid: {error}") from error


def load_configs(config_dir: Path = Path("config")) -> Configs:
    score = _read(config_dir / "score.yaml", TypeAdapter(ScoreConfig))
    rag = _read(config_dir / "rag.yaml", TypeAdapter(RagThresholds))
    entries = _read(config_dir / "warnings.yaml", TypeAdapter(list[WarningEntry]))
    return Configs(score=score, rag=rag, warnings={entry.code: entry for entry in entries})


def is_custom(scenario: Scenario, score: ScoreConfig) -> bool:
    defaults = {spec.key: tuple(spec.default) for spec in score.settings}
    current = {
        "w": scenario.w,
        "sun_req": (scenario.sun_req,),
        "slope": scenario.slope,
        "psr": (float(scenario.psr),),
        "margin": (scenario.margin,),
        "colors": scenario.colors,
    }
    return any(current[key] != defaults[key] for key in current)
