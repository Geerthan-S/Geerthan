import type { Task, WorkspaceState } from "@/domain/models";

export function isToday(value: string | null, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function getTodayTasks(state: WorkspaceState) {
  return state.tasks
    .filter(
      (task) =>
        task.status !== "completed" &&
        (isToday(task.scheduledStart) || isToday(task.dueAt)),
    )
    .sort((a, b) => {
      if (!a.scheduledStart) return 1;
      if (!b.scheduledStart) return -1;
      return a.scheduledStart.localeCompare(b.scheduledStart);
    });
}

export function getActiveTasks(state: WorkspaceState) {
  const weight: Record<Task["priority"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return state.tasks
    .filter((task) => task.status !== "completed")
    .sort((a, b) => weight[a.priority] - weight[b.priority]);
}

export function getFocusedMinutesToday(state: WorkspaceState, now = new Date()) {
  return state.sessions
    .filter((session) => isToday(session.startedAt, now))
    .reduce((total, session) => {
      if (session.status === "running") {
        return total + Math.max(1, Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 60000));
      }
      return total + session.durationMinutes;
    }, 0);
}

export function getProjectById(state: WorkspaceState, projectId: string | null) {
  if (!projectId) return null;
  return state.projects.find((project) => project.id === projectId) ?? null;
}
