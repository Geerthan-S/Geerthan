import type {
  ActivityEvent,
  CalendarBlock,
  ChangeOperation,
  ChangeSet,
  InboxItem,
  Habit,
  HabitLog,
  Project,
  Task,
  WorkSession,
  WorkspaceProfile,
} from "@/domain/models";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

export function mapProfile(row: Row, email: string): WorkspaceProfile {
  return {
    id: text(row.id),
    name: text(row.display_name, "Personal OS user"),
    email,
    timezone: text(row.timezone, "Asia/Kolkata"),
    focusTargetMinutes: numberValue(row.focus_target_minutes, 300),
  };
}

export function mapProject(row: Row): Project {
  return {
    id: text(row.id),
    version: numberValue(row.version, 1),
    name: text(row.name),
    code: text(row.code),
    description: text(row.description),
    client: text(row.client_name),
    status: text(row.status, "active") as Project["status"],
    health: text(row.health, "on_track") as Project["health"],
    progress: numberValue(row.progress),
    deadline: text(row.deadline, new Date().toISOString()),
    nextMilestone: text(row.next_milestone),
    accent: text(row.accent, "blue") as Project["accent"],
  };
}

export function mapTask(row: Row): Task {
  const source = text(row.source, "web");
  return {
    id: text(row.id),
    version: numberValue(row.version, 1),
    title: text(row.title),
    projectId: nullableText(row.project_id),
    status: text(row.status, "planned") as Task["status"],
    priority: text(row.priority, "medium") as Task["priority"],
    dueAt: nullableText(row.due_at),
    scheduledStart: nullableText(row.scheduled_start),
    scheduledEnd: nullableText(row.scheduled_end),
    estimateMinutes: numberValue(row.estimate_minutes, 30),
    completedAt: nullableText(row.completed_at),
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    createdAt: text(row.created_at),
    source: source === "web" ? "manual" : source === "api" || source === "mcp" ? "integration" : "plan",
  };
}

export function mapSession(row: Row): WorkSession {
  return {
    id: text(row.id),
    version: numberValue(row.version, 1),
    taskId: nullableText(row.task_id),
    projectId: nullableText(row.project_id),
    startedAt: text(row.started_at),
    endedAt: nullableText(row.ended_at),
    durationMinutes: numberValue(row.duration_minutes),
    status: text(row.status, "completed") as WorkSession["status"],
    outcome: nullableText(row.outcome),
  };
}

export function mapInboxItem(row: Row): InboxItem {
  return {
    id: text(row.id),
    title: text(row.title),
    note: text(row.note),
    createdAt: text(row.created_at),
    triaged: Boolean(row.triaged),
  };
}

export function mapActivity(row: Row): ActivityEvent {
  const knownTypes: ActivityEvent["type"][] = [
    "task_created",
    "task_updated",
    "task_completed",
    "task_reopened",
    "session_started",
    "session_completed",
    "capture_added",
    "changeset_created",
    "changeset_committed",
    "changeset_discarded",
    "task_scheduled",
    "calendar_block_created",
    "calendar_block_updated",
    "changeset_reversed",
    "habit_checked_in",
  ];
  const eventType = text(row.event_type);
  return {
    id: text(row.id),
    type: knownTypes.includes(eventType as ActivityEvent["type"])
      ? (eventType as ActivityEvent["type"])
      : "changeset_committed",
    summary: text(row.summary),
    detail: text(row.detail),
    occurredAt: text(row.occurred_at),
    actor:
      text(row.actor_type) === "chatgpt"
        ? "ChatGPT"
        : text(row.actor_type) === "system"
          ? "Personal OS"
          : "You",
    source: text(row.source, "web") as ActivityEvent["source"],
    undoable: Boolean(row.reversible) && !row.reversed_at,
  };
}

function mapOperation(row: Row): ChangeOperation {
  return {
    id: text(row.id),
    entity: text(row.entity_type, "task") as ChangeOperation["entity"],
    action: text(row.action, "update") as ChangeOperation["action"],
    entityId: nullableText(row.entity_id),
    summary: text(row.summary),
    before:
      row.before_state && typeof row.before_state === "object"
        ? (row.before_state as Record<string, unknown>)
        : null,
    after:
      row.after_state && typeof row.after_state === "object"
        ? (row.after_state as Record<string, unknown>)
        : {},
  };
}

export function mapChangeSet(row: Row): ChangeSet {
  const operations = Array.isArray(row.change_operations)
    ? row.change_operations
        .filter((value): value is Row => Boolean(value) && typeof value === "object")
        .sort((a, b) => numberValue(a.sequence) - numberValue(b.sequence))
        .map(mapOperation)
    : [];
  return {
    id: text(row.id),
    title: text(row.title),
    rationale: text(row.rationale),
    status: text(row.status, "draft") as ChangeSet["status"],
    createdAt: text(row.created_at),
    committedAt: nullableText(row.committed_at),
    createdBy: text(row.created_by) === "ChatGPT" ? "ChatGPT" : "You",
    kind: text(row.kind, "general") as NonNullable<ChangeSet["kind"]>,
    planDate: nullableText(row.plan_date),
    operations,
  };
}

export function mapCalendarBlock(row: Row): CalendarBlock {
  return {
    id: text(row.id),
    version: numberValue(row.version, 1),
    title: text(row.title),
    kind: text(row.kind, "focus") as CalendarBlock["kind"],
    startsAt: text(row.starts_at),
    endsAt: text(row.ends_at),
    notes: text(row.notes),
    source: text(row.source, "web") as CalendarBlock["source"],
  };
}

export function mapHabit(row: Row): Habit {
  return {
    id: text(row.id),
    version: numberValue(row.version, 1),
    name: text(row.name),
    description: text(row.description),
    metric: text(row.metric, "boolean") as Habit["metric"],
    targetValue: numberValue(row.target_value, 1),
    unit: text(row.unit),
    accent: text(row.accent, "blue") as Habit["accent"],
    active: Boolean(row.active),
    sortOrder: numberValue(row.sort_order),
  };
}

export function mapHabitLog(row: Row): HabitLog {
  return {
    id: text(row.id),
    version: numberValue(row.version, 1),
    habitId: text(row.habit_id),
    date: text(row.log_date),
    value: numberValue(row.value),
    note: text(row.note),
  };
}
