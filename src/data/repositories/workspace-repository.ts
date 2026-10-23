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
  createCalendarBlock(input: {
    title: string;
    kind: CalendarBlockKind;
    startsAt: string;
    endsAt: string;
    notes?: string;
  }): Promise<WorkspaceState>;
  checkInHabit(habitId: string, date: string, value: number, note?: string): Promise<WorkspaceState>;
  generateDailyPlan(date: string): Promise<WorkspaceState>;
  rescheduleUnfinished(date: string): Promise<WorkspaceState>;
  updateTask(taskId: string, expectedVersion: number, input: TaskDetailsInput): Promise<WorkspaceState>;
  deleteTask(taskId: string): Promise<WorkspaceState>;
  createProject(input: ProjectInput): Promise<WorkspaceState>;
  updateProject(projectId: string, expectedVersion: number, patch: ProjectPatch): Promise<WorkspaceState>;
  deleteProject(projectId: string): Promise<WorkspaceState>;
  createHabit(input: HabitInput): Promise<WorkspaceState>;
  updateHabit(habitId: string, expectedVersion: number, input: HabitUpdateInput): Promise<WorkspaceState>;
  setHabitActive(habitId: string, active: boolean): Promise<WorkspaceState>;
  reorderHabits(orderedHabitIds: string[]): Promise<WorkspaceState>;
  /** Logs for active habits between two inclusive YYYY-MM-DD dates, for history views. */
  loadHabitLogs(from: string, to: string): Promise<HabitLog[]>;
  loadArchivedHabits(): Promise<Habit[]>;
  reset(): Promise<WorkspaceState>;
}
