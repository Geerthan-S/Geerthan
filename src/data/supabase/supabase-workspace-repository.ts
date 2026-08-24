"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarBlockKind, Task, WorkspaceState } from "@/domain/models";
import type { WorkspaceRepository } from "@/data/repositories/workspace-repository";
import {
  mapActivity,
  mapCalendarBlock,
  mapChangeSet,
  mapInboxItem,
  mapHabit,
  mapHabitLog,
  mapProfile,
  mapProject,
  mapSession,
  mapTask,
} from "@/data/supabase/workspace-mappers";

export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  readonly kind = "supabase" as const;

  constructor(private readonly client: SupabaseClient) {}

  private async runRpc(name: string, parameters: Record<string, unknown> = {}) {
    const { error } = await this.client.rpc(name, parameters);
    if (error) throw new Error(error.message);
    return this.load();
  }

  async load(): Promise<WorkspaceState> {
    const { data: authData, error: authError } = await this.client.auth.getUser();
    if (authError || !authData.user) {
      throw new Error("Your Supabase session is not authenticated.");
    }
    const userId = authData.user.id;
    const { error: initializeError } = await this.client.rpc("initialize_phase_2_workspace");
    if (initializeError && initializeError.code !== "PGRST202") throw new Error(initializeError.message);
    const [profile, projects, tasks, sessions, inbox, activity, changeSets, calendarBlocks, habits, habitLogs] =
      await Promise.all([
        this.client.from("profiles").select("*").eq("id", userId).single(),
        this.client
          .from("projects")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        this.client
          .from("tasks")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        this.client
          .from("work_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("started_at", { ascending: false })
          .limit(100),
        this.client
          .from("inbox_items")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        this.client
          .from("activity_log")
          .select("*")
          .eq("user_id", userId)
          .order("occurred_at", { ascending: false })
          .limit(250),
        this.client
          .from("change_sets")
          .select("*, change_operations(*)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        this.client
          .from("calendar_blocks")
          .select("*")
          .eq("user_id", userId)
          .order("starts_at", { ascending: true }),
        this.client
          .from("habits")
          .select("*")
          .eq("user_id", userId)
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        this.client
          .from("habit_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("log_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
          .order("log_date", { ascending: false }),
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
    if (failure) throw new Error(failure.message);

    return {
      profile: mapProfile(
        profile.data as Record<string, unknown>,
        authData.user.email ?? "",
      ),
      projects: (projects.data ?? []).map((row) =>
        mapProject(row as Record<string, unknown>),
      ),
      tasks: (tasks.data ?? []).map((row) =>
        mapTask(row as Record<string, unknown>),
      ),
      sessions: (sessions.data ?? []).map((row) =>
        mapSession(row as Record<string, unknown>),
      ),
      inbox: (inbox.data ?? []).map((row) =>
        mapInboxItem(row as Record<string, unknown>),
      ),
      activity: (activity.data ?? []).map((row) =>
        mapActivity(row as Record<string, unknown>),
      ),
      changeSets: (changeSets.data ?? []).map((row) =>
        mapChangeSet(row as Record<string, unknown>),
      ),
      calendarBlocks: (calendarBlocks.data ?? []).map((row) =>
        mapCalendarBlock(row as Record<string, unknown>),
      ),
      habits: (habits.data ?? []).map((row) => mapHabit(row as Record<string, unknown>)),
      habitLogs: (habitLogs.data ?? []).map((row) => mapHabitLog(row as Record<string, unknown>)),
    };
  }

  toggleTask(taskId: string) {
    return this.runRpc("toggle_task", { target_task: taskId });
  }

  createTask(input: Pick<Task, "title" | "priority" | "projectId" | "dueAt">) {
    return this.runRpc("create_task_with_activity", {
      task_title: input.title,
      task_priority: input.priority,
      task_project_id: input.projectId,
      task_due_at: input.dueAt,
    });
  }

  addCapture(title: string, note = "") {
    return this.runRpc("add_inbox_item_with_activity", {
      item_title: title,
      item_note: note,
    });
  }

  promoteCapture(captureId: string) {
    return this.runRpc("promote_inbox_item", { target_item: captureId });
  }

  startSession(taskId: string) {
    return this.runRpc("start_work_session", { target_task: taskId });
  }

  stopSession(outcome = "") {
    return this.runRpc("stop_work_session", { session_outcome: outcome });
  }

  commitChangeSet(changeSetId: string) {
    return this.runRpc("commit_task_change_set", {
      target_change_set: changeSetId,
    });
  }

  discardChangeSet(changeSetId: string) {
    return this.runRpc("discard_change_set", {
      target_change_set: changeSetId,
    });
  }

  scheduleTask(taskId: string, startsAt: string, endsAt: string) {
    return this.runRpc("schedule_task", { target_task: taskId, task_start: startsAt, task_end: endsAt });
  }

  createCalendarBlock(input: { title: string; kind: CalendarBlockKind; startsAt: string; endsAt: string; notes?: string }) {
    return this.runRpc("create_calendar_block_with_activity", { block_title: input.title, block_kind: input.kind, block_start: input.startsAt, block_end: input.endsAt, block_notes: input.notes ?? "" });
  }

  checkInHabit(habitId: string, date: string, value: number, note = "") {
    return this.runRpc("upsert_habit_checkin", { target_habit: habitId, target_date: date, checkin_value: value, checkin_note: note });
  }

  generateDailyPlan(date: string) {
    return this.runRpc("generate_daily_plan_draft", { target_date: date, include_overdue: true });
  }

  rescheduleUnfinished(date: string) {
    return this.runRpc("draft_unfinished_reschedule", { target_date: date });
  }

  async reset(): Promise<WorkspaceState> {
    throw new Error("Reset is available only in local preview mode.");
  }
}
