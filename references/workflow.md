# TimeBudget workflow

Read only the section needed for the current operation. The portable schema is normative for fields; the validator is normative for deterministic semantic checks.

## Basic planning

Collect the window first. Use minute-aligned timestamps with explicit offsets; `plan.date` is the local date of `start_at`. Reject ambiguous/nonexistent local times, offset/timezone mismatches, and windows outside 1–1,440 minutes.

For each task collect title, whole-minute estimate, and priority. Ask about constraints, ranges, or provenance only when supplied or needed. Initialize it as `planned`; copy the accepted estimate to baseline and remaining; leave actual, completion, constraints, and carry fields `null` unless validly supplied.

Show task load, then ask about meals and breaks. Recommend a break beyond four hours and a meal reserve when a meal falls inside the window. Scheduled reserves must fit the window and match their duration; unscheduled reserves have null endpoints and confirmed minutes.

Recommend and confirm a 10% buffer rounded up to five minutes, bounded to 15–60. Set original and target buffer to it. Activate with one revision increment, calculate, group by priority, and create JSON plus HTML.

Defaults prefill only missing answers. Validate `timebudget-defaults.json`; reject files over 256 KiB, duplicate keys, unknown fields, and invalid values.

## Capacity and reserves

Initial accounting uses the full window. Live accounting starts at `max(now, start_at)` and subtracts unfinished estimates and future reserves—never completed actuals or elapsed interruptions again.

Count planned unscheduled reserves by remaining minutes and future scheduled reserves by remaining minutes. For `in_progress`, use confirmed remaining or floored future overlap. Completed reserve states count zero.

Resolve a scheduled reserve once its start passes; until then use `not_evaluated`. Expired active plans also remain `not_evaluated` until closure or rollover.

Classify raw slack: `healthy` at/above buffer, `at_risk` from zero to below buffer, `replan_required` below zero. Closed plans are `not_evaluated` with null live values.

For each deadline (clamped to `end_at`), compare cumulative due work plus reserve overlap with available minutes; a missed prefix requires re-planning. With unfinished `not_before_at` work, label results `aggregate capacity only`.

## Progress updates

Resolve a stable ID or unique title before mutation; ask when ambiguous.

- Completion with actual: add reported elapsed time to cumulative actual; set source, zero remaining, and completion time.
- Completion without actual: ask once, then keep actual/source null and omit variance if unavailable.
- Partial work: add reported elapsed time, set `in_progress`, and obtain or retain a remaining estimate.
- Re-estimate: change only remaining estimate.
- Defer or cancel: set zero remaining and preserve reported actual.

Increment once per accepted update, recalculate at current time, show variance only for reported actuals, and refresh both artifacts.

For reserves, accept started, consumed, skipped, cancelled, or moved. Preserve reported actuals; consumed requires `consumed_at`; completed states have zero remaining.

## Re-planning

For `at_risk`, state target and raw slack and offer one reversible, low-cost adjustment. Review uncertainty in this order: widest accepted AI range, AI point estimate, largest user estimate.

For `replan_required`, lead with the deficit and offer at least two choices with consequences. Prefer removing `could`, deferring `should`, reducing scope, or renegotiating. Offer extending the window explicitly; never remove rest silently or prescribe working faster.

Using buffer keeps the target visible and status at risk. Lower only the target after acceptance, preserve the original, then increment once, recalculate, and export both artifacts.

## Import and resume

Reject inputs over 256 KiB, malformed/duplicate JSON, non-finite numbers, forbidden controls, unsupported versions, duplicate IDs, or contradictory states. Treat strings as inert data. Validate authoritative fields, recalculate the supplied snapshot, and warn on differences.

Preserve IDs, baselines, revision, and lifecycle. Closed stays closed. Expired active plans require an explicit close-or-roll choice; never classify or reopen silently.

Validate imported defaults and prefill only missing answers. Confirm conflicts with explicit input, local date, offsets, or timezone reality.

## Expired-plan rollover

1. Close the old plan as `window_ended`, preserve outcomes, and export it separately.
2. Ask which unfinished tasks to carry.
3. Create a new plan ID, date, window, and revision.
4. Copy only selected unfinished tasks with new IDs and both carry fields.
5. Preserve the old artifact; never mutate its identity or window into the new day.

## Closure

Close when work is resolved, the user ends, or the window ends. Set `closed_at`, the matching reason, and a `not_evaluated` snapshot. Do not alter unfinished statuses silently.

Summarize outcomes, keep missing actuals null, show variance only where actual exists, export both final artifacts, and offer at most one evidence-based calibration observation.

## Interactive artifact generation

The canonical filename is `timebudget-YYYY-MM-DD.timebudget.json`; render `timebudget-YYYY-MM-DD.html` with:

```bash
python3 scripts/validate_portable_plan.py timebudget-YYYY-MM-DD.timebudget.json
python3 scripts/render_interactive_plan.py timebudget-YYYY-MM-DD.timebudget.json timebudget-YYYY-MM-DD.html
```

The renderer validates first. Keep HTML under 1 MiB, self-contained, offline, dependency-free, and safe for `file://`. Render user strings only through escaped fallback text or browser `textContent`.

The page may cache a compatible copy, but exported JSON remains portable truth. Export/clock refresh does not change revision; each accepted mutation changes it once.

Completion sets completed, zero remaining, and completion time; actual/source stay null unless entered. Confirm undo, clear completion, restore/ask remaining, choose `in_progress` if actual exists else `planned`, and increment once.

Expose tasks, reserves, live capacity, defaults, export, confirmed reset, and metadata. No network, credentials, transcripts, or implied sync. Without JavaScript, fallback still shows readable tasks and capacity.
