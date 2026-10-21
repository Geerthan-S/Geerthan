import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { WorkspaceState } from "@/domain/models";
import {
  mapActivity,
  mapCalendarBlock,
  mapChangeSet,
  mapHabit,
  mapHabitLog,
  mapInboxItem,
  mapProfile,
  mapProject,
  mapSession,
  mapTask,
} from "@/data/supabase/workspace-mappers";

type Row = Record<string, unknown>;

// PostgREST caps every response (1000 rows by default), so unbounded lists are read page by page.
const PAGE_SIZE = 1000;

type PageResult = { data: unknown[] | null; error: unknown };

async function readAllRows(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<PageResult> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await page(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export interface WorkspaceReadOptions {
  activityLimit?: number;
  sessionLimit?: number;
  habitHistoryDays?: number;
}

export async function readWorkspaceState(
  client: SupabaseClient,
  user: Pick<User, "id" | "email">,
  options: WorkspaceReadOptions = {},
): Promise<WorkspaceState> {
  const activityLimit = Math.min(Math.max(options.activityLimit ?? 250, 1), 500);
  const sessionLimit = Math.min(Math.max(options.sessionLimit ?? 100, 1), 250);
  const habitHistoryDays = Math.min(Math.max(options.habitHistoryDays ?? 90, 7), 366);
  const habitStart = new Date(Date.now() - habitHistoryDays * 86400000).toISOString().slice(0, 10);
  const userId = user.id;

  const [profile, projects, tasks, sessions, inbox, activity, changeSets, calendarBlocks, habits, habitLogs] =
    await Promise.all([
      client.from("profiles").select("*").eq("id", userId).single(),
      readAllRows((from, to) =>
        client
          .from("projects")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      readAllRows((from, to) =>
        client
          .from("tasks")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      client
        .from("work_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(sessionLimit),
      readAllRows((from, to) =>
        client
          .from("inbox_items")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      client
        .from("activity_log")
        .select("*")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(activityLimit),
      client
        .from("change_sets")
        .select("*, change_operations(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      readAllRows((from, to) =>
        client
          .from("calendar_blocks")
          .select("*")
          .eq("user_id", userId)
          .order("starts_at", { ascending: true })
          .order("id")
          .range(from, to),
      ),
      client
        .from("habits")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      readAllRows((from, to) =>
        client
          .from("habit_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("log_date", habitStart)
          .order("log_date", { ascending: false })
          .order("id")
          .range(from, to),
      ),
    ]);

  const failure = [
    profile,
    projects,
    tasks,
    sessions,
    inbox,
    activity,
    changeSets,
    calendarBlocks,
    habits,
    habitLogs,
  ].find((result) => result.error)?.error;
  if (failure) throw new Error("Workspace read failed.", { cause: failure });

  return {
    profile: mapProfile(profile.data as Row, user.email ?? ""),
    projects: (projects.data ?? []).map((row) => mapProject(row as Row)),
    tasks: (tasks.data ?? []).map((row) => mapTask(row as Row)),
    sessions: (sessions.data ?? []).map((row) => mapSession(row as Row)),
    inbox: (inbox.data ?? []).map((row) => mapInboxItem(row as Row)),
    activity: (activity.data ?? []).map((row) => mapActivity(row as Row)),
    changeSets: (changeSets.data ?? []).map((row) => mapChangeSet(row as Row)),
    calendarBlocks: (calendarBlocks.data ?? []).map((row) => mapCalendarBlock(row as Row)),
    habits: (habits.data ?? []).map((row) => mapHabit(row as Row)),
    habitLogs: (habitLogs.data ?? []).map((row) => mapHabitLog(row as Row)),
  };
}
