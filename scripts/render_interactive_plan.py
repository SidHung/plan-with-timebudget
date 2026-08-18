#!/usr/bin/env python3
"""Bundle a validated TimeBudget plan into a self-contained offline HTML page."""

from __future__ import annotations

import argparse
import copy
import html
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "interactive-plan"
VALIDATOR_PATH = ROOT / "scripts" / "validate_portable_plan.py"
MAX_HTML_BYTES = 1024 * 1024


def _load_validator():
    spec = importlib.util.spec_from_file_location("timebudget_validator", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


validator = _load_validator()


def _json_for_script(value: Any) -> str:
    """Serialize JSON so data cannot terminate its application/json script element."""

    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def _format_minutes(value: Any) -> str:
    return "Not evaluated" if value is None else f"{value} min"


def _static_fallback(plan: dict[str, Any]) -> str:
    snapshot = plan["snapshot"]
    task_items = []
    for task in plan["tasks"]:
        checked = "completed" if task["status"] == "completed" else task["status"]
        detail = (
            f"{task['priority']} · {checked} · estimate "
            f"{task['baseline_estimated_minutes']} min · remaining "
            f"{task['remaining_estimate_minutes']} min"
        )
        task_items.append(
            "<li><strong>"
            + html.escape(task["title"], quote=True)
            + "</strong><br><span>"
            + html.escape(detail, quote=True)
            + "</span></li>"
        )
    reserve_items = []
    for reserve in plan["reserves"]:
        detail = f"{reserve['type']} · {reserve['status']} · {reserve['remaining_minutes']} min remaining"
        reserve_items.append(
            "<li><strong>"
            + html.escape(reserve["title"], quote=True)
            + "</strong><br><span>"
            + html.escape(detail, quote=True)
            + "</span></li>"
        )
    return "".join(
        [
            '<section class="noscript-card"><h1>TimeBudget plan</h1>',
            f"<p><strong>{html.escape(plan['plan']['date'])}</strong> · ",
            f"{html.escape(plan['plan']['start_at'])} to {html.escape(plan['plan']['end_at'])}</p>",
            f"<p>Status: <strong>{html.escape(snapshot['capacity_status'])}</strong>. ",
            f"Clock remaining: {_format_minutes(snapshot['clock_minutes_remaining'])}. ",
            f"Unfinished work: {_format_minutes(snapshot['unfinished_estimated_minutes'])}. ",
            f"Pending reserves: {_format_minutes(snapshot['pending_reserve_minutes'])}. ",
            f"Safe slack: {_format_minutes(snapshot['safe_slack_minutes'])}.</p>",
            "<h2>Today's tasks</h2><ul>",
            "".join(task_items) or "<li>No tasks</li>",
            "</ul><h2>Reserves</h2><ul>",
            "".join(reserve_items) or "<li>No reserves</li>",
            "</ul><p>JavaScript is unavailable, so this is a read-only view. Use the portable JSON file to continue the plan.</p></section>",
        ]
    )


def _default_settings(plan: dict[str, Any]) -> dict[str, Any]:
    zone = ZoneInfo(plan["plan"]["timezone"])
    start = datetime.fromisoformat(plan["plan"]["start_at"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(plan["plan"]["end_at"].replace("Z", "+00:00"))
    return {
        "format": "timebudget-defaults",
        "schema_version": "1.0.0",
        "timezone": plan["plan"]["timezone"],
        "planning_start": start.astimezone(zone).strftime("%H:%M"),
        "planning_end": end.astimezone(zone).strftime("%H:%M"),
        "buffer": {"mode": "recommended", "minutes": None},
        "default_break_minutes": 15,
        "default_task_priority": "should",
    }


def render(
    plan_path: Path,
    output_path: Path,
    defaults_path: Path | None = None,
    as_of: datetime | None = None,
) -> None:
    plan = validator.load_plan(plan_path)
    errors = validator.validate_plan(plan)
    if errors:
        raise ValueError("invalid portable plan: " + "; ".join(errors))

    now = as_of or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("as_of must include a timezone offset")
    rendered_plan = copy.deepcopy(plan)
    snapshot = validator.recalculate_snapshot(rendered_plan, now)
    if snapshot is None:
        raise ValueError("could not calculate snapshot from authoritative plan state")
    rendered_plan["snapshot"] = snapshot
    rendered_plan["exported_at"] = now.isoformat(timespec="seconds")
    final_errors = validator.validate_plan(rendered_plan)
    if final_errors:
        raise ValueError("rendered plan became invalid: " + "; ".join(final_errors))

    if defaults_path is not None:
        defaults = validator.load_plan(defaults_path)
        default_errors = validator.validate_defaults(defaults)
        if default_errors:
            raise ValueError("invalid defaults: " + "; ".join(default_errors))
    else:
        defaults = _default_settings(rendered_plan)

    template = (ASSET_ROOT / "template.html").read_text(encoding="utf-8")
    styles = (ASSET_ROOT / "styles.css").read_text(encoding="utf-8")
    script = (ASSET_ROOT / "app.js").read_text(encoding="utf-8")
    document = (
        template.replace("/*__TIMEBUDGET_STYLES__*/", styles)
        .replace("/*__TIMEBUDGET_APP__*/", script)
        .replace("__TIMEBUDGET_PLAN__", _json_for_script(rendered_plan))
        .replace("__TIMEBUDGET_DEFAULTS__", _json_for_script(defaults))
        .replace("__TIMEBUDGET_STATIC_FALLBACK__", _static_fallback(rendered_plan))
    )
    size = len(document.encode("utf-8"))
    if size > MAX_HTML_BYTES:
        raise ValueError(f"generated HTML is {size} bytes; limit is {MAX_HTML_BYTES}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as output_file:
        output_file.write(document)


def _parse_as_of(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise argparse.ArgumentTypeError("--as-of requires an explicit timezone offset")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path, help="Validated .timebudget.json input")
    parser.add_argument("output", type=Path, help="Self-contained .html output")
    parser.add_argument("--defaults", type=Path, help="Optional validated defaults JSON")
    parser.add_argument("--as-of", type=_parse_as_of, help="Deterministic render time for testing")
    args = parser.parse_args()
    try:
        render(args.plan, args.output, args.defaults, args.as_of)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    print(f"WROTE: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
