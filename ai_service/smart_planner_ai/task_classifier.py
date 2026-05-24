from __future__ import annotations

from .common import text


CATEGORY_RULES = [
    ("coding", ["code", "react", "node", "express", "api", "sql", "mysql", "frontend", "backend", "python"]),
    ("study", ["study", "course", "exam", "assignment", "lecture", "homework", "chapter", "database"]),
    ("writing", ["write", "summary", "report", "presentation", "document", "slides", "essay"]),
    ("routine", ["meeting", "call", "email", "clean", "organize", "buy", "appointment"]),
]


def classify_task(payload: dict) -> dict:
    title = text(payload.get("title"))
    description = text(payload.get("description"))
    combined = f"{title} {description}".lower()

    scores = {}
    for category, words in CATEGORY_RULES:
        scores[category] = sum(1 for word in words if word in combined)

    best_category = max(scores, key=scores.get)
    if scores[best_category] == 0:
        best_category = payload.get("category") or "routine"

    is_fixed = bool(payload.get("is_fixed_time")) or bool(payload.get("fixed_start_time") and payload.get("fixed_end_time"))
    task_type = "fixed" if is_fixed else "flexible"

    return {
        "module": "task_classification",
        "source": "python_ai_service",
        "model": "rule_based_baseline",
        "task_category": best_category,
        "task_type": task_type,
        "confidence": confidence(scores.get(best_category, 0), combined),
        "signals": scores,
    }


def confidence(match_count: int, combined: str) -> float:
    if not combined.strip():
        return 0.3
    if match_count >= 2:
        return 0.82
    if match_count == 1:
        return 0.68
    return 0.45
