# Plan with TimeBudget

Plan what actually fits today. Protect meals, breaks, and uncertainty, then update the plan as real work happens.

Plan with TimeBudget is a lightweight, standalone way to experience capacity-first planning. It remains useful without a hosted service or the future TimeBudget app.

## What the Skill does

The Skill turns a concrete daily window into a visual time budget. It collects task estimates, protects explicit meals and breaks, shows available or overbooked time, and helps re-plan when reality changes. Reported actual time always stays separate from estimates.

After activation it creates both a portable JSON plan and a self-contained interactive HTML page. The model supplies only a small plan draft; a bundled script expands it and injects it into the fixed HTML assets. The page can be opened directly from disk to check off work, add an optional actual duration, hover or focus the time ring for task-level details, manage reusable defaults, and export an updated plan.

## Example output

- A focused task list with a visual ring showing tasks, protected time, and what remains available.
- `timebudget-YYYY-MM-DD.timebudget.json`, the machine-readable source of truth.
- `timebudget-YYYY-MM-DD.html`, an offline interactive view with completion controls, live capacity, defaults, and export.

The HTML file needs no server, account, frontend framework, CDN, or runtime dependency. With JavaScript disabled, it still shows a readable static plan.

## Installation

The [official OpenAI skill documentation](https://developers.openai.com/codex/skills) recommends using `$skill-installer` to install a skill from another repository. In Codex, ask:

```text
Use $skill-installer to install the skill from
https://github.com/SidHung/plan-with-timebudget
```

The repository is public. Codex detects installed skills automatically; restart Codex if it does not appear.

## How to use it

Invoke the Skill with a concrete date or daily planning window, then provide task estimates and any known meals, breaks, or fixed commitments. The Skill checks whether they fit before activation.

```text
Use $plan-with-timebudget to plan today from 9:00 to 18:00.
I need to finish a 2-hour proposal, reply to email for 30 minutes,
and reserve 60 minutes for lunch.
```

Report progress in chat when useful:

```text
I finished the proposal in 140 minutes. Update my plan.
```

Or continue from an exported artifact:

```text
Continue from this TimeBudget plan file.
```

The interactive page can update task completion locally. Export updated JSON before switching browsers, devices, or agent sessions.

## Example prompts

- `Use $plan-with-timebudget to see what fits between 13:00 and 18:00.`
- `I have 90 minutes left and a 15-minute break to protect. Re-plan this TimeBudget file.`
- `Use these TimeBudget defaults to plan tomorrow.`
- `Close this plan and keep unfinished work unresolved.`

## Files the Skill creates

| File | Role |
| --- | --- |
| `timebudget-YYYY-MM-DD.timebudget.json` | Canonical portable plan for validation, export, and later sessions. |
| `timebudget-YYYY-MM-DD.html` | Self-contained offline working view of that plan. |
| `timebudget-defaults.json` | Optional portable planning defaults exported from the page. |

Browser storage may cache a newer working copy for convenience. It is not portable truth: only an exported JSON file can be safely resumed in a different browser or agent session. Exporting without an authoritative change does not increase the plan revision.

## Privacy and local data

Generated HTML contains the initial plan data and runs entirely in the browser. It makes no network requests and includes no analytics, remote fonts, CDN code, credentials, filesystem paths, or chat transcripts. User-authored and imported strings are rendered as inert text.

The Skill does not provide cloud sync, notifications, background monitoring, collaboration, historical analytics, or automatic task-system updates.

## TimeBudget

The future TimeBudget product may add persistence, cross-device history, richer visualization, routines, and integrations. Those capabilities are not part of this standalone Skill.

[Explore TimeBudget](LINK) — placeholder; a public product URL has not been approved yet.

## Development

The package root is directly installable as a Skill. Runtime artifacts use only Python's standard library plus vanilla HTML, CSS, and JavaScript.

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_interactive_plan.mjs
python3 scripts/create_timebudget_plan.py \
  tests/fixtures/minimal-draft.json /tmp/timebudget-plan.json /tmp/timebudget-plan.html \
  --as-of 2026-08-16T09:00:00+08:00
python3 scripts/validate_portable_plan.py tests/fixtures/valid-plan.timebudget.json
python3 scripts/validate_portable_plan.py --defaults tests/fixtures/valid-defaults.json
python3 scripts/render_interactive_plan.py \
  tests/fixtures/valid-plan.timebudget.json /tmp/timebudget-example.html \
  --as-of 2026-08-16T13:40:00+08:00
```

The browser suite uses an installed Google Chrome or Chromium binary; generated plans have zero runtime dependencies.
