from __future__ import annotations

import re

from .common import clamp, text


def generate_subtasks(payload: dict) -> dict:
    title = text(payload.get("title"))
    description = text(payload.get("description"))
    category = text(payload.get("category") or "general")
    difficulty = clamp(payload.get("difficulty_level"), 1, 5, 3)
    duration = clamp(payload.get("estimated_duration_minutes"), 15, 480, 60)
    priority = clamp(payload.get("priority_level"), 1, 5, 3)

    if should_skip_breakdown(title, description, category, difficulty, duration, priority):
        return {
            "module": "subtask_generation",
            "source": "python_ai_service",
            "model": "rule_based_ai_style_planner",
            "subtasks": [],
            "skipped": True,
            "reason": "simple_task",
            "message": "No breakdown needed for this simple task.",
            "confidence": 0.78,
            "signals": {
                "category": category,
                "difficulty_level": difficulty,
                "priority_level": priority,
                "estimated_duration_minutes": duration,
            },
        }

    candidates = build_intelligent_steps(title, description, category, difficulty, duration)
    max_steps = 5 if duration >= 75 or difficulty >= 4 else 4
    subtasks = dedupe(candidates)[:max_steps]

    return {
        "module": "subtask_generation",
        "source": "python_ai_service",
        "model": "rule_based_ai_style_planner",
        "subtasks": [
            {"title": normalize_title(step), "order_index": index + 1}
            for index, step in enumerate(subtasks)
        ],
        "confidence": 0.76 if description else 0.52,
        "signals": {
            "category": category,
            "difficulty_level": difficulty,
            "priority_level": priority,
            "estimated_duration_minutes": duration,
        },
    }


def should_skip_breakdown(title: str, description: str, category: str, difficulty: int, duration: int, priority: int) -> bool:
    signals = f"{title} {description} {category}".lower()
    simple_routine = category in {"routine", "personal", "health", "home", "household"} or has_any(
        signals,
        (
            "skin care",
            "skincare",
            "shower",
            "brush",
            "breakfast",
            "lunch",
            "dinner",
            "walk",
            "laundry",
            "tidy",
            "clean room",
            "routine",
        ),
    )
    complex_category = category in {"study", "coding", "writing", "project", "design", "presentation"} or has_any(
        signals,
        (
            "project",
            "presentation",
            "poster",
            "report",
            "essay",
            "code",
            "database",
            "api",
            "research",
            "exam",
            "design",
            "slides",
        ),
    )
    multiple_parts = has_multiple_work_parts(description)

    if duration < 60 and difficulty <= 2 and priority <= 3 and (simple_routine or not complex_category):
        return True
    if duration < 45 and difficulty <= 2 and priority <= 3 and not multiple_parts:
        return True
    return False


def build_intelligent_steps(title: str, description: str, category: str, difficulty: int, duration: int) -> list[str]:
    task_name = title or "the task"
    signals = f"{title} {description} {category}".lower()
    steps = []

    if category == "coding" or has_any(signals, ("code", "api", "database", "backend", "frontend", "bug", "server")):
        steps.extend([
            f"Review requirements and current behavior for {task_name}",
            "Identify the files and data affected by the change",
            "Implement the main logic update",
            "Test the updated behavior with realistic data",
            "Clean up and finalize the change",
        ])
        return steps

    if category == "writing" or has_any(signals, ("write", "essay", "report", "notes", "document", "article")):
        steps.extend([
            f"Outline the main sections for {task_name}",
            "Draft the key content in a clear order",
            "Revise wording, structure, and missing details",
            "Proofread and prepare the final version",
        ])
        if difficulty >= 4 or duration >= 75:
            steps.insert(1, "Collect the references or examples needed")
        return steps

    if has_any(signals, ("presentation", "slide")):
        steps.extend([
            "Define the main sections and order",
            "Collect needed materials or examples",
            "Write the slide content clearly",
            "Review structure and missing parts",
            "Prepare the final version",
        ])
        return steps

    if has_any(signals, ("poster", "design", "layout")):
        steps.append("Review the current layout and final requirements")
        if has_any(signals, ("ai", "model", "models")):
            steps.append("Update the AI models section with clear model types")
        if has_any(signals, ("duplicate", "duplicated", "unnecessary", "repeated")):
            steps.append("Remove duplicated or unnecessary text")
        steps.append("Improve visual spacing, alignment, and hierarchy")
        if has_any(signals, ("export", "pdf", "final")):
            steps.append("Export and verify final PDF quality")
        else:
            steps.append("Review the final design for consistency")
        return steps

    if category == "study" or has_any_word(signals, ("study", "exam", "lecture", "chapter", "homework")):
        steps.extend([
            f"Review the goal and material for {task_name}",
            "Work through the most important examples",
            "Summarize the key ideas in your own words",
            "Check understanding with practice or recall",
        ])
        if difficulty >= 4:
            steps.insert(2, "Mark confusing points for extra review")
        return steps

    steps.extend([
        f"Review the goal and expected result for {task_name}",
        "Prepare the needed materials or workspace",
        "Complete the highest-priority part first",
        "Check quality and fix any issues",
    ])
    if difficulty >= 4 or duration >= 75:
        steps.insert(2, "Break the main work into smaller checkpoints")
    if duration <= 30 and difficulty <= 2:
        return [steps[0], "Complete the main action", "Review the result"]
    steps.append("Finalize and save the result")
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


def has_multiple_work_parts(value: str) -> bool:
    if not value:
        return False
    lower = value.lower()
    separators = lower.count(",") + lower.count(";") + lower.count(" and ") + lower.count(" then ")
    action_words = len(re.findall(r"\b(update|add|fix|remove|export|review|write|collect|test|design|prepare)\b", lower))
    return separators >= 2 or action_words >= 3


def has_any(value: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in value for keyword in keywords)


def has_any_word(value: str, keywords: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(keyword)}\b", value) for keyword in keywords)


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
