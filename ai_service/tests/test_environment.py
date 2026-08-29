from __future__ import annotations

import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from ai_service.smart_planner_ai import environment


class RootEnvironmentTests(unittest.TestCase):
    def test_root_environment_path_is_resolved_from_the_package_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "repository"
            source = root / "ai_service" / "smart_planner_ai" / "environment.py"
            source.parent.mkdir(parents=True)
            source.touch()

            self.assertEqual(environment.root_environment_path(source), root / ".env")

    def test_temporary_root_environment_is_loaded_with_explicit_safe_options(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory, patch.dict(os.environ, {}, clear=True):
            root, source = make_source_path(temporary_directory)
            (root / ".env").write_text("AI_GENERATIVE_ENABLED=false\n", encoding="utf-8")
            calls = []

            def loader(**kwargs):
                calls.append(kwargs)
                apply_test_environment(Path(kwargs["dotenv_path"]), kwargs["override"])
                return True

            status = environment.load_root_environment(source_file=source, loader=loader)

            self.assertEqual(status, environment.EnvironmentLoadStatus(True, "loaded"))
            self.assertEqual(os.environ["AI_GENERATIVE_ENABLED"], "false")
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0]["dotenv_path"], root / ".env")
            self.assertFalse(calls[0]["override"])
            self.assertEqual(calls[0]["encoding"], "utf-8")
            self.assertFalse(calls[0]["interpolate"])

    def test_existing_process_environment_value_is_not_overridden(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory, patch.dict(
            os.environ,
            {"AI_GENERATIVE_ENABLED": "true"},
            clear=True,
        ):
            root, source = make_source_path(temporary_directory)
            (root / ".env").write_text("AI_GENERATIVE_ENABLED=false\n", encoding="utf-8")

            environment.load_root_environment(
                source_file=source,
                loader=lambda **kwargs: apply_test_environment(Path(kwargs["dotenv_path"]), kwargs["override"]),
            )

            self.assertEqual(os.environ["AI_GENERATIVE_ENABLED"], "true")

    def test_missing_root_environment_is_nonfatal_without_searching_elsewhere(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root, source = make_source_path(temporary_directory)
            (root / "ai_service" / ".env").write_text("UNRELATED=value\n", encoding="utf-8")
            calls = []

            status = environment.load_root_environment(source_file=source, loader=lambda **kwargs: calls.append(kwargs))

            self.assertEqual(status, environment.EnvironmentLoadStatus(False, "missing_file"))
            self.assertEqual(calls, [])

    def test_unavailable_python_dotenv_is_nonfatal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory, patch.dict(os.environ, {}, clear=True):
            root, source = make_source_path(temporary_directory)
            (root / ".env").write_text("AI_GENERATIVE_ENABLED=false\n", encoding="utf-8")

            with patch.object(environment, "_get_dotenv_loader", return_value=None):
                status = environment.load_root_environment(source_file=source)

            self.assertEqual(status, environment.EnvironmentLoadStatus(False, "dotenv_unavailable"))
            self.assertNotIn("AI_GENERATIVE_ENABLED", os.environ)

    def test_status_and_output_never_expose_environment_values(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory, patch.dict(os.environ, {}, clear=True):
            root, source = make_source_path(temporary_directory)
            secret_like_value = "synthetic-value-with-arabic-العربية-and-hebrew-עברית"
            (root / ".env").write_text(f"SYNTHETIC_VALUE={secret_like_value}\n", encoding="utf-8")
            output = io.StringIO()

            with redirect_stdout(output), redirect_stderr(output):
                status = environment.load_root_environment(
                    source_file=source,
                    loader=lambda **kwargs: apply_test_environment(Path(kwargs["dotenv_path"]), kwargs["override"]),
                )

            self.assertNotIn(secret_like_value, repr(status))
            self.assertEqual(output.getvalue(), "")

    def test_unicode_spaces_and_dollar_characters_are_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory, patch.dict(os.environ, {}, clear=True):
            root, source = make_source_path(temporary_directory)
            value = "Arabic العربية Hebrew עברית spaces stay $literal"
            (root / ".env").write_text(f"SYNTHETIC_VALUE={value}\n", encoding="utf-8")

            environment.load_root_environment(
                source_file=source,
                loader=lambda **kwargs: apply_test_environment(Path(kwargs["dotenv_path"]), kwargs["override"]),
            )

            self.assertEqual(os.environ["SYNTHETIC_VALUE"], value)

    def test_service_loads_environment_before_task_breakdown_import(self) -> None:
        service_path = Path(__file__).resolve().parents[1] / "service.py"
        lines = service_path.read_text(encoding="utf-8").splitlines()
        load_line = next(index for index, line in enumerate(lines) if line.strip() == "load_root_environment()")
        subtask_import_line = next(
            index for index, line in enumerate(lines) if line.startswith("from smart_planner_ai.subtasks import")
        )

        self.assertLess(load_line, subtask_import_line)


def make_source_path(temporary_directory: str) -> tuple[Path, Path]:
    root = Path(temporary_directory) / "repository"
    source = root / "ai_service" / "smart_planner_ai" / "environment.py"
    source.parent.mkdir(parents=True)
    source.touch()
    return root, source


def apply_test_environment(path: Path, override: bool) -> None:
    for line in path.read_text(encoding="utf-8").splitlines():
        key, value = line.split("=", 1)
        if override or key not in os.environ:
            os.environ[key] = value
