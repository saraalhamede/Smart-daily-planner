from __future__ import annotations

from .common import clamp, text


BASE_DURATION = {
    "coding": 75,
    "study": 60,
    "writing": 55,
    "routine": 30,
    "general": 45,
}


def estimate_time(payload: dict) -> dict:
    category = text(payload.get("task_category") or payload.get("category") or "general").lower()
    difficulty = clamp(payload.get("difficulty_level"), 1, 5, 3)
    description = text(payload.get("task_description") or payload.get("description"))
    previous_actual_minutes = payload.get("previous_actual_minutes") or []

    base = BASE_DURATION.get(category, BASE_DURATION["general"])
    estimate = base + (difficulty - 3) * 15
    if len(description) > 160:
        estimate += 15
    if any(word in description.lower() for word in ["final", "complex", "full", "integration", "deadline"]):
        estimate += 15

    historical_average = average_minutes(previous_actual_minutes)
    if historical_average:
        estimate = round((estimate * 0.65) + (historical_average * 0.35))

    estimate = max(15, round_to_step(estimate, 15))

    return {
        "module": "time_estimation",
        "source": "python_ai_service",
        "model": "historical_rule_baseline",
        "estimated_duration_minutes": estimate,
        "expected_workload": workload_label(estimate, difficulty),
        "confidence": 0.72 if historical_average else 0.58,
        "signals": {
            "category": category,
            "difficulty_level": difficulty,
            "historical_average_minutes": historical_average,
        },
    }


def average_minutes(values) -> int | None:
    if not isinstance(values, list) or not values:
        return None
    numbers = []
    for value in values:
        try:
            parsed = int(float(value))
        except (TypeError, ValueError):
            continue
        if parsed > 0:
            numbers.append(parsed)
    if not numbers:
        return None
    return round(sum(numbers) / len(numbers))


def workload_label(minutes: int, difficulty: int) -> str:
    if minutes >= 90 or difficulty >= 5:
        return "heavy"
    if minutes >= 45 or difficulty >= 3:
        return "medium"
    return "light"


def round_to_step(value: int | float, step: int) -> int:
    return int(round(value / step) * step)
