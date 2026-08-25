import { z } from "zod";

const isoDate = z.iso.date();
const projectStatus = z.enum(["active", "paused", "completed"]);
const priority = z.enum(["low", "medium", "high", "critical"]);

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

const calendarRangeInput = z
  .object({ start: isoDate, end: isoDate })
  .strict()
  .superRefine(({ start, end }, context) => {
    const days = daysBetween(start, end);
    if (days < 0) context.addIssue({ code: "custom", path: ["end"], message: "end must be on or after start" });
    if (days > 31) context.addIssue({ code: "custom", path: ["end"], message: "calendar ranges are limited to 31 days" });
  });

const workSessionInput = z
  .object({
    start: isoDate.optional(),
    end: isoDate.optional(),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict()
  .superRefine(({ start, end }, context) => {
    if (!start || !end) return;
    const days = daysBetween(start, end);
    if (days < 0) context.addIssue({ code: "custom", path: ["end"], message: "end must be on or after start" });
    if (days > 92) context.addIssue({ code: "custom", path: ["end"], message: "work-session ranges are limited to 92 days" });
  });

export const readToolSchemas = {
  get_planning_context: z.object({ date: isoDate.optional() }).strict(),
  get_today: z.object({ date: isoDate.optional() }).strict(),
  get_calendar_range: calendarRangeInput,
  get_open_tasks: z
    .object({
      priority: priority.optional(),
      project_id: z.uuid().optional(),
      due_before: isoDate.optional(),
      include_blocked: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(100),
    })
    .strict(),
  get_projects: z.object({ status: projectStatus.optional() }).strict(),
  get_work_sessions: workSessionInput,
  get_habits: z
    .object({ date: isoDate.optional(), days: z.number().int().min(1).max(90).default(7) })
    .strict(),
  get_activity_history: z
    .object({ since: z.iso.datetime({ offset: true }).optional(), limit: z.number().int().min(1).max(100).default(50) })
    .strict(),
  get_week_summary: z.object({ week_start: isoDate.optional() }).strict(),
} as const;

export type ReadToolName = keyof typeof readToolSchemas;
const idempotencyKey = z.string().trim().min(8).max(180).regex(/^[A-Za-z0-9._:-]+$/);
const entityId = z.uuid();
const expectedVersion = z.number().int().positive();
const dateTime = z.iso.datetime({ offset: true });

export const writeToolSchemas = {
  create_task: z.object({
    title: z.string().trim().min(1).max(240),
    priority: priority.default("medium"),
    project_id: entityId.nullable().default(null),
    due_at: dateTime.nullable().default(null),
    estimate_minutes: z.number().int().min(1).max(10080).default(30),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    idempotency_key: idempotencyKey,
  }).strict(),
  update_task: z.object({
    task_id: entityId,
    expected_version: expectedVersion,
    patch: z.object({
      title: z.string().trim().min(1).max(240).optional(),
      priority: priority.optional(),
      project_id: entityId.nullable().optional(),
      due_at: dateTime.nullable().optional(),
      estimate_minutes: z.number().int().min(1).max(10080).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "patch must contain at least one supported field"),
    idempotency_key: idempotencyKey,
  }).strict(),
  complete_task: z.object({ task_id: entityId, expected_version: expectedVersion, idempotency_key: idempotencyKey }).strict(),
  reschedule_task: z.object({ task_id: entityId, expected_version: expectedVersion, starts_at: dateTime, ends_at: dateTime, idempotency_key: idempotencyKey }).strict()
    .refine((value) => Date.parse(value.ends_at) > Date.parse(value.starts_at), { path: ["ends_at"], message: "ends_at must be after starts_at" }),
  start_work_session: z.object({ task_id: entityId, expected_task_version: expectedVersion, idempotency_key: idempotencyKey }).strict(),
  end_work_session: z.object({ session_id: entityId, expected_version: expectedVersion, outcome: z.string().trim().max(1200).default(""), idempotency_key: idempotencyKey }).strict(),
  log_habit: z.object({ habit_id: entityId, date: isoDate, value: z.number().min(0).max(1_000_000), note: z.string().trim().max(500).default(""), expected_log_version: expectedVersion.nullable().default(null), idempotency_key: idempotencyKey }).strict(),
  create_time_block: z.object({ title: z.string().trim().min(1).max(180), kind: z.enum(["meeting", "focus", "personal", "break"]), starts_at: dateTime, ends_at: dateTime, notes: z.string().trim().max(1200).default(""), idempotency_key: idempotencyKey }).strict()
    .refine((value) => Date.parse(value.ends_at) > Date.parse(value.starts_at), { path: ["ends_at"], message: "ends_at must be after starts_at" }),
  update_time_block: z.object({
    time_block_id: entityId,
    expected_version: expectedVersion,
    patch: z.object({
      title: z.string().trim().min(1).max(180).optional(),
      kind: z.enum(["meeting", "focus", "personal", "break"]).optional(),
      starts_at: dateTime.optional(),
      ends_at: dateTime.optional(),
      notes: z.string().trim().max(1200).optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, "patch must contain at least one supported field"),
    idempotency_key: idempotencyKey,
  }).strict(),
  draft_day_plan: z.object({ date: isoDate, include_overdue: z.boolean().default(true), idempotency_key: idempotencyKey }).strict(),
  commit_change_set: z.object({ change_set_id: entityId, idempotency_key: idempotencyKey }).strict(),
  discard_change_set: z.object({ change_set_id: entityId, idempotency_key: idempotencyKey }).strict(),
  undo_change_set: z.object({ change_set_id: entityId, idempotency_key: idempotencyKey }).strict(),
} as const;

export type WriteToolName = keyof typeof writeToolSchemas;
export type McpPermission = "state:read" | "state:write" | "plan:draft" | "plan:commit" | "plan:undo";

export interface ReadToolDefinition {
  name: ReadToolName;
  description: string;
  permission: McpPermission;
  input: z.ZodType;
  exampleInput: Record<string, unknown>;
  endpoint: string;
  method: "POST";
}

export interface WriteToolDefinition {
  name: WriteToolName;
  description: string;
  permission: Exclude<McpPermission, "state:read">;
  input: z.ZodType;
  endpoint: string;
  method: "POST";
}

function tool(name: ReadToolName, description: string, exampleInput: Record<string, unknown> = {}): ReadToolDefinition {
  return {
    name,
    description,
    permission: "state:read",
    input: readToolSchemas[name],
    exampleInput,
    endpoint: `/api/mcp/read/${name}`,
    method: "POST",
  };
}

export const personalOsTools: Record<ReadToolName, ReadToolDefinition> = {
  get_planning_context: tool(
    "get_planning_context",
    "Return the normalized planning snapshot: schedule, free time, task pressure, projects, habits, workload, conflicts, drafts, and tomorrow preview.",
  ),
  get_today: tool("get_today", "Return today's execution view with schedule, tasks, free time, conflicts, and habit check-ins."),
  get_calendar_range: tool("get_calendar_range", "Return scheduled blocks and conflicts for an inclusive date range of at most 31 days.", {
    start: "2026-08-25",
    end: "2026-08-31",
  }),
  get_open_tasks: tool("get_open_tasks", "Return compact open tasks with optional priority, project, due-date, blocked-state, and bounded-result filters."),
  get_projects: tool("get_projects", "Return project status, progress, open-task counts, and tracked work."),
  get_work_sessions: tool("get_work_sessions", "Return recent completed and active work sessions, optionally constrained to a date range."),
  get_habits: tool("get_habits", "Return habit definitions, streaks, consistency, and daily values for a bounded window."),
  get_activity_history: tool("get_activity_history", "Return the authenticated user's compact audit and activity history."),
  get_week_summary: tool("get_week_summary", "Return a normalized weekly execution, scheduling, project, and habit summary."),
};

export const readToolNames = Object.keys(readToolSchemas) as ReadToolName[];
export const writeToolNames = Object.keys(writeToolSchemas) as WriteToolName[];

export function isReadToolName(value: string): value is ReadToolName {
  return value in readToolSchemas;
}

export function isWriteToolName(value: string): value is WriteToolName {
  return value in writeToolSchemas;
}

function writeTool(name: WriteToolName, description: string, permission: WriteToolDefinition["permission"] = "state:write"): WriteToolDefinition {
  return { name, description, permission, input: writeToolSchemas[name], endpoint: `/api/mcp/action/${name}`, method: "POST" };
}

export const personalOsWriteTools: Record<WriteToolName, WriteToolDefinition> = {
  create_task: writeTool("create_task", "Create one validated task for the authenticated user with an idempotency receipt and activity event."),
  update_task: writeTool("update_task", "Update supported task fields after checking the expected record version."),
  complete_task: writeTool("complete_task", "Complete an open task after a stale-write version check."),
  reschedule_task: writeTool("reschedule_task", "Move a task to a conflict-free time range after a stale-write version check."),
  start_work_session: writeTool("start_work_session", "Start one work session for an eligible task when no other session is running."),
  end_work_session: writeTool("end_work_session", "End a running work session and record its outcome after a version check."),
  log_habit: writeTool("log_habit", "Create or update one daily habit check-in with retry and stale-write protection."),
  create_time_block: writeTool("create_time_block", "Create one conflict-free calendar block for the authenticated user."),
  update_time_block: writeTool("update_time_block", "Update a time block after validating ownership, version, fields, and conflicts."),
  draft_day_plan: writeTool("draft_day_plan", "Create a reviewable daily-plan change set without applying its proposed schedule.", "plan:draft"),
  commit_change_set: writeTool("commit_change_set", "Commit an authenticated draft after locking it and checking every expected entity version.", "plan:commit"),
  discard_change_set: writeTool("discard_change_set", "Discard a draft without applying any of its operations.", "plan:commit"),
  undo_change_set: writeTool("undo_change_set", "Reverse supported operations in a committed change set after stale-write checks.", "plan:undo"),
};

export const readToolManifest = readToolNames.map((name) => {
  const definition = personalOsTools[name];
  return {
    name: definition.name,
    description: definition.description,
    permission: definition.permission,
    endpoint: definition.endpoint,
    method: definition.method,
    inputSchema: z.toJSONSchema(definition.input),
    exampleInput: definition.exampleInput,
  };
});

export const writeToolManifest = writeToolNames.map((name) => {
  const definition = personalOsWriteTools[name];
  return {
    name: definition.name,
    description: definition.description,
    permission: definition.permission,
    endpoint: definition.endpoint,
    method: definition.method,
    inputSchema: z.toJSONSchema(definition.input),
  };
});
