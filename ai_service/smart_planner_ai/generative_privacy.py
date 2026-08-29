"""Deterministic minimization helpers for Generative AI task breakdowns."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from typing import Any


TASK_BREAKDOWN_PAYLOAD_KEYS = (
    "title",
    "description",
    "category",
    "difficulty",
    "priority",
    "estimated_duration_minutes",
)

_EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_URL_PATTERN = re.compile(r"\b(?:https?://|www\.)[^\s<>]+", re.IGNORECASE)
_BEARER_TOKEN_PATTERN = re.compile(r"\bbearer\s+[A-Z0-9._~+/-]{10,}\b", re.IGNORECASE)
_NAMED_TOKEN_PATTERN = re.compile(
    r"\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token)\s*[:=]\s*[^\s,;]+",
    re.IGNORECASE,
)
_API_KEY_PATTERN = re.compile(r"\b(?:sk|rk|pk|ghp)[_-][A-Z0-9_-]{10,}\b", re.IGNORECASE)
_LONG_IDENTIFIER_PATTERN = re.compile(r"\b[A-Z0-9_-]{32,}\b", re.IGNORECASE)


def sanitize_task_breakdown_payload(value: Mapping[str, Any] | Any) -> dict[str, object] | None:
    """Copy, minimize, and redact the only fields approved for the provider."""

    if not isinstance(value, Mapping):
        return None

    title = normalize_text(value.get("title"), 180)
    if not title:
        return None

    return {
        "title": title,
        "description": normalize_text(value.get("description"), 600),
        "category": normalize_text(value.get("category"), 40) or "general",
        "difficulty": bounded_integer(value.get("difficulty_level", value.get("difficulty")), 1, 5, 3),
        "priority": bounded_integer(value.get("priority_level", value.get("priority")), 1, 5, 3),
        "estimated_duration_minutes": bounded_integer(value.get("estimated_duration_minutes"), 15, 480, 60),
    }


def normalize_text(value: Any, maximum_length: int) -> str:
    """Normalize visible Unicode text while preserving its original script."""

    return _redact(normalize_visible_text(value, maximum_length))


def normalize_visible_text(value: Any, maximum_length: int) -> str:
    """Normalize text without redacting it, for local output validation."""

    if value is None:
        return ""
    normalized = unicodedata.normalize("NFKC", str(value))
    normalized = "".join(
        character if unicodedata.category(character) not in {"Cc", "Cs"} else " "
        for character in normalized
    )
    return " ".join(normalized.split())[:maximum_length].strip()


def bounded_integer(value: Any, minimum: int, maximum: int, default: int) -> int:
    """Normalize a numeric task field without mutating the original input."""

    if isinstance(value, bool):
        return default
    try:
        parsed = int(str(value).strip(), 10)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def has_sensitive_marker(value: str) -> bool:
    """Recognize content that must not appear in accepted generated steps."""

    return any(
        pattern.search(value)
        for pattern in (
            _EMAIL_PATTERN,
            _URL_PATTERN,
            _BEARER_TOKEN_PATTERN,
            _NAMED_TOKEN_PATTERN,
            _API_KEY_PATTERN,
            _LONG_IDENTIFIER_PATTERN,
        )
    )


def _redact(value: str) -> str:
    redacted = _EMAIL_PATTERN.sub("[redacted-email]", value)
    redacted = _URL_PATTERN.sub("[redacted-url]", redacted)
    redacted = _BEARER_TOKEN_PATTERN.sub("[redacted-token]", redacted)
    redacted = _NAMED_TOKEN_PATTERN.sub("[redacted-token]", redacted)
    redacted = _API_KEY_PATTERN.sub("[redacted-token]", redacted)
    return _LONG_IDENTIFIER_PATTERN.sub("[redacted-id]", redacted)
