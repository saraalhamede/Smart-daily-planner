"""Load the repository-root environment file without exposing its contents."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


@dataclass(frozen=True, slots=True)
class EnvironmentLoadStatus:
    """Safe result metadata that never includes a path, key, or environment value."""

    loaded: bool
    reason_category: str


def root_environment_path(source_file: str | Path | None = None) -> Path:
    """Resolve exactly <repository-root>/.env from this package location."""

    source = Path(__file__ if source_file is None else source_file).resolve()
    return source.parents[2] / ".env"


def load_root_environment(
    *,
    source_file: str | Path | None = None,
    loader: Callable[..., Any] | None = None,
) -> EnvironmentLoadStatus:
    """Load only the root .env while preserving operating-system variables."""

    environment_path = root_environment_path(source_file)
    if not environment_path.is_file():
        return EnvironmentLoadStatus(loaded=False, reason_category="missing_file")

    dotenv_loader = loader if loader is not None else _get_dotenv_loader()
    if dotenv_loader is None:
        return EnvironmentLoadStatus(loaded=False, reason_category="dotenv_unavailable")

    try:
        loaded = bool(
            dotenv_loader(
                dotenv_path=environment_path,
                override=False,
                encoding="utf-8",
                interpolate=False,
            )
        )
    except Exception:
        # Startup must remain available when optional configuration loading fails.
        return EnvironmentLoadStatus(loaded=False, reason_category="load_failed")

    return EnvironmentLoadStatus(
        loaded=loaded,
        reason_category="loaded" if loaded else "not_loaded",
    )


def _get_dotenv_loader() -> Callable[..., Any] | None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return None
    return load_dotenv
