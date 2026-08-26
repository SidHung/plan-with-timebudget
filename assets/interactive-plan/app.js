(() => {
  "use strict";

  const MAX_JSON_BYTES = 256 * 1024;
  const PLAN_KEYS = ["format", "schema_version", "revision", "exported_at", "plan", "reserves", "tasks", "snapshot"];
  const PLAN_INNER_KEYS = ["id", "date", "timezone", "start_at", "end_at", "lifecycle_status", "closed_at", "close_reason", "buffer_original_minutes", "buffer_target_minutes"];
  const TASK_KEYS = ["id", "title", "priority", "status", "baseline_estimated_minutes", "estimate_source", "estimate_range_minutes", "actual_minutes", "actual_source", "remaining_estimate_minutes", "not_before_at", "deadline_at", "completed_at", "carried_from_plan_id", "carried_from_task_id"];
  const RESERVE_KEYS = ["id", "type", "title", "minutes", "status", "start_at", "end_at", "remaining_minutes", "actual_minutes", "consumed_at"];
  const SNAPSHOT_KEYS = ["as_of", "total_plan_minutes", "clock_minutes_remaining", "unfinished_estimated_minutes", "pending_reserve_minutes", "raw_slack_minutes", "buffer_target_minutes", "safe_slack_minutes", "capacity_status"];
  const DEFAULT_KEYS = ["format", "schema_version", "timezone", "planning_start", "planning_end", "buffer", "default_break_minutes", "default_task_priority"];
  const PRIORITIES = ["must", "should", "could"];

  const embeddedPlan = JSON.parse(document.getElementById("embedded-plan").textContent);
  const embeddedDefaults = JSON.parse(document.getElementById("embedded-defaults").textContent);
  const planStorageKey = `timebudget-plan:1:${embeddedPlan.plan.id}`;
  const defaultsStorageKey = "timebudget-defaults:1";
  let plan = clone(embeddedPlan);
  let defaults = clone(embeddedDefaults);
  let conflictCopy = null;
  let ringDetailsPinned = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function exactKeys(value, keys) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function wholeMinutes(value) {
    return Number.isInteger(value) && value >= 0 && value <= 1440;
  }

  function safeText(value, maxLength) {
    return typeof value === "string" && value.length >= 1 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
  }

  function validAuditTimestamp(value, nullable = false) {
    if (nullable && value === null) return true;
    return typeof value === "string" && Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  }

  function validMinuteTimestamp(value, nullable = false) {
    if (nullable && value === null) return true;
    return typeof value === "string" && Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  }

  function validTimezone(value) {
    if (!safeText(value, 100) || !/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)+$/.test(value)) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch (_) { return false; }
  }

  function validPlan(candidate) {
    if (!exactKeys(candidate, PLAN_KEYS) || candidate.format !== "timebudget-plan" || candidate.schema_version !== "1.0.0" || !Number.isInteger(candidate.revision) || candidate.revision < 0 || !validAuditTimestamp(candidate.exported_at)) return false;
    const planFields = candidate.plan;
    if (!exactKeys(planFields, PLAN_INNER_KEYS) || !safeText(planFields.id, 128) || !/^\d{4}-\d{2}-\d{2}$/.test(planFields.date) || !validTimezone(planFields.timezone)) return false;
    if (!validMinuteTimestamp(planFields.start_at) || !validMinuteTimestamp(planFields.end_at) || minutesBetween(new Date(planFields.start_at), new Date(planFields.end_at)) <= 0 || minutesBetween(new Date(planFields.start_at), new Date(planFields.end_at)) > 1440) return false;
    if (!["draft", "active", "closed"].includes(planFields.lifecycle_status) || !wholeMinutes(planFields.buffer_original_minutes) || !wholeMinutes(planFields.buffer_target_minutes)) return false;
    if (planFields.lifecycle_status === "closed") {
      if (!validAuditTimestamp(planFields.closed_at) || !["all_resolved", "user_ended", "window_ended"].includes(planFields.close_reason)) return false;
    } else if (planFields.closed_at !== null || planFields.close_reason !== null) return false;
    if (!Array.isArray(candidate.tasks) || candidate.tasks.length > 200 || !Array.isArray(candidate.reserves) || candidate.reserves.length > 50) return false;
    const ids = new Set();
    for (const reserve of candidate.reserves) {
      if (!exactKeys(reserve, RESERVE_KEYS) || !safeText(reserve.id, 128) || ids.has(reserve.id) || !safeText(reserve.title, 200)) return false;
      if (!["meal", "break", "fixed_commitment"].includes(reserve.type) || !wholeMinutes(reserve.minutes) || !wholeMinutes(reserve.remaining_minutes) || !["planned", "in_progress", "consumed", "skipped", "cancelled"].includes(reserve.status)) return false;
      if ((reserve.start_at === null) !== (reserve.end_at === null) || !validMinuteTimestamp(reserve.start_at, true) || !validMinuteTimestamp(reserve.end_at, true)) return false;
      if (reserve.start_at !== null && minutesBetween(new Date(reserve.start_at), new Date(reserve.end_at)) !== reserve.minutes) return false;
      if (reserve.actual_minutes !== null && !wholeMinutes(reserve.actual_minutes)) return false;
      if (["consumed", "skipped", "cancelled"].includes(reserve.status) && reserve.remaining_minutes !== 0) return false;
      if (reserve.status === "consumed" ? !validAuditTimestamp(reserve.consumed_at) : reserve.consumed_at !== null) return false;
      ids.add(reserve.id);
    }
    for (const task of candidate.tasks) {
      if (!exactKeys(task, TASK_KEYS) || !safeText(task.id, 128) || ids.has(task.id) || !safeText(task.title, 200)) return false;
      if (!PRIORITIES.includes(task.priority) || !["planned", "in_progress", "completed", "deferred", "cancelled"].includes(task.status)) return false;
      if (!wholeMinutes(task.baseline_estimated_minutes) || !wholeMinutes(task.remaining_estimate_minutes)) return false;
      if (!["user", "ai_suggested"].includes(task.estimate_source)) return false;
      if (task.estimate_range_minutes !== null) {
        if (task.estimate_source !== "ai_suggested" || !exactKeys(task.estimate_range_minutes, ["min", "max"]) || !wholeMinutes(task.estimate_range_minutes.min) || !wholeMinutes(task.estimate_range_minutes.max) || task.estimate_range_minutes.min > task.estimate_range_minutes.max) return false;
      }
      if (task.actual_minutes !== null && !wholeMinutes(task.actual_minutes)) return false;
      if ((task.actual_minutes === null) !== (task.actual_source === null) || (task.actual_minutes !== null && task.actual_source !== "user_reported")) return false;
      if (!validMinuteTimestamp(task.not_before_at, true) || !validMinuteTimestamp(task.deadline_at, true)) return false;
      if (task.status === "completed" && (task.remaining_estimate_minutes !== 0 || !validAuditTimestamp(task.completed_at))) return false;
      if (task.status !== "completed" && task.completed_at !== null) return false;
      if (["deferred", "cancelled"].includes(task.status) && task.remaining_estimate_minutes !== 0) return false;
      if ((task.carried_from_plan_id === null) !== (task.carried_from_task_id === null)) return false;
      if (task.carried_from_plan_id !== null && (!safeText(task.carried_from_plan_id, 128) || !safeText(task.carried_from_task_id, 128))) return false;
      ids.add(task.id);
    }
    const snapshot = candidate.snapshot;
    if (!exactKeys(snapshot, SNAPSHOT_KEYS) || !validAuditTimestamp(snapshot.as_of) || !wholeMinutes(snapshot.total_plan_minutes) || !wholeMinutes(snapshot.buffer_target_minutes)) return false;
    if (!Number.isInteger(snapshot.unfinished_estimated_minutes) || snapshot.unfinished_estimated_minutes < 0 || !Number.isInteger(snapshot.pending_reserve_minutes) || snapshot.pending_reserve_minutes < 0) return false;
    if (!["not_evaluated", "healthy", "at_risk", "replan_required"].includes(snapshot.capacity_status)) return false;
    for (const key of ["clock_minutes_remaining", "raw_slack_minutes", "safe_slack_minutes"]) if (snapshot[key] !== null && !Number.isInteger(snapshot[key])) return false;
    if (snapshot.capacity_status === "not_evaluated" ? ["clock_minutes_remaining", "raw_slack_minutes", "safe_slack_minutes"].some((key) => snapshot[key] !== null) : ["clock_minutes_remaining", "raw_slack_minutes", "safe_slack_minutes"].some((key) => snapshot[key] === null)) return false;
    return true;
  }

  function validDefaults(candidate) {
    if (!exactKeys(candidate, DEFAULT_KEYS) || candidate.format !== "timebudget-defaults" || candidate.schema_version !== "1.0.0") return false;
    if (candidate.timezone !== null) {
      if (!validTimezone(candidate.timezone)) return false;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.planning_start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.planning_end)) return false;
    if (!exactKeys(candidate.buffer, ["mode", "minutes"]) || !["recommended", "fixed"].includes(candidate.buffer.mode)) return false;
    if (candidate.buffer.mode === "recommended" && candidate.buffer.minutes !== null) return false;
    if (candidate.buffer.mode === "fixed" && !wholeMinutes(candidate.buffer.minutes)) return false;
    return wholeMinutes(candidate.default_break_minutes) && PRIORITIES.includes(candidate.default_task_priority);
  }

  function authoritativeFingerprint(value) {
    return JSON.stringify({
      format: value.format,
      schema_version: value.schema_version,
      revision: value.revision,
      plan: value.plan,
      reserves: value.reserves,
      tasks: value.tasks,
    });
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function loadWorkingState() {
    const cachedRaw = storageGet(planStorageKey);
    if (cachedRaw) {
      try {
        const cached = parseJsonStrict(cachedRaw);
        if (validPlan(cached) && cached.plan.id === embeddedPlan.plan.id) {
          if (cached.revision > embeddedPlan.revision) plan = cached;
          else if (cached.revision === embeddedPlan.revision && authoritativeFingerprint(cached) !== authoritativeFingerprint(embeddedPlan)) conflictCopy = cached;
        }
      } catch (_) { /* Ignore incompatible or corrupted cache. */ }
    }
    const defaultsRaw = storageGet(defaultsStorageKey);
    if (defaultsRaw) {
      try {
        const cachedDefaults = parseJsonStrict(defaultsRaw);
        if (validDefaults(cachedDefaults)) defaults = cachedDefaults;
      } catch (_) { /* Ignore incompatible or corrupted defaults. */ }
    }
  }

  function parseJsonStrict(text) {
    if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new Error("JSON file exceeds 256 KiB");
    let index = 0;
    const whitespace = () => { while (/\s/.test(text[index] || "")) index += 1; };
    const parseString = () => {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < text.length) {
        const char = text[index++];
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') return JSON.parse(text.slice(start, index));
        else if (char.charCodeAt(0) < 0x20) throw new Error("Control character in JSON string");
      }
      throw new Error("Unterminated JSON string");
    };
    const parseValue = () => {
      whitespace();
      const char = text[index];
      if (char === '"') return parseString();
      if (char === "{") {
        index += 1;
        const object = {};
        const keys = new Set();
        whitespace();
        if (text[index] === "}") { index += 1; return object; }
        while (index < text.length) {
          whitespace();
          if (text[index] !== '"') throw new Error("Expected an object key");
          const key = parseString();
          if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key}`);
          keys.add(key);
          whitespace();
          if (text[index++] !== ":") throw new Error("Expected a colon");
          object[key] = parseValue();
          whitespace();
          const separator = text[index++];
          if (separator === "}") return object;
          if (separator !== ",") throw new Error("Expected a comma");
        }
      }
      if (char === "[") {
        index += 1;
        const array = [];
        whitespace();
        if (text[index] === "]") { index += 1; return array; }
        while (index < text.length) {
          array.push(parseValue());
          whitespace();
          const separator = text[index++];
          if (separator === "]") return array;
          if (separator !== ",") throw new Error("Expected a comma");
        }
      }
      const rest = text.slice(index);
      for (const [token, value] of [["true", true], ["false", false], ["null", null]]) {
        if (rest.startsWith(token)) { index += token.length; return value; }
      }
      const number = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (number) {
        index += number[0].length;
        const value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error("Non-finite JSON number");
        return value;
      }
      throw new Error("Invalid JSON value");
    };
    const value = parseValue();
    whitespace();
    if (index !== text.length) throw new Error("Unexpected trailing JSON data");
    return value;
  }

  function minutesBetween(start, end) {
    return Math.floor((end.getTime() - start.getTime()) / 60000);
  }

  function calculateSnapshot(current, now = new Date()) {
    const start = new Date(current.plan.start_at);
    const end = new Date(current.plan.end_at);
    const total = minutesBetween(start, end);
    const unfinished = current.tasks.filter((task) => ["planned", "in_progress"].includes(task.status)).reduce((sum, task) => sum + task.remaining_estimate_minutes, 0);
    let pending = 0;
    let unresolvedReserve = false;
    for (const reserve of current.reserves) {
      if (["consumed", "skipped", "cancelled"].includes(reserve.status)) continue;
      if (reserve.status === "in_progress" && reserve.end_at !== null) {
        pending += Math.max(0, minutesBetween(now, new Date(reserve.end_at)));
      } else if (reserve.status === "planned" && reserve.start_at !== null) {
        if (new Date(reserve.start_at) <= now) unresolvedReserve = true;
        else pending += reserve.remaining_minutes;
      } else {
        pending += reserve.remaining_minutes;
      }
    }
    const evaluated = current.plan.lifecycle_status !== "closed" && !(current.plan.lifecycle_status === "active" && now >= end) && !unresolvedReserve;
    let clock = null;
    let raw = null;
    let safe = null;
    let status = "not_evaluated";
    if (evaluated) {
      clock = Math.max(0, minutesBetween(new Date(Math.max(now.getTime(), start.getTime())), end));
      raw = clock - unfinished - pending;
      safe = raw - current.plan.buffer_target_minutes;
      status = raw < 0 ? "replan_required" : raw < current.plan.buffer_target_minutes ? "at_risk" : "healthy";

      const currentTime = new Date(Math.max(now.getTime(), start.getTime()));
      const constrained = current.tasks.filter((task) => ["planned", "in_progress"].includes(task.status) && task.deadline_at !== null && task.not_before_at === null);
      const deadlines = [...new Set(constrained.map((task) => Math.min(new Date(task.deadline_at).getTime(), end.getTime())))].sort((a, b) => a - b);
      for (const deadlineMs of deadlines) {
        const deadline = new Date(deadlineMs);
        const taskDemand = constrained.filter((task) => Math.min(new Date(task.deadline_at).getTime(), end.getTime()) <= deadlineMs).reduce((sum, task) => sum + task.remaining_estimate_minutes, 0);
        let reserveDemand = 0;
        for (const reserve of current.reserves) {
          if (!["planned", "in_progress"].includes(reserve.status) || reserve.start_at === null) continue;
          const overlapStart = new Date(Math.max(currentTime.getTime(), new Date(reserve.start_at).getTime()));
          const overlapEnd = new Date(Math.min(deadlineMs, new Date(reserve.end_at).getTime()));
          reserveDemand += Math.max(0, minutesBetween(overlapStart, overlapEnd));
        }
        if (taskDemand + reserveDemand > Math.max(0, minutesBetween(currentTime, deadline))) { status = "replan_required"; break; }
      }
    }
    return {
      as_of: now.toISOString(),
      total_plan_minutes: total,
      clock_minutes_remaining: clock,
      unfinished_estimated_minutes: unfinished,
      pending_reserve_minutes: pending,
      raw_slack_minutes: raw,
      buffer_target_minutes: current.plan.buffer_target_minutes,
      safe_slack_minutes: safe,
      capacity_status: status,
    };
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function replaceChildren(target, children) {
    target.replaceChildren(...children);
  }

  function formatDuration(value) {
    if (value === null) return "—";
    const absolute = Math.abs(value);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
  }

  function formatWindow() {
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: plan.plan.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return `${formatter.format(new Date(plan.plan.start_at))}–${formatter.format(new Date(plan.plan.end_at))} · ${plan.plan.timezone}`;
  }

  function formatPlanTime(value) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: plan.plan.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  }

  function announce(message) {
    const live = document.getElementById("live-region");
    live.textContent = "";
    window.setTimeout(() => { live.textContent = message; }, 20);
  }

  function planDateAtNoon(dayOffset = 0) {
    const [year, month, day] = plan.plan.date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayOffset, 12));
  }

  function renderHeader() {
    const date = planDateAtNoon();
    document.getElementById("plan-date-label").textContent = new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(date);
    document.getElementById("plan-window").textContent = formatWindow();
    const week = document.getElementById("week-strip");
    const weekday = date.getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const dayFormatter = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
    week.replaceChildren();
    for (let index = 0; index < 7; index += 1) {
      const offset = mondayOffset + index;
      const current = planDateAtNoon(offset);
      const item = element("li", `week-day ${offset === 0 ? "active" : ""}`.trim());
      item.append(element("span", "", dayFormatter.format(current)), element("strong", "", String(current.getUTCDate())));
      if (offset === 0) item.setAttribute("aria-current", "date");
      week.appendChild(item);
    }
  }

  function detailItem(title, minutes) {
    const item = element("li", "");
    item.append(element("span", "", title), element("strong", "", formatDuration(minutes)));
    return item;
  }

  function renderRingDetails(snapshot, elapsed, raw) {
    document.getElementById("ring-elapsed").textContent = elapsed === null ? "—" : formatDuration(elapsed);
    document.getElementById("ring-available").textContent = raw === null ? "—" : raw < 0 ? `Over by ${formatDuration(raw)}` : formatDuration(raw);

    const activeTasks = plan.tasks.filter((task) => ["planned", "in_progress"].includes(task.status));
    const taskItems = activeTasks.map((task) => detailItem(task.title, task.remaining_estimate_minutes));
    if (!taskItems.length) taskItems.push(element("li", "", "No unfinished tasks"));
    replaceChildren(document.getElementById("ring-task-details"), taskItems);

    const activeReserves = plan.reserves.filter((reserve) => ["planned", "in_progress"].includes(reserve.status));
    const reserveItems = activeReserves.map((reserve) => detailItem(reserve.title, reserve.remaining_minutes));
    if (!reserveItems.length) reserveItems.push(element("li", "", "No protected time remaining"));
    replaceChildren(document.getElementById("ring-reserve-details"), reserveItems);
  }

  function setRingDetailsOpen(open) {
    const ring = document.getElementById("time-ring");
    document.getElementById("ring-details").hidden = !open;
    ring.setAttribute("aria-expanded", String(open));
  }

  function renderOverview() {
    const snapshot = plan.snapshot;
    const ring = document.getElementById("time-ring");
    const label = document.getElementById("availability-label");
    const value = document.getElementById("availability-value");
    const detail = document.getElementById("availability-detail");
    const raw = snapshot.raw_slack_minutes;
    const evaluated = raw !== null && snapshot.clock_minutes_remaining !== null;
    ring.classList.toggle("overbooked", evaluated && raw < 0);

    if (!evaluated) {
      label.textContent = "Plan status";
      value.textContent = plan.plan.lifecycle_status === "closed" ? "Finished" : "Update needed";
      detail.textContent = plan.plan.lifecycle_status === "closed" ? "This plan is closed" : "Review elapsed protected time";
      ring.style.setProperty("--ring", "conic-gradient(var(--elapsed) 0 100%)");
      ring.setAttribute("aria-label", `${value.textContent}. ${detail.textContent}. Open for time details.`);
      renderRingDetails(snapshot, null, raw);
      return;
    }

    if (raw < 0) {
      label.textContent = "Over by";
      value.textContent = formatDuration(raw);
      detail.textContent = "Reduce work or extend the plan";
    } else if (raw === 0) {
      label.textContent = "Fully planned";
      value.textContent = "0m";
      detail.textContent = "No unallocated time remains";
    } else {
      label.textContent = "Available";
      value.textContent = formatDuration(raw);
      detail.textContent = "After tasks and protected time";
    }

    const total = Math.max(1, snapshot.total_plan_minutes);
    const elapsed = Math.max(0, total - snapshot.clock_minutes_remaining);
    const remainingArc = Math.max(0, total - Math.min(total, elapsed));
    const work = Math.min(snapshot.unfinished_estimated_minutes, remainingArc);
    const protectedMinutes = Math.min(snapshot.pending_reserve_minutes, Math.max(0, remainingArc - work));
    const open = Math.max(0, remainingArc - work - protectedMinutes);
    const elapsedEnd = (Math.min(total, elapsed) / total) * 100;
    const workEnd = elapsedEnd + (work / total) * 100;
    const protectedEnd = workEnd + (protectedMinutes / total) * 100;
    const openEnd = protectedEnd + (open / total) * 100;
    ring.style.setProperty("--ring", `conic-gradient(var(--elapsed) 0 ${elapsedEnd}%, var(--task) ${elapsedEnd}% ${workEnd}%, var(--protected) ${workEnd}% ${protectedEnd}%, var(--open) ${protectedEnd}% ${openEnd}%, var(--elapsed) ${openEnd}% 100%)`);
    ring.setAttribute("aria-label", `${label.textContent}: ${value.textContent}. Tasks ${formatDuration(snapshot.unfinished_estimated_minutes)}, protected time ${formatDuration(snapshot.pending_reserve_minutes)}. Open for details.`);
    renderRingDetails(snapshot, elapsed, raw);
  }

  function taskMeta(task) {
    const values = [
      `Estimate ${task.baseline_estimated_minutes} min`,
      `Remaining ${task.remaining_estimate_minutes} min`,
      task.actual_minutes === null ? "Actual not reported" : `Actual ${task.actual_minutes} min`,
    ];
    if (task.actual_minutes !== null) {
      const variance = task.actual_minutes - task.baseline_estimated_minutes;
      values.push(`${variance >= 0 ? "+" : "−"}${Math.abs(variance)} min vs estimate`);
    }
    return values;
  }

  function handleTaskToggle(task, checkbox, actualInput) {
    if (checkbox.checked) {
      const raw = actualInput.value.trim();
      const actual = raw === "" ? null : Number(raw);
      if (actual !== null && !wholeMinutes(actual)) {
        window.alert("Actual duration must be a whole number from 0 to 1440 minutes.");
        checkbox.checked = false;
        actualInput.focus();
        return;
      }
      task.status = "completed";
      task.remaining_estimate_minutes = 0;
      task.completed_at = new Date().toISOString();
      task.actual_minutes = actual;
      task.actual_source = actual === null ? null : "user_reported";
      plan.revision += 1;
      savePlanCache();
      render();
      announce(`${task.title} completed. Plan revision ${plan.revision}.`);
      return;
    }

    if (!window.confirm(`Undo completion for “${task.title}”?`)) {
      checkbox.checked = true;
      return;
    }
    const suggested = String(task.baseline_estimated_minutes);
    const response = window.prompt("Remaining estimate in whole minutes:", suggested);
    if (response === null) { checkbox.checked = true; return; }
    const remaining = Number(response.trim());
    if (!wholeMinutes(remaining)) {
      window.alert("Remaining estimate must be a whole number from 0 to 1440 minutes.");
      checkbox.checked = true;
      return;
    }
    task.status = task.actual_minutes === null ? "planned" : "in_progress";
    task.remaining_estimate_minutes = remaining;
    task.completed_at = null;
    plan.revision += 1;
    savePlanCache();
    render();
    announce(`${task.title} completion undone. Plan revision ${plan.revision}.`);
  }

  function taskCard(task) {
    const card = element("article", `task-card ${task.status === "completed" ? "completed" : ""}`);
    card.dataset.taskId = task.id;
    const completionLabel = element("label", "completion-control");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.status === "completed";
    checkbox.disabled = ["deferred", "cancelled"].includes(task.status);
    checkbox.setAttribute("aria-label", `Mark ${task.title} complete`);
    completionLabel.appendChild(checkbox);

    const body = element("div", "task-body");
    body.appendChild(element("p", "task-title", task.title));
    const meta = element("div", "task-meta");
    for (const value of taskMeta(task)) {
      const item = element("span", "", value);
      if (value.includes("vs estimate")) item.className = value.startsWith("+") ? "variance-positive" : "variance-negative";
      meta.appendChild(item);
    }
    body.appendChild(meta);

    const actualLabel = element("label", "actual-field");
    actualLabel.appendChild(document.createTextNode("Total actual minutes (optional)"));
    const actualInput = document.createElement("input");
    actualInput.type = "number";
    actualInput.min = "0";
    actualInput.max = "1440";
    actualInput.step = "1";
    actualInput.inputMode = "numeric";
    actualInput.value = task.actual_minutes === null ? "" : String(task.actual_minutes);
    actualInput.disabled = task.status === "completed" || ["deferred", "cancelled"].includes(task.status);
    actualInput.setAttribute("aria-label", `Total actual minutes for ${task.title}`);
    actualLabel.appendChild(actualInput);
    checkbox.addEventListener("change", () => handleTaskToggle(task, checkbox, actualInput));
    card.append(completionLabel, body, actualLabel);
    return card;
  }

  function renderTasks() {
    const cards = plan.tasks.map(taskCard);
    if (!cards.length) cards.push(element("p", "empty-state", "No tasks in this plan."));
    replaceChildren(document.getElementById("task-groups"), cards);
    const completed = plan.tasks.filter((task) => task.status === "completed").length;
    document.getElementById("task-summary").textContent = `${completed} of ${plan.tasks.length} complete`;
  }

  function renderReserves() {
    const cards = plan.reserves.map((reserve) => {
      const card = element("article", "reserve-card");
      card.append(
        element("strong", "", reserve.title),
        element("p", "", `${reserve.type.replaceAll("_", " ")} · ${reserve.remaining_minutes} min remaining`),
      );
      if (reserve.start_at !== null) card.appendChild(element("p", "reserve-time", `${formatPlanTime(reserve.start_at)}–${formatPlanTime(reserve.end_at)}`));
      return card;
    });
    if (!cards.length) cards.push(element("p", "empty-state", "No explicit reserves in this plan."));
    replaceChildren(document.getElementById("reserves-list"), cards);
  }

  function appendDefinition(list, term, description) {
    list.append(element("dt", "", term), element("dd", "", description));
  }

  function renderSettings() {
    const current = document.getElementById("current-settings");
    current.replaceChildren();
    appendDefinition(current, "Timezone", plan.plan.timezone);
    appendDefinition(current, "Window", formatWindow());

    document.getElementById("default-start").value = defaults.planning_start;
    document.getElementById("default-end").value = defaults.planning_end;
    document.getElementById("save-timezone").checked = defaults.timezone !== null;
    document.getElementById("default-timezone").value = defaults.timezone || plan.plan.timezone;
    document.getElementById("default-timezone").disabled = defaults.timezone === null;
    document.getElementById("default-break").value = String(defaults.default_break_minutes);
  }

  function readDefaultsForm() {
    const saveTimezone = document.getElementById("save-timezone").checked;
    const result = {
      format: "timebudget-defaults",
      schema_version: "1.0.0",
      timezone: saveTimezone ? document.getElementById("default-timezone").value.trim() : null,
      planning_start: document.getElementById("default-start").value,
      planning_end: document.getElementById("default-end").value,
      buffer: clone(defaults.buffer),
      default_break_minutes: Number(document.getElementById("default-break").value),
      default_task_priority: defaults.default_task_priority,
    };
    if (!validDefaults(result)) throw new Error("Check the defaults fields. Times use HH:MM and minute values must be whole numbers from 0 to 1440.");
    return result;
  }

  function renderAdvanced() {
    const meta = document.getElementById("advanced-meta");
    meta.replaceChildren();
    appendDefinition(meta, "Plan ID", plan.plan.id);
    appendDefinition(meta, "Revision", String(plan.revision));
    appendDefinition(meta, "Lifecycle", plan.plan.lifecycle_status);
    appendDefinition(meta, "Schema", plan.schema_version);
    document.getElementById("raw-json").textContent = JSON.stringify(plan, null, 2);
  }

  function renderConflict() {
    document.getElementById("conflict-panel").hidden = conflictCopy === null;
  }

  function render() {
    plan.snapshot = calculateSnapshot(plan);
    renderHeader();
    renderOverview();
    renderTasks();
    renderReserves();
    renderSettings();
    renderAdvanced();
    renderConflict();
  }

  function savePlanCache() {
    storageSet(planStorageKey, JSON.stringify(plan));
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.getElementById("defaults-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      defaults = readDefaultsForm();
      storageSet(defaultsStorageKey, JSON.stringify(defaults));
      renderSettings();
      announce("Reusable defaults saved in this browser. Export them to use elsewhere.");
    } catch (error) { window.alert(error.message); }
  });

  document.getElementById("save-timezone").addEventListener("change", (event) => {
    document.getElementById("default-timezone").disabled = !event.target.checked;
  });
  const timeRing = document.getElementById("time-ring");
  timeRing.addEventListener("mouseenter", () => setRingDetailsOpen(true));
  timeRing.addEventListener("mouseleave", () => { if (!ringDetailsPinned) setRingDetailsOpen(false); });
  timeRing.addEventListener("focus", () => setRingDetailsOpen(true));
  timeRing.addEventListener("blur", () => { if (!ringDetailsPinned) setRingDetailsOpen(false); });
  timeRing.addEventListener("click", () => {
    ringDetailsPinned = !ringDetailsPinned;
    setRingDetailsOpen(ringDetailsPinned);
  });
  timeRing.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      ringDetailsPinned = !ringDetailsPinned;
      setRingDetailsOpen(ringDetailsPinned);
    } else if (event.key === "Escape") {
      ringDetailsPinned = false;
      setRingDetailsOpen(false);
    }
  });
  document.getElementById("export-defaults").addEventListener("click", () => {
    try {
      defaults = readDefaultsForm();
      storageSet(defaultsStorageKey, JSON.stringify(defaults));
      downloadJson("timebudget-defaults.json", defaults);
      announce("TimeBudget defaults exported.");
    } catch (error) { window.alert(error.message); }
  });
  document.getElementById("import-defaults").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_JSON_BYTES) throw new Error("Defaults file exceeds 256 KiB.");
      const imported = parseJsonStrict(await file.text());
      if (!validDefaults(imported)) throw new Error("Defaults file does not match TimeBudget defaults 1.0.0.");
      defaults = imported;
      storageSet(defaultsStorageKey, JSON.stringify(defaults));
      renderSettings();
      announce("TimeBudget defaults imported.");
    } catch (error) { window.alert(error.message); }
    event.target.value = "";
  });

  document.getElementById("export-plan").addEventListener("click", () => {
    plan.snapshot = calculateSnapshot(plan);
    plan.exported_at = new Date().toISOString();
    savePlanCache();
    downloadJson(`timebudget-${plan.plan.date}.timebudget.json`, plan);
    renderAdvanced();
    announce(`Plan revision ${plan.revision} exported. Exporting did not change the revision.`);
  });
  document.getElementById("reset-plan").addEventListener("click", () => {
    if (!window.confirm("Reset this browser working copy to the plan embedded in the page?")) return;
    plan = clone(embeddedPlan);
    conflictCopy = null;
    savePlanCache();
    render();
    announce(`Working copy reset to embedded revision ${plan.revision}.`);
  });
  document.getElementById("choose-embedded").addEventListener("click", () => {
    plan = clone(embeddedPlan);
    conflictCopy = null;
    savePlanCache();
    render();
    announce("Embedded plan selected.");
  });
  document.getElementById("choose-cached").addEventListener("click", () => {
    plan = clone(conflictCopy);
    conflictCopy = null;
    savePlanCache();
    render();
    announce("Cached plan selected.");
  });

  loadWorkingState();
  render();
  window.setInterval(render, 60000);
})();
