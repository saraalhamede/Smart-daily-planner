from __future__ import annotations

import os

from flask import Flask, jsonify, request

from smart_planner_ai.mood import analyze_mood
from smart_planner_ai.scheduler_hints import generate_schedule_hints
from smart_planner_ai.task_classifier import classify_task
from smart_planner_ai.time_estimator import estimate_time


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/ai/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "service": "smart-day-planner-ai",
                "version": "0.1.0",
                "modules": [
                    "mood_analysis",
                    "task_classification",
                    "time_estimation",
                    "scheduler_hints",
                ],
                "model_mode": os.getenv("AI_MODEL_MODE", "rule_based"),
            }
        )

    @app.post("/ai/analyze-mood")
    def mood_analysis():
        return jsonify(analyze_mood(read_json()))

    @app.post("/ai/classify-task")
    def task_classification():
        return jsonify(classify_task(read_json()))

    @app.post("/ai/estimate-time")
    def time_estimation():
        return jsonify(estimate_time(read_json()))

    @app.post("/ai/generate-schedule")
    def schedule_hints():
        return jsonify(generate_schedule_hints(read_json()))

    @app.errorhandler(ValueError)
    def handle_value_error(error):
        return jsonify({"error": str(error), "status": 400}), 400

    return app


def read_json() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        raise ValueError("JSON body is required.")
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object.")
    return data


app = create_app()


if __name__ == "__main__":
    host = os.getenv("AI_HOST", "127.0.0.1")
    port = int(os.getenv("AI_PORT", "8000"))
    debug = os.getenv("AI_DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug)
