"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  CalendarBlockKind,
  Habit,
  HabitInput,
  HabitLog,
  HabitUpdateInput,
  Priority,
  ProjectInput,
  ProjectPatch,
  Task,
  TaskDetailsInput,
  WorkspaceState,
} from "@/domain/models";
import { friendlyWorkspaceError } from "@/features/workspace/friendly-error";
import { createEmptyWorkspace, createSeedWorkspace } from "@/data/seed";
import { createWorkspaceRepository } from "@/data/repositories/create-workspace-repository";

/** Every action resolves to true when the change was saved, false when it was rejected. */
interface WorkspaceActions {
  toggleTask(taskId: string): Promise<boolean>;
  createTask(input: Pick<Task, "title" | "priority" | "projectId" | "dueAt">): Promise<boolean>;
  addCapture(title: string, note?: string): Promise<boolean>;
  promoteCapture(captureId: string): Promise<boolean>;
  startSession(taskId: string): Promise<boolean>;
  stopSession(outcome?: string): Promise<boolean>;
  commitChangeSet(changeSetId: string): Promise<boolean>;
  discardChangeSet(changeSetId: string): Promise<boolean>;
  scheduleTask(taskId: string, startsAt: string, endsAt: string): Promise<boolean>;
  createCalendarBlock(input: {
    title: string;
    kind: CalendarBlockKind;
    startsAt: string;
    endsAt: string;
    notes?: string;
  }): Promise<boolean>;
  checkInHabit(habitId: string, date: string, value: number, note?: string): Promise<boolean>;
  generateDailyPlan(date: string): Promise<boolean>;
  rescheduleUnfinished(date: string): Promise<boolean>;
  updateTask(taskId: string, expectedVersion: number, input: TaskDetailsInput): Promise<boolean>;
  deleteTask(taskId: string): Promise<boolean>;
  createProject(input: ProjectInput): Promise<boolean>;
  updateProject(projectId: string, expectedVersion: number, patch: ProjectPatch): Promise<boolean>;
  deleteProject(projectId: string): Promise<boolean>;
  createHabit(input: HabitInput): Promise<boolean>;
  updateHabit(habitId: string, expectedVersion: number, input: HabitUpdateInput): Promise<boolean>;
  setHabitActive(habitId: string, active: boolean): Promise<boolean>;
  reorderHabits(orderedHabitIds: string[]): Promise<boolean>;
  /** Re-reads the workspace, e.g. after settings saved outside the repository. */
  reload(): Promise<boolean>;
  reset(): Promise<boolean>;
}

interface WorkspaceHistory {
  loadHabitLogs(from: string, to: string): Promise<HabitLog[]>;
  loadArchivedHabits(): Promise<Habit[]>;
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  ready: boolean;
  mode: "preview" | "supabase";
  actions: WorkspaceActions;
  history: WorkspaceHistory;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(() => createWorkspaceRepository());
  const mode = repository.kind;
  const [state, setState] = useState<WorkspaceState>(() =>
    mode === "supabase" ? createEmptyWorkspace() : createSeedWorkspace(),
  );
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    repository
      .load()
      .then((snapshot) => setState(snapshot))
      .catch((loadError: unknown) =>
        setFatalError(loadError instanceof Error ? loadError.message : "Workspace loading failed."),
      )
      .finally(() => setReady(true));
  }, [repository]);

  const run = useCallback(async (operation: () => Promise<WorkspaceState>) => {
    try {
      setNotice(null);
      setState(await operation());
      return true;
    } catch (operationError) {
      setNotice(friendlyWorkspaceError(operationError));
      return false;
    }
  }, []);

  const actions = useMemo<WorkspaceActions>(
    () => ({
      toggleTask: (taskId) => run(() => repository.toggleTask(taskId)),
      createTask: (input) => run(() => repository.createTask(input)),
      addCapture: (title, note) => run(() => repository.addCapture(title, note)),
      promoteCapture: (captureId) => run(() => repository.promoteCapture(captureId)),
      startSession: (taskId) => run(() => repository.startSession(taskId)),
      stopSession: (outcome) => run(() => repository.stopSession(outcome)),
      commitChangeSet: (changeSetId) => run(() => repository.commitChangeSet(changeSetId)),
      discardChangeSet: (changeSetId) => run(() => repository.discardChangeSet(changeSetId)),
      scheduleTask: (taskId, startsAt, endsAt) =>
        run(() => repository.scheduleTask(taskId, startsAt, endsAt)),
      createCalendarBlock: (input) => run(() => repository.createCalendarBlock(input)),
      checkInHabit: (habitId, date, value, note) =>
        run(() => repository.checkInHabit(habitId, date, value, note)),
      generateDailyPlan: (date) => run(() => repository.generateDailyPlan(date)),
      rescheduleUnfinished: (date) => run(() => repository.rescheduleUnfinished(date)),
      updateTask: (taskId, expectedVersion, input) =>
        run(() => repository.updateTask(taskId, expectedVersion, input)),
      deleteTask: (taskId) => run(() => repository.deleteTask(taskId)),
      createProject: (input) => run(() => repository.createProject(input)),
      updateProject: (projectId, expectedVersion, patch) =>
        run(() => repository.updateProject(projectId, expectedVersion, patch)),
      deleteProject: (projectId) => run(() => repository.deleteProject(projectId)),
      createHabit: (input) => run(() => repository.createHabit(input)),
      updateHabit: (habitId, expectedVersion, input) =>
        run(() => repository.updateHabit(habitId, expectedVersion, input)),
      setHabitActive: (habitId, active) => run(() => repository.setHabitActive(habitId, active)),
      reorderHabits: (orderedHabitIds) => run(() => repository.reorderHabits(orderedHabitIds)),
      reload: () => run(() => repository.load()),
      reset: () => run(() => repository.reset()),
    }),
    [repository, run],
  );

  const history = useMemo<WorkspaceHistory>(
    () => ({
      loadHabitLogs: (from, to) => repository.loadHabitLogs(from, to),
      loadArchivedHabits: () => repository.loadArchivedHabits(),
    }),
    [repository],
  );

  if (mode === "supabase" && !ready) {
    return (
      <main className="workspace-gate">
        <div className="workspace-gate-card glass-panel">
          <span className="focus-pulse" />
          <strong>Opening your workspace…</strong>
          <p>Reading the authenticated state from Supabase.</p>
        </div>
      </main>
    );
  }

  if (mode === "supabase" && fatalError) {
    return (
      <main className="workspace-gate">
        <div className="workspace-gate-card glass-panel">
          <span className="eyebrow">Supabase connection</span>
          <h1>Workspace unavailable</h1>
          <p>{fatalError}</p>
          <div className="workspace-gate-actions">
            <a className="button button-secondary button-md" href="/login">
              Sign in
            </a>
            <button className="button button-primary button-md" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ state, ready, mode, actions, history }}>
      {children}
      {notice ? (
        <button className="workspace-notice glass-panel" role="alert" onClick={() => setNotice(null)}>
          {notice}
          <span>Dismiss</span>
        </button>
      ) : null}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}

export const priorityOptions: Priority[] = ["critical", "high", "medium", "low"];
