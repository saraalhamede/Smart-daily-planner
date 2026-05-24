from __future__ import annotations

from .common import clamp, number


def generate_schedule_hints(payload: dict) -> dict:
    checkin = payload.get("daily_checkin") or payload.get("daily_log") or payload
    sleep_hours = number(checkin.get("sleep_hours"), 7.0)
    stress_level = clamp(checkin.get("stress_level"), 1, 5, 3)
    energy_level = clamp(checkin.get("predicted_energy_level") or checkin.get("energy_level"), 1, 5, 3)
    feedback = payload.get("feedback_context") or {}

    adjusted_energy = energy_level
    if sleep_hours < 5:
        adjusted_energy -= 1
    if stress_level >= 4:
        adjusted_energy -= 1
    if feedback and not feedback.get("completed", True):
        adjusted_energy -= 1
    adjusted_energy = max(1, min(5, adjusted_energy))

    avoid_high_difficulty = adjusted_energy <= 2 or stress_level >= 4
    recommended_break = 15 if avoid_high_difficulty else 10
    if sleep_hours < 5:
        recommended_break += 5

    return {
        "module": "scheduler_hints",
        "source": "python_ai_service",
        "model": "rule_based_scheduler_support",
        "final_decision_owner": "node_rule_based_scheduler",
        "adjusted_energy_level": adjusted_energy,
        "avoid_high_difficulty": avoid_high_difficulty,
        "recommended_break_minutes": recommended_break,
        "priority_strategy": "deadline_boost" if stress_level <= 3 else "reduce_heavy_task_stack",
        "recommendations": build_recommendations(adjusted_energy, stress_level, sleep_hours),
        "confidence": 0.66,
    }


def build_recommendations(energy: int, stress: int, sleep: float) -> list[str]:
    recommendations = []
    if sleep < 5:
        recommendations.append("Use shorter focus sessions because sleep is low.")
    if stress >= 4:
        recommendations.append("Avoid scheduling multiple difficult tasks back to back.")
    if energy >= 4 and stress <= 2:
        recommendations.append("Place high-priority difficult work in the first strong energy window.")
    if not recommendations:
        recommendations.append("Use the normal rule-based scheduler with balanced breaks.")
    return recommendations
