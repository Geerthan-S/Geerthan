import type { CalendarBlockKind, Task, WorkspaceState } from "@/domain/models";

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
  scheduleTask(taskId: string, startsAt: string, endsAt: string): Promise<WorkspaceState>;
  createCalendarBlock(input: { title: string; kind: CalendarBlockKind; startsAt: string; endsAt: string; notes?: string }): Promise<WorkspaceState>;
  checkInHabit(habitId: string, date: string, value: number, note?: string): Promise<WorkspaceState>;
  generateDailyPlan(date: string): Promise<WorkspaceState>;
  rescheduleUnfinished(date: string): Promise<WorkspaceState>;
  reset(): Promise<WorkspaceState>;
}
