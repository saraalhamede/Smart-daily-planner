from __future__ import annotations

import copy
import json
import unittest

from ai_service.smart_planner_ai.advice import ADVICE_INSTRUCTIONS, generate_advice, validate_generated_advice
from ai_service.smart_planner_ai.generative_config import DEFAULT_MODEL, load_config
from ai_service.smart_planner_ai.openai_adapter import GenerativeResult


def enabled_config(**overrides: str):
    environment = {
        "AI_GENERATIVE_ENABLED": "true",
        "OPENAI_API_KEY": "unit-test-placeholder",
        "OPENAI_MODEL": DEFAULT_MODEL,
        "OPENAI_TIMEOUT_SECONDS": "6",
        "AI_GENERATIVE_MAX_OUTPUT_TOKENS": "512",
        "AI_GENERATIVE_MAX_INPUT_CHARS": "8000",
    }
    environment.update(overrides)
    return load_config(environment)


def provider_context(**overrides: object) -> dict:
    context = {
        "context_version": "advice_context_v1",
        "scope": "daily",
        "checkin": {
            "mood_level": 3,
            "energy_level": 3,
            "stress_level": 2,
            "sleep_hours": 7.0,
            "is_tired": False,
        },
        "aggregates": {
            "waiting_count": 2,
            "in_progress_count": 1,
            "completed_count": 1,
            "productivity_score": 50,
            "breaks_count": 2,
            "break_duration_minutes": 20,
        },
        "tasks": {
            "current_task": task_entry("current_task", "in_progress"),
            "waiting": [task_entry("waiting_1", "waiting")],
            "completed": [],
            "deadline_tasks": [task_entry("deadline_1", "waiting", deadline_status="due_in_1_days", deadline_distance_days=1)],
        },
        "recent_feedback": {
            "task_ref": "current_task",
            "outcome": "in_progress",
            "actual_duration_minutes": 30,
            "planned_duration_minutes": 45,
            "difficulty_feedback": 3,
            "energy_after": 3,
            "mood_after": 3,
        },
        "period_summaries": [],
    }
    context.update(overrides)
    return context


def task_entry(task_ref: str, status: str, **overrides: object) -> dict:
    entry = {
        "task_ref": task_ref,
        "category": "writing",
        "status": status,
        "difficulty": 4,
        "priority": 4,
        "planned_duration_minutes": 90,
        "actual_duration_minutes": None,
        "deadline_status": "none",
        "deadline_distance_days": None,
        "subtask_completed_count": 1,
        "subtask_total_count": 3,
        "subtask_progress_percentage": 33,
    }
    entry.update(overrides)
    return entry


def valid_advice(**overrides: object) -> dict:
    result = {
        "advice": [
            {
                "advice_type": "productivity",
                "title": "Choose one next step",
                "message": "Keep the next task small and focused.",
                "priority": 3,
                "scope": "daily",
                "task_ref": "current_task",
            },
            {
                "advice_type": "deadline",
                "title": "Protect deadline time",
                "message": "Give the nearest deadline a focused work block before lower-priority tasks.",
                "priority": 2,
                "scope": "daily",
                "task_ref": "deadline_1",
            },
        ]
    }
    result.update(overrides)
    return result


class FakeAdapter:
    def __init__(self, result: GenerativeResult) -> None:
        self.result = result
        self.calls: list[tuple] = []

    def generate(self, *args, **kwargs) -> GenerativeResult:
        self.calls.append((args, kwargs))
        return self.result


def successful_result(data: dict | None = None) -> GenerativeResult:
    return GenerativeResult(
        ok=True,
        data=data or valid_advice(),
        error_category=None,
        requested_provider="openai_responses_api",
        requested_model=DEFAULT_MODEL,
        actual_provider="openai_responses_api",
        actual_model=DEFAULT_MODEL,
        status="completed",
        input_tokens=20,
        output_tokens=40,
        total_tokens=60,
    )


class AdviceGenerativeTests(unittest.TestCase):
    def test_disabled_mode_preserves_rule_based_advice_without_provider_call(self) -> None:
        adapter = FakeAdapter(successful_result())
        result = generate_advice({"daily_checkin": {"energy_level": 2}}, config=load_config({}), adapter=adapter)

        self.assertEqual(adapter.calls, [])
        self.assertEqual(result["source"], "python_ai_service")
        self.assertEqual(result["provenance"], "python_rule_based_fallback")
        self.assertFalse(result["generated_by_ai"])
        self.assertEqual(result["fallback_reason_category"], "feature_disabled")

    def test_missing_key_falls_back_without_provider_call(self) -> None:
        adapter = FakeAdapter(successful_result())
        result = generate_advice({"legacy_context": {}, "generative_context": provider_context()}, config=enabled_config(OPENAI_API_KEY=""), adapter=adapter)

        self.assertEqual(adapter.calls, [])
        self.assertEqual(result["fallback_reason_category"], "missing_configuration")

    def test_invalid_or_unminimized_provider_context_never_calls_provider(self) -> None:
        adapter = FakeAdapter(successful_result())
        unsafe = provider_context()
        unsafe["user_id"] = "not-approved"
        result = generate_advice({"legacy_context": {}, "generative_context": unsafe}, config=enabled_config(), adapter=adapter)

        self.assertEqual(adapter.calls, [])
        self.assertEqual(result["fallback_reason_category"], "invalid_input")

        for mutation in (
            lambda context: context["checkin"].update({"mood_note": "Private mood note"}),
            lambda context: context["tasks"]["current_task"].update({"title": "Private title"}),
            lambda context: context["tasks"]["current_task"].update({"description": "Private description"}),
            lambda context: context["recent_feedback"].update({"comment": "Private feedback"}),
        ):
            with self.subTest(mutation=mutation):
                context = provider_context()
                mutation(context)
                rejected_adapter = FakeAdapter(successful_result())
                rejected = generate_advice(
                    {"legacy_context": {}, "generative_context": context},
                    config=enabled_config(),
                    adapter=rejected_adapter,
                )
                self.assertEqual(rejected_adapter.calls, [])
                self.assertEqual(rejected["fallback_reason_category"], "invalid_input")

    def test_valid_context_calls_fake_adapter_once_with_fixed_contract(self) -> None:
        context = provider_context()
        adapter = FakeAdapter(successful_result())
        result = generate_advice({"legacy_context": {"daily_checkin": {"energy_level": 3}}, "generative_context": context}, config=enabled_config(), adapter=adapter)

        self.assertEqual(len(adapter.calls), 1)
        args, kwargs = adapter.calls[0]
        self.assertEqual(args[0], "advice_v1")
        self.assertEqual(args[1], context)
        self.assertEqual(args[2], ADVICE_INSTRUCTIONS)
        self.assertEqual(kwargs["output_limit"], 512)
        self.assertEqual(result["source"], "openai_responses_api")
        self.assertTrue(result["generated_by_ai"])
        self.assertEqual(result["model"], DEFAULT_MODEL)

    def test_provider_contract_accepts_only_structured_allowlisted_task_categories(self) -> None:
        context = provider_context()
        context["tasks"]["current_task"]["category"] = "coding"
        adapter = FakeAdapter(successful_result())
        accepted = generate_advice(
            {"legacy_context": {}, "generative_context": context},
            config=enabled_config(),
            adapter=adapter,
        )
        self.assertTrue(accepted["generated_by_ai"])
        self.assertEqual(len(adapter.calls), 1)

        rejected_context = provider_context()
        rejected_context["tasks"]["current_task"]["category"] = "untrusted free text"
        rejected_adapter = FakeAdapter(successful_result())
        rejected = generate_advice(
            {"legacy_context": {}, "generative_context": rejected_context},
            config=enabled_config(),
            adapter=rejected_adapter,
        )
        self.assertFalse(rejected["generated_by_ai"])
        self.assertEqual(rejected_adapter.calls, [])
        self.assertEqual(rejected["fallback_reason_category"], "invalid_input")

    def test_validates_counts_scope_refs_and_duplicate_advice(self) -> None:
        refs = {"current_task", "deadline_1", "waiting_1"}
        self.assertIsNotNone(validate_generated_advice(valid_advice(), "daily", refs))
        self.assertIsNone(validate_generated_advice({"advice": []}, "daily", refs))
        self.assertIsNone(validate_generated_advice({"advice": valid_advice()["advice"] * 4}, "daily", refs))
        invalid_scope = valid_advice()
        invalid_scope["advice"][0]["scope"] = "weekly"
        self.assertIsNone(validate_generated_advice(invalid_scope, "daily", refs))
        invalid_ref = valid_advice()
        invalid_ref["advice"][0]["task_ref"] = "task-id-should-never-pass"
        self.assertIsNone(validate_generated_advice(invalid_ref, "daily", refs))
        duplicated = valid_advice()
        duplicated["advice"].append(copy.deepcopy(duplicated["advice"][0]))
        self.assertIsNone(validate_generated_advice(duplicated, "daily", refs))

    def test_rejects_sensitive_or_unsafe_advice_before_success_is_returned(self) -> None:
        unsafe = valid_advice()
        unsafe["advice"][0]["message"] = "Visit https://example.test for treatment advice."
        adapter = FakeAdapter(successful_result(unsafe))
        result = generate_advice({"legacy_context": {}, "generative_context": provider_context()}, config=enabled_config(), adapter=adapter)

        self.assertFalse(result["generated_by_ai"])
        self.assertEqual(result["source"], "python_ai_service")
        self.assertEqual(result["provenance"], "python_rule_based_fallback")
        self.assertEqual(result["fallback_reason_category"], "local_validation_failure")

    def test_provider_failure_uses_safe_python_fallback(self) -> None:
        adapter = FakeAdapter(GenerativeResult(
            ok=False,
            data=None,
            error_category="timeout",
            requested_provider="openai_responses_api",
            requested_model=DEFAULT_MODEL,
            actual_provider=None,
            actual_model=None,
            status="provider_error",
        ))
        result = generate_advice({"legacy_context": {}, "generative_context": provider_context()}, config=enabled_config(), adapter=adapter)

        self.assertFalse(result["generated_by_ai"])
        self.assertEqual(result["fallback_reason_category"], "timeout")
        self.assertNotIn("error", result)

    def test_feedback_references_are_limited_to_the_same_minimized_context(self) -> None:
        valid_context = provider_context()
        valid_context["recent_feedback"]["task_ref"] = "waiting_1"
        adapter = FakeAdapter(successful_result())
        valid_result = generate_advice({"legacy_context": {}, "generative_context": valid_context}, config=enabled_config(), adapter=adapter)

        self.assertTrue(valid_result["generated_by_ai"])
        self.assertEqual(len(adapter.calls), 1)

        for invalid_ref in ("waiting_2", "123", "550e8400-e29b-41d4-a716-446655440000", "other_task"):
            with self.subTest(invalid_ref=invalid_ref):
                context = provider_context()
                context["recent_feedback"]["task_ref"] = invalid_ref
                rejected_adapter = FakeAdapter(successful_result())
                result = generate_advice({"legacy_context": {}, "generative_context": context}, config=enabled_config(), adapter=rejected_adapter)

                self.assertEqual(rejected_adapter.calls, [])
                self.assertEqual(result["fallback_reason_category"], "invalid_input")

        null_context = provider_context()
        null_context["recent_feedback"]["task_ref"] = None
        null_adapter = FakeAdapter(successful_result())
        null_result = generate_advice({"legacy_context": {}, "generative_context": null_context}, config=enabled_config(), adapter=null_adapter)
        self.assertTrue(null_result["generated_by_ai"])
        self.assertEqual(len(null_adapter.calls), 1)

    def test_contextual_output_validation_rejects_only_unsafe_schedule_and_diagnosis_language(self) -> None:
        refs = {"current_task", "deadline_1", "waiting_1"}
        allowed = valid_advice()
        allowed["advice"][0]["message"] = "Take a short break before the next task, then complete the introduction."
        self.assertIsNotNone(validate_generated_advice(allowed, "daily", refs))

        for message in (
            "Move your fixed task to a different time.",
            "The planner changed the fixed-task time.",
            "You have depression.",
            "Your stress level confirms a diagnosis.",
        ):
            with self.subTest(message=message):
                invalid = valid_advice()
                invalid["advice"][0]["message"] = message
                self.assertIsNone(validate_generated_advice(invalid, "daily", refs))

    def test_provider_failure_categories_use_one_safe_python_fallback(self) -> None:
        categories = (
            "provider_refusal", "incomplete_output", "authentication_failure", "rate_limit",
            "timeout", "network_failure", "invalid_structured_output",
        )
        for category in categories:
            with self.subTest(category=category):
                adapter = FakeAdapter(GenerativeResult(
                    ok=False,
                    data=None,
                    error_category=category,
                    requested_provider="openai_responses_api",
                    requested_model=DEFAULT_MODEL,
                    actual_provider=None,
                    actual_model=None,
                    status="provider_error",
                ))
                result = generate_advice({"legacy_context": {}, "generative_context": provider_context()}, config=enabled_config(), adapter=adapter)

                self.assertEqual(len(adapter.calls), 1)
                self.assertEqual(result["source"], "python_ai_service")
                self.assertEqual(result["provenance"], "python_rule_based_fallback")
                self.assertEqual(result["fallback_reason_category"], category)
                self.assertFalse(result["generated_by_ai"])
                self.assertNotIn("error", result)

        invalid_adapter = FakeAdapter(successful_result({"advice": []}))
        invalid_result = generate_advice({"legacy_context": {}, "generative_context": provider_context()}, config=enabled_config(), adapter=invalid_adapter)
        self.assertEqual(len(invalid_adapter.calls), 1)
        self.assertEqual(invalid_result["fallback_reason_category"], "local_validation_failure")
        self.assertNotIn("error", invalid_result)

    def test_fake_adapter_receives_no_legacy_user_authored_text(self) -> None:
        context = provider_context()
        legacy = {
            "title": "English SentinelName",
            "description": "Arabic sentinel اسم_خاص and Hebrew sentinel שם_מיוחד 050-123-4567",
            "daily_checkin": {"mood_text_original": "Mood SentinelName +972 50 123 4567"},
            "task_feedback": [{"comment": "Feedback SentinelName person@example.test https://example.test bearer secret-token-value"}],
            "task_id": "550e8400-e29b-41d4-a716-446655440000",
        }
        adapter = FakeAdapter(successful_result())
        result = generate_advice({"legacy_context": legacy, "generative_context": context}, config=enabled_config(), adapter=adapter)

        self.assertTrue(result["generated_by_ai"])
        serialized = json.dumps(adapter.calls[0][0][1], ensure_ascii=False)
        for sentinel in (
            "SentinelName", "اسم_خاص", "שם_מיוחד", "050-123-4567", "+972 50 123 4567",
            "person@example.test", "https://example.test", "secret-token-value", "550e8400-e29b-41d4-a716-446655440000",
        ):
            self.assertNotIn(sentinel, serialized)
