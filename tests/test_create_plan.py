import copy
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CREATOR_PATH = ROOT / "scripts" / "create_timebudget_plan.py"
VALIDATOR_PATH = ROOT / "scripts" / "validate_portable_plan.py"
DRAFT_PATH = ROOT / "tests" / "fixtures" / "minimal-draft.json"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


creator = load_module("timebudget_creator", CREATOR_PATH)
validator = load_module("timebudget_validator_for_creator_test", VALIDATOR_PATH)


class MinimalPlanCreatorTests(unittest.TestCase):
    def setUp(self):
        self.draft = json.loads(DRAFT_PATH.read_text(encoding="utf-8"))
        self.as_of = datetime.fromisoformat("2026-08-16T09:00:00+08:00")

    def test_normalize_fills_compatibility_fields_without_user_concepts(self):
        plan = creator.normalize(self.draft, self.as_of)
        self.assertEqual([], validator.validate_plan(plan))
        self.assertEqual(0, plan["plan"]["buffer_target_minutes"])
        self.assertEqual({"should"}, {task["priority"] for task in plan["tasks"]})
        self.assertEqual(330, plan["snapshot"]["raw_slack_minutes"])

    def test_create_writes_portable_json_and_fixed_html(self):
        with tempfile.TemporaryDirectory() as directory:
            draft_path = Path(directory) / "draft.json"
            plan_path = Path(directory) / "plan.timebudget.json"
            html_path = Path(directory) / "plan.html"
            draft_path.write_text(json.dumps(self.draft), encoding="utf-8")
            creator.create(draft_path, plan_path, html_path, self.as_of)
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
            document = html_path.read_text(encoding="utf-8")
            self.assertEqual([], validator.validate_plan(plan))
            self.assertIn('id="time-ring"', document)
            self.assertIn('id="week-strip"', document)
            self.assertIn("Finish proposal", document)

    def test_rejects_unknown_or_expanded_task_fields(self):
        unknown = copy.deepcopy(self.draft)
        unknown["priority"] = "must"
        with self.assertRaisesRegex(ValueError, "unsupported draft properties"):
            creator.normalize(unknown, self.as_of)
        expanded = copy.deepcopy(self.draft)
        expanded["tasks"][0]["priority"] = "must"
        with self.assertRaisesRegex(ValueError, "only title and estimated_minutes"):
            creator.normalize(expanded, self.as_of)


if __name__ == "__main__":
    unittest.main()
