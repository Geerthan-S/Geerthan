"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Priority, Task, WorkspaceState } from "@/domain/models";
import { createEmptyWorkspace, createSeedWorkspace } from "@/data/seed";
import { createWorkspaceRepository } from "@/data/repositories/create-workspace-repository";

interface WorkspaceActions {
  toggleTask(taskId: string): Promise<void>;
  createTask(input: Pick<Task, "title" | "priority" | "projectId" | "dueAt">): Promise<void>;
  addCapture(title: string, note?: string): Promise<void>;
  promoteCapture(captureId: string): Promise<void>;
  startSession(taskId: string): Promise<void>;
  stopSession(outcome?: string): Promise<void>;
  commitChangeSet(changeSetId: string): Promise<void>;
  discardChangeSet(changeSetId: string): Promise<void>;
  reset(): Promise<void>;
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  ready: boolean;
  mode: "preview" | "supabase";
  actions: WorkspaceActions;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(() => createWorkspaceRepository());
  const mode = repository.kind;
  const [state, setState] = useState<WorkspaceState>(() =>
    mode === "supabase" ? createEmptyWorkspace() : createSeedWorkspace(),
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repository
      .load()
      .then((snapshot) => setState(snapshot))
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : "Workspace loading failed."),
      )
      .finally(() => setReady(true));
  }, [repository]);

  const run = useCallback(async (operation: () => Promise<WorkspaceState>) => {
    try {
      setError(null);
      setState(await operation());
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "The workspace update failed.",
      );
    }
  }, []);

  const actions = useMemo<WorkspaceActions>(
    () => ({
      toggleTask: (taskId) => run(() => repository.toggleTask(taskId)),
      createTask: (input) => run(() => repository.createTask(input)),
      addCapture: (title, note) => run(() => repository.addCapture(title, note)),
      promoteCapture: (captureId) =>
        run(() => repository.promoteCapture(captureId)),
      startSession: (taskId) => run(() => repository.startSession(taskId)),
      stopSession: (outcome) => run(() => repository.stopSession(outcome)),
      commitChangeSet: (changeSetId) =>
        run(() => repository.commitChangeSet(changeSetId)),
      discardChangeSet: (changeSetId) =>
        run(() => repository.discardChangeSet(changeSetId)),
      reset: () => run(() => repository.reset()),
    }),
    [repository, run],
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

  if (mode === "supabase" && error) {
    return (
      <main className="workspace-gate">
        <div className="workspace-gate-card glass-panel">
          <span className="eyebrow">Supabase connection</span>
          <h1>Workspace unavailable</h1>
          <p>{error}</p>
          <div className="workspace-gate-actions">
            <a className="button button-secondary button-md" href="/login">Sign in</a>
            <button className="button button-primary button-md" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ state, ready, mode, actions }}>
      {children}
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
