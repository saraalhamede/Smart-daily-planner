from __future__ import annotations

from .common import clamp, detect_language, number, text


EMOTION_WORDS = {
    "stressed": ["stress", "stressed", "pressure", "worried", "overwhelmed", "anxiety", "panic"],
    "tired": ["tired", "sleepy", "fatigue", "exhausted", "drained", "no energy"],
    "positive": ["happy", "good", "great", "motivated", "calm", "fine", "ready", "confident"],
    "low_mood": ["sad", "down", "upset", "bad", "unmotivated", "angry", "frustrated"],
}


def analyze_mood(payload: dict) -> dict:
    mood_note = text(payload.get("mood_note") or payload.get("mood_text_original"))
    mood_level = clamp(payload.get("mood_level"), 1, 5, 3)
    energy_level = clamp(payload.get("energy_level"), 1, 5, 3)
    stress_level = clamp(payload.get("stress_level"), 1, 5, 3)
    sleep_hours = number(payload.get("sleep_hours"), 7.0)
    is_tired = bool(payload.get("is_tired"))

    predicted_energy = energy_level
    if sleep_hours < 5:
        predicted_energy -= 1
    if stress_level >= 4:
        predicted_energy -= 1
    if is_tired:
        predicted_energy -= 1
    if sleep_hours >= 7 and mood_level >= 4 and stress_level <= 2:
        predicted_energy += 1
    predicted_energy = max(1, min(5, predicted_energy))

    fatigue_score = 0
    if sleep_hours < 5:
        fatigue_score += 2
    elif sleep_hours < 6.5:
        fatigue_score += 1
    if energy_level <= 2:
        fatigue_score += 1
    if is_tired:
        fatigue_score += 1

    stress_estimation = stress_level
    if "overwhelmed" in mood_note.lower() or "panic" in mood_note.lower():
        stress_estimation = max(stress_estimation, 5)
    elif "pressure" in mood_note.lower() or "worried" in mood_note.lower():
        stress_estimation = max(stress_estimation, 4)

    emotion = detect_emotion(mood_note, mood_level, stress_estimation)
    predicted_mood = mood_label(mood_level, emotion)

    return {
        "module": "mood_analysis",
        "source": "python_ai_service",
        "model": "rule_based_baseline",
        "detected_language": detect_language(mood_note),
        "mood_text_translated": mood_note,
        "predicted_mood": predicted_mood,
        "detected_emotion": emotion,
        "stress_estimation": stress_estimation,
        "fatigue_detected": fatigue_score >= 2,
        "fatigue_score": fatigue_score,
        "predicted_energy_level": predicted_energy,
        "energy_insights": build_energy_insight(predicted_energy, sleep_hours, stress_estimation),
        "ai_advice": build_advice(predicted_energy, stress_estimation, fatigue_score),
        "confidence": confidence_for(mood_note, sleep_hours, mood_level, energy_level, stress_level),
    }


def detect_emotion(mood_note: str, mood_level: int, stress_level: int) -> str:
    normalized = mood_note.lower()
    for emotion, words in EMOTION_WORDS.items():
        if any(word in normalized for word in words):
            return emotion
    if stress_level >= 4:
        return "stressed"
    if mood_level <= 2:
        return "low_mood"
    if mood_level >= 4:
        return "positive"
    return "neutral"


def mood_label(mood_level: int, emotion: str) -> str:
    if emotion in {"stressed", "tired", "low_mood"}:
        return emotion
    if mood_level >= 4:
        return "positive"
    if mood_level <= 2:
        return "low_mood"
    return "neutral"


def build_energy_insight(predicted_energy: int, sleep_hours: float, stress_level: int) -> str:
    if predicted_energy <= 2:
        return "Energy is likely low; short and easier task blocks are recommended."
    if stress_level >= 4:
        return "Stress is high, so the schedule should avoid stacking difficult tasks."
    if sleep_hours >= 7 and predicted_energy >= 4:
        return "Energy looks strong enough for high-priority or difficult work."
    return "Energy is balanced; mix focused work with normal breaks."


def build_advice(predicted_energy: int, stress_level: int, fatigue_score: int) -> str:
    if predicted_energy <= 2 or fatigue_score >= 2:
        return "Prefer lighter tasks, shorter sessions, and more breaks today."
    if stress_level >= 4:
        return "Keep difficult work limited and add recovery breaks between blocks."
    return "Use priority and deadlines normally, with balanced breaks."


def confidence_for(mood_note: str, sleep_hours: float, mood_level: int, energy_level: int, stress_level: int) -> float:
    confidence = 0.58
    if mood_note:
        confidence += 0.12
    if sleep_hours > 0:
        confidence += 0.08
    if mood_level and energy_level and stress_level:
        confidence += 0.12
    return round(min(0.9, confidence), 2)
