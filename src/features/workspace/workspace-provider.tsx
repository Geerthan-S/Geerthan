"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Priority, Task, WorkspaceState } from "@/domain/models";
import { createSeedWorkspace } from "@/data/seed";
import { LocalWorkspaceRepository } from "@/data/repositories/local-workspace-repository";

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
  actions: WorkspaceActions;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const repository = useRef(new LocalWorkspaceRepository());
  const [state, setState] = useState<WorkspaceState>(() => createSeedWorkspace());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    repository.current.load().then((snapshot) => {
      setState(snapshot);
      setReady(true);
    });
  }, []);

  const run = useCallback(async (operation: () => Promise<WorkspaceState>) => {
    setState(await operation());
  }, []);

  const actions = useMemo<WorkspaceActions>(
    () => ({
      toggleTask: (taskId) => run(() => repository.current.toggleTask(taskId)),
      createTask: (input) => run(() => repository.current.createTask(input)),
      addCapture: (title, note) => run(() => repository.current.addCapture(title, note)),
      promoteCapture: (captureId) =>
        run(() => repository.current.promoteCapture(captureId)),
      startSession: (taskId) => run(() => repository.current.startSession(taskId)),
      stopSession: (outcome) => run(() => repository.current.stopSession(outcome)),
      commitChangeSet: (changeSetId) =>
        run(() => repository.current.commitChangeSet(changeSetId)),
      discardChangeSet: (changeSetId) =>
        run(() => repository.current.discardChangeSet(changeSetId)),
      reset: () => run(() => repository.current.reset()),
    }),
    [run],
  );

  return (
    <WorkspaceContext.Provider value={{ state, ready, actions }}>
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
