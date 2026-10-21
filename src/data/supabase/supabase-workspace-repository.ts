"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalendarBlockKind,
  Habit,
  HabitInput,
  HabitLog,
  HabitUpdateInput,
  ProjectInput,
  ProjectPatch,
  Task,
  TaskDetailsInput,
  WorkspaceState,
} from "@/domain/models";
import type { WorkspaceRepository } from "@/data/repositories/workspace-repository";
import { readWorkspaceState } from "@/data/supabase/read-workspace-state";
import { mapHabit, mapHabitLog } from "@/data/supabase/workspace-mappers";

const HABIT_LOG_PAGE_SIZE = 1000;

const projectColumns: Record<keyof ProjectPatch, string> = {
  name: "name",
  code: "code",
  description: "description",
  client: "client_name",
  status: "status",
  health: "health",
  progress: "progress",
  deadline: "deadline",
  nextMilestone: "next_milestone",
  accent: "accent",
};

function projectPatchToRow(patch: ProjectPatch) {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      projectColumns[key as keyof ProjectPatch],
      key === "deadline" ? value || null : value,
    ]),
  );
}

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
    const { error: initializeError } = await this.client.rpc("initialize_phase_2_workspace");
    if (initializeError && initializeError.code !== "PGRST202") throw new Error(initializeError.message);
    return readWorkspaceState(this.client, authData.user);
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

  createCalendarBlock(input: {
    title: string;
    kind: CalendarBlockKind;
    startsAt: string;
    endsAt: string;
    notes?: string;
  }) {
    return this.runRpc("create_calendar_block_with_activity", {
      block_title: input.title,
      block_kind: input.kind,
      block_start: input.startsAt,
      block_end: input.endsAt,
      block_notes: input.notes ?? "",
    });
  }

  checkInHabit(habitId: string, date: string, value: number, note = "") {
    return this.runRpc("upsert_habit_checkin", {
      target_habit: habitId,
      target_date: date,
      checkin_value: value,
      checkin_note: note,
    });
  }

  generateDailyPlan(date: string) {
    return this.runRpc("generate_daily_plan_draft", { target_date: date, include_overdue: true });
  }

  rescheduleUnfinished(date: string) {
    return this.runRpc("draft_unfinished_reschedule", { target_date: date });
  }

  updateTask(taskId: string, expectedVersion: number, input: TaskDetailsInput) {
    return this.runRpc("update_task_details", {
      target_task: taskId,
      expected_version: expectedVersion,
      task_title: input.title,
      task_priority: input.priority,
      task_project_id: input.projectId,
      task_due_at: input.dueAt,
      task_estimate_minutes: input.estimateMinutes,
    });
  }

  deleteTask(taskId: string) {
    return this.runRpc("delete_task", { target_task: taskId });
  }

  createProject(input: ProjectInput) {
    return this.runRpc("create_project", {
      project_name: input.name,
      project_code: input.code,
      project_description: input.description,
      project_client: input.client,
      project_deadline: input.deadline || null,
      project_accent: input.accent,
    });
  }

  updateProject(projectId: string, expectedVersion: number, patch: ProjectPatch) {
    return this.runRpc("update_project", {
      target_project: projectId,
      expected_version: expectedVersion,
      project_patch: projectPatchToRow(patch),
    });
  }

  deleteProject(projectId: string) {
    return this.runRpc("delete_project", { target_project: projectId });
  }

  createHabit(input: HabitInput) {
    return this.runRpc("create_habit", {
      habit_name: input.name,
      habit_description: input.description,
      habit_metric: input.metric,
      habit_target: input.targetValue,
      habit_unit: input.unit,
      habit_accent: input.accent,
    });
  }

  updateHabit(habitId: string, expectedVersion: number, input: HabitUpdateInput) {
    return this.runRpc("update_habit", {
      target_habit: habitId,
      expected_version: expectedVersion,
      habit_name: input.name,
      habit_description: input.description,
      habit_target: input.targetValue,
      habit_unit: input.unit,
      habit_accent: input.accent,
    });
  }

  setHabitActive(habitId: string, active: boolean) {
    return this.runRpc("set_habit_active", { target_habit: habitId, habit_active: active });
  }

  reorderHabits(orderedHabitIds: string[]) {
    return this.runRpc("reorder_habits", { ordered_habits: orderedHabitIds });
  }

  async loadHabitLogs(from: string, to: string): Promise<HabitLog[]> {
    const logs: HabitLog[] = [];
    for (let offset = 0; ; offset += HABIT_LOG_PAGE_SIZE) {
      const { data, error } = await this.client
        .from("habit_logs")
        .select("*")
        .gte("log_date", from)
        .lte("log_date", to)
        .order("log_date", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + HABIT_LOG_PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      logs.push(...(data ?? []).map((row) => mapHabitLog(row as Record<string, unknown>)));
      if (!data || data.length < HABIT_LOG_PAGE_SIZE) return logs;
    }
  }

  async loadArchivedHabits(): Promise<Habit[]> {
    const { data, error } = await this.client
      .from("habits")
      .select("*")
      .eq("active", false)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapHabit(row as Record<string, unknown>));
  }

  async reset(): Promise<WorkspaceState> {
    throw new Error("Reset is available only in local preview mode.");
  }
}
