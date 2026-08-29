"""Disconnected, mockable OpenAI Responses API foundation.

This module is intentionally not imported by the current Flask service or any
Node/React runtime path. Future integrations must provide minimized payloads.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Callable, Mapping

from .generative_config import (
    FEATURE_DISABLED,
    INVALID_CONFIGURATION,
    GenerativeConfig,
)
from .generative_contracts import (
    ADVICE_SCHEMA_NAME,
    DEFAULT_OUTPUT_LIMITS,
    TASK_BREAKDOWN_SCHEMA_NAME,
    get_schema,
)


PROVIDER_NAME = "openai_responses_api"

MISSING_CONFIGURATION = "missing_configuration"
AUTHENTICATION_FAILURE = "authentication_failure"
RATE_LIMIT = "rate_limit"
TIMEOUT = "timeout"
NETWORK_FAILURE = "network_failure"
PROVIDER_REFUSAL = "provider_refusal"
INCOMPLETE_OUTPUT = "incomplete_output"
INVALID_STRUCTURED_OUTPUT = "invalid_structured_output"
INPUT_TOO_LARGE = "input_too_large"
UNKNOWN_SCHEMA = "unknown_schema"
UNEXPECTED_PROVIDER_FAILURE = "unexpected_provider_failure"
SDK_UNAVAILABLE = "sdk_unavailable"

_KNOWN_SCHEMAS = frozenset((TASK_BREAKDOWN_SCHEMA_NAME, ADVICE_SCHEMA_NAME))


@dataclass(frozen=True, slots=True)
class GenerativeResult:
    """Safe bounded result returned by the adapter."""

    ok: bool
    data: Mapping[str, Any] | None
    error_category: str | None
    requested_provider: str
    requested_model: str
    actual_provider: str | None
    actual_model: str | None
    status: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class OpenAIResponsesAdapter:
    """Make one bounded Responses request when explicitly enabled."""

    def __init__(
        self,
        config: GenerativeConfig,
        *,
        client: Any | None = None,
        client_factory: Callable[[GenerativeConfig], Any] | None = None,
    ) -> None:
        self._config = config
        self._client = client
        self._client_factory = client_factory

    def generate(
        self,
        schema_name: str,
        payload: Mapping[str, Any],
        instructions: str,
        output_limit: int | None = None,
    ) -> GenerativeResult:
        if not self._config.enabled:
            return self._failure(FEATURE_DISABLED, "disabled")
        if not self._config.is_valid:
            return self._failure(self._config.configuration_error or INVALID_CONFIGURATION, "config_error")
        if not self._config.api_key:
            return self._failure(MISSING_CONFIGURATION, "missing_config")
        if schema_name not in _KNOWN_SCHEMAS:
            return self._failure(UNKNOWN_SCHEMA, "invalid_schema")
        if not isinstance(payload, Mapping) or not isinstance(instructions, str) or not instructions.strip():
            return self._failure(INVALID_STRUCTURED_OUTPUT, "invalid_input")

        try:
            serialized_payload = json.dumps(
                payload,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
        except (TypeError, ValueError):
            return self._failure(INVALID_STRUCTURED_OUTPUT, "invalid_input")
        if len(serialized_payload) > self._config.max_input_chars:
            return self._failure(INPUT_TOO_LARGE, "input_too_large")

        effective_output_limit = self._effective_output_limit(schema_name, output_limit)
        if effective_output_limit is None:
            return self._failure(INVALID_CONFIGURATION, "invalid_output_limit")

        try:
            client = self._get_client()
            request = self._build_request(
                schema_name,
                serialized_payload,
                instructions,
                effective_output_limit,
            )
            response = client.responses.create(**request)
        except Exception as error:  # Provider SDK errors are converted below.
            return self._failure(self._classify_exception(error), "provider_error")

        return self._parse_response(schema_name, response)

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if self._client_factory is not None:
            self._client = self._client_factory(self._config)
            return self._client

        from openai import OpenAI

        self._client = OpenAI(
            api_key=self._config.api_key,
            timeout=float(self._config.timeout_seconds),
            max_retries=0,
        )
        return self._client

    def _build_request(
        self,
        schema_name: str,
        serialized_payload: str,
        instructions: str,
        output_limit: int,
    ) -> dict[str, Any]:
        schema = get_schema(schema_name)
        if schema is None:
            raise ValueError("unknown schema")
        return {
            "model": self._config.model,
            "instructions": instructions,
            "input": serialized_payload,
            "store": False,
            "max_output_tokens": output_limit,
            "reasoning": {"effort": "none"},
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "strict": True,
                    "schema": schema,
                }
            },
        }

    def _effective_output_limit(self, schema_name: str, requested: int | None) -> int | None:
        selected = DEFAULT_OUTPUT_LIMITS[schema_name] if requested is None else requested
        try:
            selected_int = int(selected)
        except (TypeError, ValueError):
            return None
        if selected_int < 1:
            return None
        return min(selected_int, self._config.max_output_tokens)

    def _parse_response(self, schema_name: str, response: Any) -> GenerativeResult:
        status = str(_read_value(response, "status") or "")
        if _has_refusal(response):
            return self._failure(PROVIDER_REFUSAL, status or "refused")
        if status == "incomplete":
            return self._failure(INCOMPLETE_OUTPUT, status)
        if status != "completed":
            return self._failure(INCOMPLETE_OUTPUT if not status else UNEXPECTED_PROVIDER_FAILURE, status or "unknown")

        output_text = _read_value(response, "output_text")
        if not isinstance(output_text, str) or not output_text.strip():
            return self._failure(INCOMPLETE_OUTPUT, status)
        try:
            data = json.loads(output_text)
        except (TypeError, ValueError, json.JSONDecodeError):
            return self._failure(INVALID_STRUCTURED_OUTPUT, status)
        if not _is_structurally_valid(schema_name, data):
            return self._failure(INVALID_STRUCTURED_OUTPUT, status)

        usage = _read_value(response, "usage")
        input_tokens = _safe_int(_read_value(usage, "input_tokens"))
        output_tokens = _safe_int(_read_value(usage, "output_tokens"))
        total_tokens = _safe_int(_read_value(usage, "total_tokens"))
        actual_model = _read_value(response, "model")
        actual_model = actual_model if isinstance(actual_model, str) and actual_model else None
        return GenerativeResult(
            ok=True,
            data=_freeze(data),
            error_category=None,
            requested_provider=PROVIDER_NAME,
            requested_model=self._config.model,
            actual_provider=PROVIDER_NAME,
            actual_model=actual_model,
            status=status,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )

    def _failure(self, category: str, status: str) -> GenerativeResult:
        return GenerativeResult(
            ok=False,
            data=None,
            error_category=category,
            requested_provider=PROVIDER_NAME,
            requested_model=self._config.model,
            actual_provider=None,
            actual_model=None,
            status=status,
        )

    @staticmethod
    def _classify_exception(error: Exception) -> str:
        error_name = type(error).__name__
        status_code = getattr(error, "status_code", None)
        if isinstance(error, ModuleNotFoundError) and error.name == "openai":
            return SDK_UNAVAILABLE
        if error_name in {"APITimeoutError", "TimeoutError"}:
            return TIMEOUT
        if error_name in {"APIConnectionError", "ConnectionError"}:
            return NETWORK_FAILURE
        if error_name in {"AuthenticationError", "PermissionDeniedError"} or status_code in {401, 403}:
            return AUTHENTICATION_FAILURE
        if error_name == "RateLimitError" or status_code == 429:
            return RATE_LIMIT
        if error_name in {"RefusalError", "ProviderRefusalError"}:
            return PROVIDER_REFUSAL
        return UNEXPECTED_PROVIDER_FAILURE


def _read_value(value: Any, key: str) -> Any:
    if value is None:
        return None
    if isinstance(value, Mapping):
        return value.get(key)
    return getattr(value, key, None)


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    return None


def _has_refusal(response: Any) -> bool:
    if _read_value(response, "refusal"):
        return True
    output = _read_value(response, "output")
    if not isinstance(output, (list, tuple)):
        return False
    for item in output:
        if _read_value(item, "type") == "refusal" or _read_value(item, "refusal"):
            return True
        content = _read_value(item, "content")
        if isinstance(content, (list, tuple)) and any(_read_value(part, "type") == "refusal" for part in content):
            return True
    return False


def _is_structurally_valid(schema_name: str, data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    if schema_name == TASK_BREAKDOWN_SCHEMA_NAME:
        if set(data) != {"subtasks"} or not isinstance(data["subtasks"], list):
            return False
        return all(
            isinstance(item, dict)
            and set(item) == {"title", "order_index"}
            and isinstance(item["title"], str)
            and isinstance(item["order_index"], int)
            and not isinstance(item["order_index"], bool)
            for item in data["subtasks"]
        )
    if schema_name == ADVICE_SCHEMA_NAME:
        if set(data) != {"advice"} or not isinstance(data["advice"], list):
            return False
        required = {"advice_type", "title", "message", "priority", "scope", "task_ref"}
        advice_types = {
            "recommendation",
            "energy",
            "stress",
            "mood",
            "productivity",
            "deadline",
            "schedule",
            "time_management",
            "feedback",
            "task",
        }
        scopes = {"daily", "weekly", "monthly", "task"}
        return all(
            isinstance(item, dict)
            and set(item) == required
            and isinstance(item["advice_type"], str)
            and item["advice_type"] in advice_types
            and isinstance(item["title"], str)
            and isinstance(item["message"], str)
            and isinstance(item["priority"], int)
            and not isinstance(item["priority"], bool)
            and item["priority"] in {1, 2, 3, 4}
            and isinstance(item["scope"], str)
            and item["scope"] in scopes
            and (item["task_ref"] is None or isinstance(item["task_ref"], str))
            for item in data["advice"]
        )
    return False


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value
