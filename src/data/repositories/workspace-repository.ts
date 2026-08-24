import type { Task, WorkspaceState } from "@/domain/models";

export interface WorkspaceRepository {
  readonly kind: "preview" | "supabase";
  load(): Promise<WorkspaceState>;
  toggleTask(taskId: string): Promise<WorkspaceState>;
  createTask(input: Pick<Task, "title" | "priority" | "projectId" | "dueAt">): Promise<WorkspaceState>;
  addCapture(title: string, note?: string): Promise<WorkspaceState>;
  promoteCapture(captureId: string): Promise<WorkspaceState>;
  startSession(taskId: string): Promise<WorkspaceState>;
  stopSession(outcome?: string): Promise<WorkspaceState>;
  commitChangeSet(changeSetId: string): Promise<WorkspaceState>;
  discardChangeSet(changeSetId: string): Promise<WorkspaceState>;
  reset(): Promise<WorkspaceState>;
}
