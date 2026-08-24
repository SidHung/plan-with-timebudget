#!/usr/bin/env python3
"""Create portable JSON and offline HTML from a minimal TimeBudget draft."""

from __future__ import annotations

import argparse
import importlib.util
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "scripts" / "validate_portable_plan.py"
RENDERER_PATH = ROOT / "scripts" / "render_interactive_plan.py"
MAX_INPUT_BYTES = 256 * 1024


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


validator = _load_module("timebudget_validator_for_create", VALIDATOR_PATH)
renderer = _load_module("timebudget_renderer_for_create", RENDERER_PATH)


def _is_plain_object(value: Any) -> bool:
    return isinstance(value, dict)


def _whole_minutes(value: Any, *, positive: bool = False) -> bool:
    minimum = 1 if positive else 0
    return isinstance(value, int) and not isinstance(value, bool) and minimum <= value <= 1440


def _safe_text(value: Any, maximum: int) -> bool:
    return (
        isinstance(value, str)
        and 1 <= len(value) <= maximum
        and not any(ord(character) < 32 or ord(character) == 127 for character in value)
    )


def _load_draft(path: Path) -> dict[str, Any]:
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("draft exceeds 256 KiB")
    draft = validator.load_plan(path)
    if not _is_plain_object(draft):
        raise ValueError("draft must be a JSON object")
    return draft


def _validate_draft(draft: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    expected = {"format", "schema_version", "timezone", "start_at", "end_at", "tasks", "reserves"}
    extra = set(draft) - expected
    missing = expected - set(draft)
    if extra:
        errors.append("unsupported draft properties: " + ", ".join(sorted(extra)))
    if missing:
        errors.append("missing draft properties: " + ", ".join(sorted(missing)))
    if draft.get("format") != "timebudget-draft":
        errors.append("format must be timebudget-draft")
    if draft.get("schema_version") != "1.0.0":
        errors.append("schema_version must be 1.0.0")
    if not _safe_text(draft.get("timezone"), 100):
        errors.append("timezone must be a valid IANA timezone name")
    else:
        try:
            ZoneInfo(draft["timezone"])
        except (KeyError, ValueError):
            errors.append("timezone must be a valid IANA timezone name")

    for key in ("start_at", "end_at"):
        value = draft.get(key)
        if not isinstance(value, str):
            errors.append(f"{key} must be an offset-aware timestamp")
            continue
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None or parsed.utcoffset() is None or parsed.second or parsed.microsecond:
                raise ValueError
        except ValueError:
            errors.append(f"{key} must be minute-aligned and include an offset")

    tasks = draft.get("tasks")
    if not isinstance(tasks, list) or len(tasks) > 200:
        errors.append("tasks must be an array with at most 200 entries")
    else:
        for index, task in enumerate(tasks):
            if not _is_plain_object(task) or set(task) != {"title", "estimated_minutes"}:
                errors.append(f"tasks[{index}] must contain only title and estimated_minutes")
                continue
            if not _safe_text(task.get("title"), 200):
                errors.append(f"tasks[{index}].title is invalid")
            if not _whole_minutes(task.get("estimated_minutes"), positive=True):
                errors.append(f"tasks[{index}].estimated_minutes must be 1–1440")

    reserves = draft.get("reserves")
    if not isinstance(reserves, list) or len(reserves) > 50:
        errors.append("reserves must be an array with at most 50 entries")
    else:
        reserve_keys = {"title", "type", "minutes", "start_at", "end_at"}
        for index, reserve in enumerate(reserves):
            if not _is_plain_object(reserve) or set(reserve) != reserve_keys:
                errors.append(f"reserves[{index}] must contain title, type, minutes, start_at, and end_at")
                continue
            if not _safe_text(reserve.get("title"), 200):
                errors.append(f"reserves[{index}].title is invalid")
            if reserve.get("type") not in {"meal", "break", "fixed_commitment"}:
                errors.append(f"reserves[{index}].type is invalid")
            if not _whole_minutes(reserve.get("minutes"), positive=True):
                errors.append(f"reserves[{index}].minutes must be 1–1440")
            if (reserve.get("start_at") is None) != (reserve.get("end_at") is None):
                errors.append(f"reserves[{index}] must provide both timestamps or neither")
    return errors


def normalize(draft: dict[str, Any], as_of: datetime | None = None) -> dict[str, Any]:
    errors = _validate_draft(draft)
    if errors:
        raise ValueError("invalid minimal draft: " + "; ".join(errors))

    now = as_of or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("as_of must include a timezone offset")
    zone = ZoneInfo(draft["timezone"])
    start = datetime.fromisoformat(draft["start_at"].replace("Z", "+00:00"))
    local_date = start.astimezone(zone).date().isoformat()
    suffix = uuid.uuid4().hex[:8]
    plan = {
        "format": "timebudget-plan",
        "schema_version": "1.0.0",
        "revision": 1,
        "exported_at": now.isoformat(timespec="seconds"),
        "plan": {
            "id": f"tbp_{local_date}_{suffix}",
            "date": local_date,
            "timezone": draft["timezone"],
            "start_at": draft["start_at"],
            "end_at": draft["end_at"],
            "lifecycle_status": "active",
            "closed_at": None,
            "close_reason": None,
            "buffer_original_minutes": 0,
            "buffer_target_minutes": 0,
        },
        "reserves": [
            {
                "id": f"reserve_{index:03d}",
                "type": reserve["type"],
                "title": reserve["title"],
                "minutes": reserve["minutes"],
                "status": "planned",
                "start_at": reserve["start_at"],
                "end_at": reserve["end_at"],
                "remaining_minutes": reserve["minutes"],
                "actual_minutes": None,
                "consumed_at": None,
            }
            for index, reserve in enumerate(draft["reserves"], 1)
        ],
        "tasks": [
            {
                "id": f"task_{index:03d}",
                "title": task["title"],
                "priority": "should",
                "status": "planned",
                "baseline_estimated_minutes": task["estimated_minutes"],
                "estimate_source": "user",
                "estimate_range_minutes": None,
                "actual_minutes": None,
                "actual_source": None,
                "remaining_estimate_minutes": task["estimated_minutes"],
                "not_before_at": None,
                "deadline_at": None,
                "completed_at": None,
                "carried_from_plan_id": None,
                "carried_from_task_id": None,
            }
            for index, task in enumerate(draft["tasks"], 1)
        ],
        "snapshot": {
            "as_of": now.isoformat(timespec="seconds"),
            "total_plan_minutes": 0,
            "clock_minutes_remaining": None,
            "unfinished_estimated_minutes": 0,
            "pending_reserve_minutes": 0,
            "raw_slack_minutes": None,
            "buffer_target_minutes": 0,
            "safe_slack_minutes": None,
            "capacity_status": "not_evaluated",
        },
    }
    plan["snapshot"] = validator.recalculate_snapshot(plan, now)
    validation_errors = validator.validate_plan(plan)
    if validation_errors:
        raise ValueError("normalized plan is invalid: " + "; ".join(validation_errors))
    return plan


def create(draft_path: Path, plan_path: Path, html_path: Path, as_of: datetime | None = None) -> None:
    draft = _load_draft(draft_path)
    plan = normalize(draft, as_of)
    plan_path.parent.mkdir(parents=True, exist_ok=True)
    with plan_path.open("w", encoding="utf-8", newline="\n") as output_file:
        json.dump(plan, output_file, ensure_ascii=False, indent=2, allow_nan=False)
        output_file.write("\n")
    renderer.render(plan_path, html_path, as_of=as_of)


def _parse_as_of(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise argparse.ArgumentTypeError("--as-of requires an explicit timezone offset")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("draft", type=Path, help="Minimal timebudget-draft JSON input")
    parser.add_argument("plan", type=Path, help="Portable .timebudget.json output")
    parser.add_argument("html", type=Path, help="Self-contained .html output")
    parser.add_argument("--as-of", type=_parse_as_of, help="Deterministic creation time for testing")
    args = parser.parse_args()
    try:
        create(args.draft, args.plan, args.html, args.as_of)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    print(f"WROTE: {args.plan}")
    print(f"WROTE: {args.html}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
