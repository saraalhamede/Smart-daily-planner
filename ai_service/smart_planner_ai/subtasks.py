from __future__ import annotations

import re

from .common import clamp, text


ACTION_PREFIXES = (
    "update",
    "improve",
    "fix",
    "remove",
    "export",
    "write",
    "review",
    "design",
    "connect",
    "test",
    "prepare",
    "finish",
    "create",
    "add",
    "check",
)


def generate_subtasks(payload: dict) -> dict:
    title = text(payload.get("title"))
    description = text(payload.get("description"))
    category = text(payload.get("category") or "general")
    difficulty = clamp(payload.get("difficulty_level"), 1, 5, 3)
    duration = clamp(payload.get("estimated_duration_minutes"), 15, 480, 60)

    candidates = extract_action_steps(description)
    if not candidates:
        candidates = fallback_steps(title, category, difficulty, duration)

    max_steps = 5 if duration >= 75 or difficulty >= 4 else 4
    subtasks = dedupe(candidates)[:max_steps]

    return {
        "module": "subtask_generation",
        "source": "python_ai_service",
        "model": "rule_based_action_extractor",
        "subtasks": [
            {"title": normalize_title(step), "order_index": index + 1}
            for index, step in enumerate(subtasks)
        ],
        "confidence": 0.76 if description else 0.52,
        "signals": {
            "category": category,
            "difficulty_level": difficulty,
            "estimated_duration_minutes": duration,
        },
    }


def extract_action_steps(description: str) -> list[str]:
    if not description:
        return []

    normalized = description.replace("\n", ". ")
    raw_parts = re.split(r"[.;]|\band\b|,", normalized, flags=re.IGNORECASE)
    steps = []
    for part in raw_parts:
        cleaned = clean_phrase(part)
        if len(cleaned) < 4:
            continue
        if starts_like_action(cleaned) or len(cleaned.split()) <= 8:
            steps.append(cleaned)
    return steps


def fallback_steps(title: str, category: str, difficulty: int, duration: int) -> list[str]:
    task_name = title or "task"
    if category == "coding":
        return [
            f"Review requirements for {task_name}",
            "Implement the main change",
            "Test the updated behavior",
            "Clean up and save changes",
        ]
    if category == "writing":
        return [
            f"Outline {task_name}",
            "Write the main content",
            "Review and fix wording",
            "Prepare the final version",
        ]
    if category == "study":
        return [
            f"Review material for {task_name}",
            "Work through the main examples",
            "Summarize important points",
            "Check understanding",
        ]
    if duration <= 30 and difficulty <= 2:
        return [f"Prepare {task_name}", "Complete the task", "Review the result"]
    return [f"Plan {task_name}", "Complete the main work", "Review and fix issues", "Finalize the task"]


def starts_like_action(value: str) -> bool:
    first = value.split()[0].lower()
    return first in ACTION_PREFIXES or first.endswith(("ing", "ize"))


def clean_phrase(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" -:\t")
    cleaned = re.sub(r"^(then|also|and|to)\s+", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def normalize_title(value: str) -> str:
    cleaned = clean_phrase(value)
    if not cleaned:
        return "Complete next step"
    return cleaned[0].upper() + cleaned[1:]


def dedupe(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result
