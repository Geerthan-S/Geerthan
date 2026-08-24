"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, WorkspaceState } from "@/domain/models";
import type { WorkspaceRepository } from "@/data/repositories/workspace-repository";
import {
  mapActivity,
  mapChangeSet,
  mapInboxItem,
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
    const [profile, projects, tasks, sessions, inbox, activity, changeSets] =
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
      ]);
    const failure = [
      profile,
      projects,
      tasks,
      sessions,
      inbox,
      activity,
      changeSets,
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

  async reset(): Promise<WorkspaceState> {
    throw new Error("Reset is available only in local preview mode.");
  }
}
