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
export type McpPermission = "state:read";

export interface ReadToolDefinition {
  name: ReadToolName;
  description: string;
  permission: McpPermission;
  input: z.ZodType;
  exampleInput: Record<string, unknown>;
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

export function isReadToolName(value: string): value is ReadToolName {
  return value in readToolSchemas;
}

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
