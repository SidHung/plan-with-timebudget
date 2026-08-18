import copy
import importlib.util
import json
import re
import tempfile
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RENDERER_PATH = ROOT / "scripts" / "render_interactive_plan.py"
VALIDATOR_PATH = ROOT / "scripts" / "validate_portable_plan.py"
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "valid-plan.timebudget.json"
DEFAULTS_PATH = ROOT / "tests" / "fixtures" / "valid-defaults.json"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


renderer = load_module("timebudget_renderer", RENDERER_PATH)
validator = load_module("timebudget_validator_for_html", VALIDATOR_PATH)


class InteractivePlanRendererTests(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.as_of = datetime.fromisoformat("2026-08-16T13:40:00+08:00")

    def render_plan(self, plan=None, defaults=True):
        directory = tempfile.TemporaryDirectory()
        source = Path(directory.name) / "plan.json"
        output = Path(directory.name) / "plan.html"
        source.write_text(json.dumps(plan or self.plan), encoding="utf-8")
        renderer.render(source, output, DEFAULTS_PATH if defaults else None, self.as_of)
        return directory, output.read_text(encoding="utf-8")

    def test_renderer_bundles_a_small_dependency_free_document(self):
        directory, document = self.render_plan()
        self.addCleanup(directory.cleanup)
        self.assertLess(len(document.encode("utf-8")), 1024 * 1024)
        self.assertIn("Content-Security-Policy", document)
        self.assertIn("connect-src 'none'", document)
        self.assertNotRegex(document, r"<(?:script|link)[^>]+(?:src|href)=")
        self.assertNotIn("fetch(", document)
        self.assertIn("Export updated plan", document)
        self.assertIn("<noscript>", document)

    def test_embedded_plan_round_trips_and_is_schema_valid(self):
        directory, document = self.render_plan()
        self.addCleanup(directory.cleanup)
        match = re.search(r'<script id="embedded-plan" type="application/json">(.*?)</script>', document, re.DOTALL)
        self.assertIsNotNone(match)
        embedded = json.loads(match.group(1))
        self.assertEqual([], validator.validate_plan(embedded))
        self.assertEqual([], list(validator.snapshot_warnings(embedded)))

    def test_malicious_title_is_inert_in_script_and_static_fallback(self):
        plan = copy.deepcopy(self.plan)
        malicious = '</script><img src="https://example.com/leak" onerror="alert(1)">'
        plan["tasks"][1]["title"] = malicious
        directory, document = self.render_plan(plan)
        self.addCleanup(directory.cleanup)
        self.assertNotIn(malicious, document)
        self.assertIn("\\u003c/script\\u003e", document)
        self.assertIn("&lt;/script&gt;&lt;img", document)
        self.assertNotIn('src="https://example.com/leak"', document)

    def test_renderer_rejects_invalid_authoritative_state(self):
        plan = copy.deepcopy(self.plan)
        plan["tasks"][0]["remaining_estimate_minutes"] = 10
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "invalid.json"
            output = Path(directory) / "invalid.html"
            source.write_text(json.dumps(plan), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "completed task"):
                renderer.render(source, output, as_of=self.as_of)
            self.assertFalse(output.exists())

    def test_renderer_rejects_invalid_defaults(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "plan.json"
            defaults = Path(directory) / "defaults.json"
            output = Path(directory) / "plan.html"
            source.write_text(json.dumps(self.plan), encoding="utf-8")
            defaults.write_text('{"format":"timebudget-defaults","unknown":true}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "invalid defaults"):
                renderer.render(source, output, defaults, self.as_of)

    def test_renderer_has_no_source_paths_or_chat_data(self):
        directory, document = self.render_plan()
        self.addCleanup(directory.cleanup)
        self.assertNotIn(str(ROOT), document)
        self.assertNotIn("chat transcript", document.lower())


if __name__ == "__main__":
    unittest.main()
