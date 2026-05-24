from __future__ import annotations

import re
from typing import Any


def clamp(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = fallback
    return max(minimum, min(maximum, parsed))


def number(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def text(value: Any) -> str:
    return str(value or "").strip()


def detect_language(value: str) -> str:
    if re.search(r"[\u0600-\u06ff]", value):
        return "ar"
    if re.search(r"[\u0590-\u05ff]", value):
        return "he"
    return "en"
