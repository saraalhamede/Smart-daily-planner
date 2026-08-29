"""Configuration for the disconnected Generative AI foundation."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping


FEATURE_DISABLED = "feature_disabled"
INVALID_CONFIGURATION = "invalid_configuration"

DEFAULT_MODEL = "gpt-5.6-luna"
DEFAULT_TIMEOUT_SECONDS = 6
DEFAULT_MAX_OUTPUT_TOKENS = 512
DEFAULT_MAX_INPUT_CHARS = 8000

MIN_TIMEOUT_SECONDS = 2
MAX_TIMEOUT_SECONDS = 6
MIN_MAX_OUTPUT_TOKENS = 128
MAX_MAX_OUTPUT_TOKENS = 2048
MIN_MAX_INPUT_CHARS = 2000
MAX_MAX_INPUT_CHARS = 8000


@dataclass(frozen=True, slots=True)
class GenerativeConfig:
    """Parsed configuration with secret-safe representation helpers."""

    enabled: bool
    model: str = DEFAULT_MODEL
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS
    max_input_chars: int = DEFAULT_MAX_INPUT_CHARS
    configuration_error: str | None = None
    api_key: str = field(default="", repr=False, compare=False)

    @property
    def is_valid(self) -> bool:
        return self.configuration_error is None

    def to_safe_dict(self) -> dict[str, object]:
        """Return serializable metadata without the API key."""

        return {
            "enabled": self.enabled,
            "model": self.model,
            "timeout_seconds": self.timeout_seconds,
            "max_output_tokens": self.max_output_tokens,
            "max_input_chars": self.max_input_chars,
            "configuration_error": self.configuration_error,
            "api_key_configured": bool(self.api_key),
        }

    def __repr__(self) -> str:
        safe = self.to_safe_dict()
        return f"GenerativeConfig({safe!r})"


def load_config(env: Mapping[str, object] | None = None) -> GenerativeConfig:
    """Parse environment values without raising or exposing secret values."""

    source = os.environ if env is None else env
    enabled, enabled_is_valid = _parse_bool(source.get("AI_GENERATIVE_ENABLED"))
    model, model_is_valid = _parse_model(source.get("OPENAI_MODEL"))
    timeout_seconds, timeout_is_valid = _parse_int(
        source.get("OPENAI_TIMEOUT_SECONDS"),
        DEFAULT_TIMEOUT_SECONDS,
        MIN_TIMEOUT_SECONDS,
        MAX_TIMEOUT_SECONDS,
    )
    max_output_tokens, output_is_valid = _parse_int(
        source.get("AI_GENERATIVE_MAX_OUTPUT_TOKENS"),
        DEFAULT_MAX_OUTPUT_TOKENS,
        MIN_MAX_OUTPUT_TOKENS,
        MAX_MAX_OUTPUT_TOKENS,
    )
    max_input_chars, input_is_valid = _parse_int(
        source.get("AI_GENERATIVE_MAX_INPUT_CHARS"),
        DEFAULT_MAX_INPUT_CHARS,
        MIN_MAX_INPUT_CHARS,
        MAX_MAX_INPUT_CHARS,
    )

    configuration_error = None
    if not all((enabled_is_valid, model_is_valid, timeout_is_valid, output_is_valid, input_is_valid)):
        configuration_error = INVALID_CONFIGURATION

    raw_api_key = source.get("OPENAI_API_KEY")
    api_key = "" if raw_api_key is None else str(raw_api_key).strip()
    return GenerativeConfig(
        enabled=enabled,
        model=model,
        timeout_seconds=timeout_seconds,
        max_output_tokens=max_output_tokens,
        max_input_chars=max_input_chars,
        configuration_error=configuration_error,
        api_key=api_key,
    )


def _parse_bool(value: object) -> tuple[bool, bool]:
    if value is None or str(value).strip() == "":
        return False, True
    normalized = str(value).strip().lower()
    if normalized == "true":
        return True, True
    if normalized == "false":
        return False, True
    return False, False


def _parse_model(value: object) -> tuple[str, bool]:
    if value is None or str(value).strip() == "":
        return DEFAULT_MODEL, True
    model = str(value).strip()
    return model, model == DEFAULT_MODEL


def _parse_int(value: object, default: int, minimum: int, maximum: int) -> tuple[int, bool]:
    if value is None or str(value).strip() == "":
        return default, True
    try:
        parsed = int(str(value).strip(), 10)
    except (TypeError, ValueError):
        return default, False
    if parsed < minimum or parsed > maximum:
        return parsed, False
    return parsed, True
