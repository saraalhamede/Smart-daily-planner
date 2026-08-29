from __future__ import annotations

import json
import unittest

from ai_service.smart_planner_ai.generative_config import (
    DEFAULT_MAX_INPUT_CHARS,
    DEFAULT_MAX_OUTPUT_TOKENS,
    DEFAULT_MODEL,
    DEFAULT_TIMEOUT_SECONDS,
    INVALID_CONFIGURATION,
    load_config,
)
from ai_service.smart_planner_ai.generative_contracts import (
    ADVICE_SCHEMA,
    ADVICE_SCHEMA_NAME,
    TASK_BREAKDOWN_SCHEMA,
    TASK_BREAKDOWN_SCHEMA_NAME,
)
from ai_service.smart_planner_ai.openai_adapter import (
    ADVICE_SCHEMA_NAME as ADAPTER_ADVICE_SCHEMA_NAME,
    AUTHENTICATION_FAILURE,
    INCOMPLETE_OUTPUT,
    INPUT_TOO_LARGE,
    INVALID_STRUCTURED_OUTPUT,
    NETWORK_FAILURE,
    OpenAIResponsesAdapter,
    PROVIDER_REFUSAL,
    RATE_LIMIT,
    TASK_BREAKDOWN_SCHEMA_NAME as ADAPTER_TASK_SCHEMA_NAME,
    TIMEOUT,
    UNKNOWN_SCHEMA,
)


class FakeUsage:
    input_tokens = 21
    output_tokens = 13
    total_tokens = 34


class FakeResponse:
    def __init__(
        self,
        output_text: str = '{"subtasks": [{"title": "Plan the work", "order_index": 1}, {"title": "Complete the work", "order_index": 2}]}',
        *,
        status: str = "completed",
        model: str = DEFAULT_MODEL,
        refusal: str | None = None,
        usage: object | None = FakeUsage(),
    ) -> None:
        self.output_text = output_text
        self.status = status
        self.model = model
        self.refusal = refusal
        self.usage = usage
        self.output = []


class FakeResponses:
    def __init__(self, response: object | None = None, error: Exception | None = None) -> None:
        self.response = response or FakeResponse()
        self.error = error
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.response


class FakeClient:
    def __init__(self, response: object | None = None, error: Exception | None = None) -> None:
        self.responses = FakeResponses(response, error)


class AuthenticationError(Exception):
    pass


class RateLimitError(Exception):
    pass


class APITimeoutError(Exception):
    pass


class APIConnectionError(Exception):
    pass


class APIStatusError(Exception):
    def __init__(self, status_code: int, message: str = "sensitive provider detail") -> None:
        super().__init__(message)
        self.status_code = status_code


def enabled_environment(**overrides: str) -> dict[str, str]:
    environment = {
        "AI_GENERATIVE_ENABLED": "true",
        "OPENAI_API_KEY": "unit-test-placeholder",
        "OPENAI_MODEL": DEFAULT_MODEL,
        "OPENAI_TIMEOUT_SECONDS": str(DEFAULT_TIMEOUT_SECONDS),
        "AI_GENERATIVE_MAX_OUTPUT_TOKENS": str(DEFAULT_MAX_OUTPUT_TOKENS),
        "AI_GENERATIVE_MAX_INPUT_CHARS": str(DEFAULT_MAX_INPUT_CHARS),
    }
    environment.update(overrides)
    return environment


def task_payload() -> dict[str, object]:
    return {
        "title": "Prepare project report",
        "description": "Review the outline and write the report.",
        "category": "writing",
        "difficulty": 4,
        "priority": 3,
        "estimated_duration_minutes": 90,
    }


def advice_payload() -> dict[str, object]:
    return {
        "scope": "daily",
        "mood_level": 4,
        "energy_level": 3,
        "stress_level": 2,
        "sleep_hours": 7,
        "task_count": 3,
        "completed_count": 1,
    }


def advice_response() -> FakeResponse:
    return FakeResponse(
        output_text=json.dumps(
            {
                "advice": [
                    {
                        "advice_type": "productivity",
                        "title": "Choose one next step",
                        "message": "Keep the next task small and focused.",
                        "priority": 3,
                        "scope": "daily",
                        "task_ref": None,
                    }
                ]
            }
        )
    )


class ConfigurationTests(unittest.TestCase):
    def test_defaults_are_disabled_and_safe(self) -> None:
        config = load_config({})
        self.assertFalse(config.enabled)
        self.assertTrue(config.is_valid)
        self.assertEqual(config.model, DEFAULT_MODEL)
        self.assertEqual(config.timeout_seconds, DEFAULT_TIMEOUT_SECONDS)
        self.assertEqual(config.max_output_tokens, DEFAULT_MAX_OUTPUT_TOKENS)
        self.assertEqual(config.max_input_chars, DEFAULT_MAX_INPUT_CHARS)

    def test_only_explicit_true_enables_feature(self) -> None:
        self.assertTrue(load_config(enabled_environment(AI_GENERATIVE_ENABLED="TrUe")).enabled)
        self.assertFalse(load_config(enabled_environment(AI_GENERATIVE_ENABLED="yes")).enabled)
        self.assertFalse(load_config(enabled_environment(AI_GENERATIVE_ENABLED="1")).enabled)

    def test_missing_key_is_allowed_during_startup(self) -> None:
        config = load_config(enabled_environment(OPENAI_API_KEY=""))
        self.assertTrue(config.enabled)
        self.assertTrue(config.is_valid)
        self.assertEqual(config.api_key, "")

    def test_model_and_numeric_configuration_are_bounded(self) -> None:
        self.assertTrue(load_config(enabled_environment()).is_valid)
        self.assertFalse(load_config(enabled_environment(OPENAI_MODEL="gpt-5.6")).is_valid)
        self.assertFalse(load_config(enabled_environment(OPENAI_TIMEOUT_SECONDS="1")).is_valid)
        self.assertFalse(load_config(enabled_environment(OPENAI_TIMEOUT_SECONDS="7")).is_valid)
        self.assertFalse(load_config(enabled_environment(AI_GENERATIVE_MAX_OUTPUT_TOKENS="127")).is_valid)
        self.assertFalse(load_config(enabled_environment(AI_GENERATIVE_MAX_OUTPUT_TOKENS="2049")).is_valid)
        self.assertFalse(load_config(enabled_environment(AI_GENERATIVE_MAX_INPUT_CHARS="1999")).is_valid)
        self.assertFalse(load_config(enabled_environment(AI_GENERATIVE_MAX_INPUT_CHARS="8001")).is_valid)

    def test_configuration_repr_and_safe_serialization_do_not_expose_key(self) -> None:
        config = load_config(enabled_environment())
        self.assertNotIn("unit-test-placeholder", repr(config))
        self.assertNotIn("api_key", config.to_safe_dict())
        self.assertNotIn("unit-test-placeholder", json.dumps(config.to_safe_dict()))


class ContractTests(unittest.TestCase):
    def test_task_schema_is_strict_and_allows_only_required_fields(self) -> None:
        self.assertEqual(TASK_BREAKDOWN_SCHEMA_NAME, ADAPTER_TASK_SCHEMA_NAME)
        self.assertFalse(TASK_BREAKDOWN_SCHEMA["additionalProperties"])
        item_schema = TASK_BREAKDOWN_SCHEMA["properties"]["subtasks"]["items"]
        self.assertFalse(item_schema["additionalProperties"])
        self.assertEqual(item_schema["required"], ["title", "order_index"])

    def test_advice_schema_is_strict_and_task_ref_is_nullable(self) -> None:
        self.assertEqual(ADVICE_SCHEMA_NAME, ADAPTER_ADVICE_SCHEMA_NAME)
        self.assertFalse(ADVICE_SCHEMA["additionalProperties"])
        item_schema = ADVICE_SCHEMA["properties"]["advice"]["items"]
        self.assertFalse(item_schema["additionalProperties"])
        self.assertEqual(
            item_schema["required"],
            ["advice_type", "title", "message", "priority", "scope", "task_ref"],
        )
        self.assertEqual(item_schema["properties"]["task_ref"]["type"], ["string", "null"])


class AdapterTests(unittest.TestCase):
    def make_adapter(self, *, response: object | None = None, error: Exception | None = None, **overrides: str) -> tuple[OpenAIResponsesAdapter, FakeClient]:
        client = FakeClient(response, error)
        adapter = OpenAIResponsesAdapter(load_config(enabled_environment(**overrides)), client=client)
        return adapter, client

    def test_disabled_feature_never_calls_provider(self) -> None:
        client = FakeClient()
        adapter = OpenAIResponsesAdapter(load_config({}), client=client)
        result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
        self.assertFalse(result.ok)
        self.assertEqual(result.error_category, "feature_disabled")
        self.assertEqual(client.responses.calls, [])

    def test_missing_key_never_calls_provider(self) -> None:
        adapter, client = self.make_adapter(OPENAI_API_KEY="")
        result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
        self.assertFalse(result.ok)
        self.assertEqual(result.error_category, "missing_configuration")
        self.assertEqual(client.responses.calls, [])

    def test_invalid_configuration_never_calls_provider(self) -> None:
        adapter, client = self.make_adapter(OPENAI_MODEL="unapproved-model")
        result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
        self.assertFalse(result.ok)
        self.assertEqual(result.error_category, INVALID_CONFIGURATION)
        self.assertEqual(client.responses.calls, [])

    def test_unknown_schema_never_calls_provider(self) -> None:
        adapter, client = self.make_adapter()
        result = adapter.generate("unknown_v1", task_payload(), "Fixed instruction.")
        self.assertFalse(result.ok)
        self.assertEqual(result.error_category, UNKNOWN_SCHEMA)
        self.assertEqual(client.responses.calls, [])

    def test_oversized_input_never_calls_provider(self) -> None:
        adapter, client = self.make_adapter(AI_GENERATIVE_MAX_INPUT_CHARS="2000")
        payload = {"description": "x" * 2100}
        result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, payload, "Fixed instruction.")
        self.assertFalse(result.ok)
        self.assertEqual(result.error_category, INPUT_TOO_LARGE)
        self.assertEqual(client.responses.calls, [])

    def test_request_uses_approved_responses_settings(self) -> None:
        adapter, client = self.make_adapter()
        result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
        self.assertTrue(result.ok)
        request = client.responses.calls[0]
        self.assertEqual(request["model"], DEFAULT_MODEL)
        self.assertIs(request["store"], False)
        self.assertEqual(request["max_output_tokens"], 256)
        self.assertEqual(request["reasoning"], {"effort": "none"})
        self.assertNotIn("tools", request)
        self.assertNotIn("stream", request)
        self.assertNotIn("background", request)
        self.assertEqual(request["instructions"], "Fixed instruction.")
        self.assertEqual(json.loads(request["input"]), task_payload())
        self.assertEqual(request["text"]["format"]["type"], "json_schema")
        self.assertIs(request["text"]["format"]["strict"], True)

    def test_advice_uses_feature_specific_output_limit(self) -> None:
        adapter, client = self.make_adapter(response=advice_response())
        result = adapter.generate(ADVICE_SCHEMA_NAME, advice_payload(), "Fixed instruction.")
        self.assertTrue(result.ok)
        self.assertEqual(client.responses.calls[0]["max_output_tokens"], 512)

    def test_output_limit_is_clamped_to_global_ceiling(self) -> None:
        adapter, client = self.make_adapter(AI_GENERATIVE_MAX_OUTPUT_TOKENS="128")
        result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.", output_limit=256)
        self.assertTrue(result.ok)
        self.assertEqual(client.responses.calls[0]["max_output_tokens"], 128)

    def test_valid_structured_outputs_return_safe_data_and_usage(self) -> None:
        adapter, _ = self.make_adapter()
        result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
        self.assertTrue(result.ok)
        self.assertEqual(len(result.data["subtasks"]), 2)
        self.assertEqual(result.actual_provider, "openai_responses_api")
        self.assertEqual(result.actual_model, DEFAULT_MODEL)
        self.assertEqual(result.input_tokens, 21)
        self.assertEqual(result.output_tokens, 13)
        self.assertEqual(result.total_tokens, 34)

    def test_invalid_and_incomplete_outputs_are_controlled(self) -> None:
        for response, category in (
            (FakeResponse(output_text=""), INCOMPLETE_OUTPUT),
            (FakeResponse(output_text="not json"), INVALID_STRUCTURED_OUTPUT),
            (FakeResponse(status="incomplete"), INCOMPLETE_OUTPUT),
            (FakeResponse(refusal="not allowed"), PROVIDER_REFUSAL),
        ):
            adapter, _ = self.make_adapter(response=response)
            result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
            self.assertFalse(result.ok)
            self.assertEqual(result.error_category, category)
            self.assertIsNone(result.data)

    def test_provider_errors_are_mapped_without_raw_details(self) -> None:
        cases = (
            (AuthenticationError("sensitive provider detail"), AUTHENTICATION_FAILURE),
            (RateLimitError("sensitive provider detail"), RATE_LIMIT),
            (APITimeoutError("sensitive provider detail"), TIMEOUT),
            (APIConnectionError("sensitive provider detail"), NETWORK_FAILURE),
            (APIStatusError(500), "unexpected_provider_failure"),
        )
        for error, category in cases:
            adapter, _ = self.make_adapter(error=error)
            result = adapter.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
            self.assertFalse(result.ok)
            self.assertEqual(result.error_category, category)
            self.assertNotIn("sensitive provider detail", repr(result))

    def test_client_is_created_lazily_only_for_valid_request(self) -> None:
        calls: list[object] = []

        def factory(config: object) -> FakeClient:
            calls.append(config)
            return FakeClient()

        disabled = OpenAIResponsesAdapter(load_config({}), client_factory=factory)
        disabled.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
        self.assertEqual(calls, [])

        enabled = OpenAIResponsesAdapter(load_config(enabled_environment()), client_factory=factory)
        enabled.generate(TASK_BREAKDOWN_SCHEMA_NAME, task_payload(), "Fixed instruction.")
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
