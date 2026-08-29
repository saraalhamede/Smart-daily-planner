"""Strict structural contracts for future Generative AI responses."""

from __future__ import annotations

from copy import deepcopy
from types import MappingProxyType
from typing import Any


TASK_BREAKDOWN_SCHEMA_NAME = "task_breakdown_v1"
ADVICE_SCHEMA_NAME = "advice_v1"

TASK_BREAKDOWN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "subtasks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "order_index": {"type": "integer"},
                },
                "required": ["title", "order_index"],
            },
        },
    },
    "required": ["subtasks"],
}

ADVICE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "advice": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "advice_type": {
                        "type": "string",
                        "enum": [
                            "recommendation",
                            "energy",
                            "stress",
                            "mood",
                            "productivity",
                            "deadline",
                            "schedule",
                            "time_management",
                            "feedback",
                            "task",
                        ],
                    },
                    "title": {"type": "string"},
                    "message": {"type": "string"},
                    "priority": {"type": "integer", "enum": [1, 2, 3, 4]},
                    "scope": {
                        "type": "string",
                        "enum": ["daily", "weekly", "monthly", "task"],
                    },
                    "task_ref": {"type": ["string", "null"]},
                },
                "required": [
                    "advice_type",
                    "title",
                    "message",
                    "priority",
                    "scope",
                    "task_ref",
                ],
            },
        },
    },
    "required": ["advice"],
}

SCHEMAS = MappingProxyType(
    {
        TASK_BREAKDOWN_SCHEMA_NAME: TASK_BREAKDOWN_SCHEMA,
        ADVICE_SCHEMA_NAME: ADVICE_SCHEMA,
    }
)

DEFAULT_OUTPUT_LIMITS = MappingProxyType(
    {
        TASK_BREAKDOWN_SCHEMA_NAME: 256,
        ADVICE_SCHEMA_NAME: 512,
    }
)


def get_schema(schema_name: str) -> dict[str, Any] | None:
    schema = SCHEMAS.get(schema_name)
    return deepcopy(schema) if schema is not None else None
