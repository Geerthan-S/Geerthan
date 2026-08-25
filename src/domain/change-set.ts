import type { ChangeOperation, ChangeSet, WorkspaceState } from "@/domain/models";

export function applyChangeSet(state: WorkspaceState, changeSet: ChangeSet): WorkspaceState {
  if (changeSet.status !== "draft") return state;

  let tasks = [...state.tasks];

  for (const operation of changeSet.operations) {
    if (operation.entity !== "task") continue;

    if (operation.action === "create") {
      const task = operation.after as unknown as WorkspaceState["tasks"][number];
      tasks = [task, ...tasks];
      continue;
    }

    if (!operation.entityId) continue;
    tasks = tasks.map((task) =>
      task.id === operation.entityId ? { ...task, ...operation.after } : task,
    );
  }

  return { ...state, tasks };
}

export function describeOperation(operation: ChangeOperation) {
  const verbs: Record<ChangeOperation["action"], string> = {
    create: "Create",
    update: "Update",
    complete: "Complete",
    reschedule: "Reschedule",
    start: "Start",
    end: "End",
    log: "Log",
  };
  return `${verbs[operation.action]} ${operation.entity.replace("_", " ")}`;
}
