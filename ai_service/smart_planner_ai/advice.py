from __future__ import annotations

from statistics import mean
from typing import Any

from .common import clamp, number, text


def generate_advice(payload: dict) -> dict:
    scope = normalize_scope(payload.get("scope") or payload.get("period") or "daily")
    related_date = text(payload.get("date") or payload.get("related_date") or payload.get("note_date"))

    advice = build_daily_advice(payload, related_date) if scope == "daily" else build_period_advice(payload, scope, related_date)
    advice = dedupe_advice(advice)
    if not advice:
        advice = [
            make_note(
                "recommendation",
                "No enough data yet",
                "Add a daily check-in, tasks, and feedback so the planner can generate stronger personalized advice.",
                3,
                scope,
                related_date,
            )
        ]

    return {
        "module": "advice_generation",
        "source": "python_ai_service",
        "model": "rule_based_personalized_advice",
        "advice": advice[:10],
        "confidence": 0.78 if len(advice) > 1 else 0.58,
    }


def build_daily_advice(payload: dict, related_date: str) -> list[dict]:
    checkin = payload.get("daily_checkin") if isinstance(payload.get("daily_checkin"), dict) else payload
    energy = clamp(checkin.get("predicted_energy_level") or checkin.get("energy_level"), 1, 5, 3)
    stress = clamp(checkin.get("stress_level"), 1, 5, 3)
    mood = clamp(checkin.get("mood_level"), 1, 5, 3)
    sleep_hours = number(checkin.get("sleep_hours"), 7)
    completed = int_value(payload.get("completed_tasks_count"), count_status(payload.get("completed_tasks"), "completed"))
    unfinished = int_value(
        payload.get("unfinished_tasks_count"),
        len(as_list(payload.get("waiting_tasks"))) + len(as_list(payload.get("unfinished_tasks"))),
    )
    productivity_score = int_value(payload.get("productivity_score") or payload.get("completion_percentage"), None)
    deadline_tasks = as_list(payload.get("deadline_tasks"))
    current_task = payload.get("current_task_status") if isinstance(payload.get("current_task_status"), dict) else {}
    feedback_summary = payload.get("feedback_summary") if isinstance(payload.get("feedback_summary"), dict) else {}
    breaks_count = int_value(payload.get("breaks_count"), 0)
    has_checkin = has_checkin_data(checkin)
    has_task_data = completed + unfinished > 0 or bool(current_task) or bool(deadline_tasks)

    notes = []
    if not has_checkin and not has_task_data:
        return [
            make_note(
                "recommendation",
                "No enough data yet",
                "Add a daily check-in and tasks so the planner can generate personalized advice for this day.",
                3,
                "daily",
                related_date,
            )
        ]

    if energy <= 2 or sleep_hours < 5.5:
        sleep_text = f" after {sleep_hours:g} hours of sleep" if sleep_hours < 5.5 else ""
        notes.append(make_note(
            "energy",
            "Low energy plan",
            f"Your energy is low today{sleep_text}. Start with easier tasks, use shorter focus blocks, and add a short break before difficult work.",
            1,
            "daily",
            related_date,
        ))

    if energy >= 4 and sleep_hours >= 7 and stress <= 2 and mood >= 4:
        notes.append(make_note(
            "energy",
            "Strong energy window",
            "Your energy is strong today. This is a good time for difficult or high-priority tasks.",
            2,
            "daily",
            related_date,
        ))

    if stress >= 4:
        notes.append(make_note(
            "stress",
            "High stress warning",
            "Your stress level is high. Avoid stacking difficult tasks together and keep one clear next task in front of you.",
            1,
            "daily",
            related_date,
        ))

    if mood <= 2:
        notes.append(make_note(
            "mood",
            "Gentler task order",
            "Your mood check-in is low today. Put routine or lower-pressure tasks first, then move to harder work once momentum improves.",
            2,
            "daily",
            related_date,
        ))

    if unfinished >= 4 or (unfinished > completed and unfinished > 1):
        notes.append(make_note(
            "productivity",
            "Focus the unfinished list",
            f"You still have {unfinished} unfinished task{'s' if unfinished != 1 else ''}. Focus first on high-priority or deadline work instead of trying to clear everything at once.",
            2,
            "daily",
            related_date,
        ))

    if productivity_score == 100 and completed > 0 and unfinished == 0:
        notes.append(make_note(
            "productivity",
            "Excellent progress today",
            "Excellent progress today. You completed all planned tasks.",
            1,
            "daily",
            related_date,
        ))
    elif productivity_score is not None and productivity_score >= 80:
        notes.append(make_note(
            "productivity",
            "Good progress today",
            "Your productivity score is strong. Keep using your high-energy hours for the most difficult tasks and protect that pattern tomorrow.",
            3,
            "daily",
            related_date,
        ))
    elif productivity_score is not None and productivity_score < 50 and completed + unfinished > 0:
        notes.append(make_note(
            "schedule",
            "Simplify the remaining plan",
            "Today is below your usual target. Reduce the remaining workload to the most important tasks and move non-urgent work forward.",
            2,
            "daily",
            related_date,
        ))

    urgent_deadline = nearest_deadline(deadline_tasks)
    if urgent_deadline:
        title = text(urgent_deadline.get("title")) or "A deadline task"
        days_left = urgent_deadline.get("days_left")
        timing = "soon" if days_left is None else f"in {days_left} day{'s' if days_left != 1 else ''}"
        notes.append(make_note(
            "deadline",
            "Deadline needs attention",
            f"{title} is due {timing}. Reserve focused time for it before lower-priority flexible tasks.",
            1 if days_left is not None and days_left <= 1 else 2,
            "daily",
            related_date,
            urgent_deadline.get("task_id"),
        ))

    if int_value(feedback_summary.get("overrun_count"), 0) > 0:
        task_title = text(feedback_summary.get("latest_overrun_task"))
        subject = f"'{task_title}'" if task_title else "A recent task"
        notes.append(make_note(
            "time_management",
            "Adjust future estimates",
            f"{subject} took longer than planned. Similar tasks should receive more time in future schedules.",
            2,
            "task" if feedback_summary.get("latest_overrun_task_id") else "daily",
            related_date,
            feedback_summary.get("latest_overrun_task_id"),
        ))

    if int_value(feedback_summary.get("difficult_count"), 0) > 0:
        task_title = text(feedback_summary.get("latest_difficult_task"))
        subject = f"'{task_title}'" if task_title else "The last task"
        notes.append(make_note(
            "feedback",
            "Add recovery after difficult work",
            f"{subject} felt difficult. Consider adding a short break before the next hard task.",
            2,
            "task" if feedback_summary.get("latest_difficult_task_id") else "daily",
            related_date,
            feedback_summary.get("latest_difficult_task_id"),
        ))

    if current_task:
        current_title = text(current_task.get("title")) or "your current task"
        current_progress = int_value(current_task.get("progress_percentage"), None)
        if current_progress is not None and current_progress < 50:
            notes.append(make_note(
                "task",
                "Break down the active task",
                f"{current_title} is still early in progress. Finish one small subtask first, then update progress before switching context.",
                3,
                "task",
                related_date,
                current_task.get("task_id"),
            ))
        elif current_progress is None:
            notes.append(make_note(
                "task",
                "Active task focus",
                f"{current_title} is currently in progress. Keep the next step small and update feedback when you finish.",
                3,
                "task",
                related_date,
                current_task.get("task_id"),
            ))

    if not has_task_data:
        add_unique_note(notes, make_note(
            "recommendation",
            "No enough data yet",
            "Your check-in is saved. Add tasks or generate a schedule so advice can connect to today's actual plan.",
            3,
            "daily",
            related_date,
        ))
    else:
        fill_daily_baseline_notes(
            notes,
            related_date,
            energy,
            stress,
            mood,
            sleep_hours,
            completed,
            unfinished,
            productivity_score,
            current_task,
            breaks_count,
        )

    if not notes:
        add_unique_note(notes, make_note(
            "recommendation",
            "Balanced day",
            "Your current day looks balanced. Keep checking off subtasks and use feedback if any task feels harder than planned.",
            3,
            "daily",
            related_date,
        ))

    complex_day = (
        energy <= 2 or
        stress >= 4 or
        unfinished >= 4 or
        bool(urgent_deadline) or
        int_value(feedback_summary.get("overrun_count"), 0) > 0 or
        int_value(feedback_summary.get("difficult_count"), 0) > 0
    )
    return notes[:12 if complex_day else 6]


def fill_daily_baseline_notes(
    notes: list[dict],
    related_date: str,
    energy: int,
    stress: int,
    mood: int,
    sleep_hours: float,
    completed: int,
    unfinished: int,
    productivity_score: int | None,
    current_task: dict,
    breaks_count: int,
) -> None:
    if completed > 0:
        add_unique_note(notes, make_note(
            "productivity",
            "Completed task momentum",
            f"You completed {completed} task{'s' if completed != 1 else ''} today. Use what worked in those blocks when planning the next task.",
            3,
            "daily",
            related_date,
        ))

    if unfinished > 0:
        add_unique_note(notes, make_note(
            "schedule",
            "Next task choice",
            f"{unfinished} task{'s are' if unfinished != 1 else ' is'} still waiting. Choose the highest-priority item before adding new work.",
            3,
            "daily",
            related_date,
        ))

    if productivity_score is not None and 0 < productivity_score < 100:
        add_unique_note(notes, make_note(
            "productivity",
            "Progress snapshot",
            f"Your current completion is {productivity_score}%. Keep the next session focused on one clear task.",
            3,
            "daily",
            related_date,
        ))

    if sleep_hours >= 7 and energy >= 3:
        add_unique_note(notes, make_note(
            "energy",
            "Rest supports focus",
            "Your sleep looks supportive today. Protect the time block where you feel most alert.",
            3,
            "daily",
            related_date,
        ))

    if stress <= 2:
        add_unique_note(notes, make_note(
            "stress",
            "Manageable stress",
            "Stress looks manageable today. This is a good setup for steady focused work.",
            3,
            "daily",
            related_date,
        ))

    if mood >= 4:
        add_unique_note(notes, make_note(
            "mood",
            "Positive mood momentum",
            "Your mood check-in is positive. Use that momentum on work that needs attention and patience.",
            3,
            "daily",
            related_date,
        ))

    if breaks_count > 0:
        add_unique_note(notes, make_note(
            "schedule",
            "Protect break time",
            f"Your schedule includes {breaks_count} break{'s' if breaks_count != 1 else ''}. Keep that time for recovery instead of treating it like another task.",
            3,
            "daily",
            related_date,
        ))

    if len(notes) < 5:
        active_text = "1 in progress" if current_task else "none in progress"
        add_unique_note(notes, make_note(
            "schedule",
            "Plan snapshot",
            f"Today has {completed} completed, {unfinished} waiting, and {active_text}. Keep the next step small and visible.",
            3,
            "daily",
            related_date,
        ))

    if len(notes) < 5:
        add_unique_note(notes, make_note(
            "recommendation",
            "Keep the plan realistic",
            "Match difficult work with your best energy and move non-urgent tasks if the day gets crowded.",
            4,
            "daily",
            related_date,
        ))


def build_period_advice(payload: dict, scope: str, related_date: str) -> list[dict]:
    checkins = as_list(payload.get("daily_checkins") or payload.get("daily_logs"))
    evaluations = as_list(payload.get("daily_evaluations"))
    feedback = as_list(payload.get("task_feedback") or payload.get("feedback"))
    schedule_items = as_list(payload.get("schedule_items"))
    notes = []

    energy_values = [number(item.get("predicted_energy_level") or item.get("energy_level"), None) for item in checkins]
    stress_values = [number(item.get("stress_level"), None) for item in checkins]
    productivity_scores = [number(item.get("productivity_score"), None) for item in evaluations]
    energy_values = [value for value in energy_values if value is not None]
    stress_values = [value for value in stress_values if value is not None]
    productivity_scores = [value for value in productivity_scores if value is not None]

    if productivity_scores:
        avg_productivity = round(mean(productivity_scores))
        if avg_productivity >= 75:
            notes.append(make_note(
                "productivity",
                "Strong productivity trend",
                f"Your average productivity score is {avg_productivity}. Keep scheduling difficult work during the time blocks that already work well.",
                3,
                scope,
                related_date,
            ))
        elif avg_productivity < 55:
            notes.append(make_note(
                "productivity",
                "Workload needs trimming",
                f"Your average productivity score is {avg_productivity}. Plan fewer difficult tasks together and protect recovery breaks.",
                2,
                scope,
                related_date,
            ))

    if energy_values and mean(energy_values) <= 2.5:
        notes.append(make_note(
            "energy",
            "Recurring low energy",
            "Your recent check-ins show low energy. Use shorter focus sessions and place difficult tasks after your best rest window.",
            2,
            scope,
            related_date,
        ))

    if stress_values and mean(stress_values) >= 3.5:
        fixed_count = len([item for item in schedule_items if item.get("task_kind") == "fixed"])
        detail = " Stress also appears around fixed-time task days." if fixed_count >= 3 else ""
        notes.append(make_note(
            "stress",
            "Stress trend detected",
            f"Stress has been elevated recently. Reduce heavy task density and leave buffer time between fixed commitments.{detail}",
            1,
            scope,
            related_date,
        ))

    morning_completed = len([item for item in schedule_items if item.get("status") == "completed" and hour_of(item.get("completed_at") or item.get("start_time")) < 12])
    later_completed = len([item for item in schedule_items if item.get("status") == "completed" and hour_of(item.get("completed_at") or item.get("start_time")) >= 12])
    if morning_completed >= 2 and morning_completed > later_completed:
        notes.append(make_note(
            "schedule",
            "Morning focus pattern",
            "You complete more tasks in the morning. Put coding, study, or high-priority work earlier when possible.",
            3,
            scope,
            related_date,
        ))

    overruns = []
    for item in feedback:
        actual = int_value(item.get("actual_duration_minutes"), None)
        planned = int_value(item.get("planned_duration_minutes") or item.get("estimated_duration_minutes"), None)
        if actual and planned and actual > planned * 1.25:
            overruns.append(item)
    if overruns:
        notes.append(make_note(
            "time_management",
            "Estimates are too tight",
            "Some tasks are taking longer than planned. Increase estimates for similar difficult tasks and avoid placing them back-to-back.",
            2,
            scope,
            related_date,
        ))

    if len(feedback) >= 2:
        notes.append(make_note(
            "feedback",
            "Feedback is improving the plan",
            "You are giving useful task feedback. Keep noting actual duration and energy after tasks so future schedules become more accurate.",
            3,
            scope,
            related_date,
        ))

    return notes


def make_note(advice_type: str, title: str, message: str, priority: int, scope: str, related_date: str, related_task_id: Any = None) -> dict:
    return {
        "advice_type": advice_type,
        "title": title,
        "message": message,
        "priority": priority,
        "scope": scope,
        "related_date": related_date or None,
        "related_task_id": related_task_id or None,
    }


def nearest_deadline(tasks: list[dict]) -> dict | None:
    candidates = [task for task in tasks if isinstance(task, dict)]
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: int_value(item.get("days_left"), 9999))[0]


def count_status(items: Any, status: str) -> int:
    return len([item for item in as_list(items) if item.get("status") == status])


def as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def has_checkin_data(checkin: dict) -> bool:
    return any(checkin.get(key) is not None for key in ("mood_level", "energy_level", "predicted_energy_level", "stress_level", "sleep_hours"))


def add_unique_note(notes: list[dict], note: dict) -> None:
    key = (note.get("scope"), note.get("advice_type"), note.get("title"), note.get("message"))
    if not any((item.get("scope"), item.get("advice_type"), item.get("title"), item.get("message")) == key for item in notes):
        notes.append(note)


def int_value(value: Any, fallback: int | None = 0) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def hour_of(value: Any) -> int:
    value_text = text(value)
    if "T" in value_text:
        value_text = value_text.split("T", 1)[1]
    elif " " in value_text:
        value_text = value_text.split(" ", 1)[1]
    return int_value(value_text[:2], 99) or 99


def normalize_scope(value: Any) -> str:
    scope = text(value).lower()
    if scope in {"daily", "weekly", "monthly", "task"}:
        return scope
    return "weekly" if scope == "week" else "daily"


def dedupe_advice(notes: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for note in notes:
        key = (note.get("scope"), note.get("advice_type"), note.get("title"), note.get("message"))
        if key in seen:
            continue
        seen.add(key)
        result.append(note)
    return result
