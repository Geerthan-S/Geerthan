import { applyChangeSet } from "@/domain/change-set";
import type { ActivityEvent, Task, WorkspaceState } from "@/domain/models";
import { createSeedWorkspace } from "@/data/seed";
import type { WorkspaceRepository } from "@/data/repositories/workspace-repository";

const STORAGE_KEY = "geerthan-personal-os-v1";

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function event(
  type: ActivityEvent["type"],
  summary: string,
  detail: string,
  undoable = false,
): ActivityEvent {
  return {
    id: makeId("activity"),
    type,
    summary,
    detail,
    occurredAt: new Date().toISOString(),
    actor: "You",
    source: "web",
    undoable,
  };
}

export class LocalWorkspaceRepository implements WorkspaceRepository {
  readonly kind = "preview" as const;
  private state = createSeedWorkspace();

  private persist(next: WorkspaceState) {
    this.state = next;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return structuredClone(next);
  }

  async load() {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          this.state = JSON.parse(stored) as WorkspaceState;
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
    return structuredClone(this.state);
  }

  async toggleTask(taskId: string) {
    const target = this.state.tasks.find((task) => task.id === taskId);
    if (!target) return structuredClone(this.state);
    const completing = target.status !== "completed";
    const next = {
      ...this.state,
      tasks: this.state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: completing ? ("completed" as const) : ("planned" as const),
              completedAt: completing ? new Date().toISOString() : null,
            }
          : task,
      ),
      activity: [
        event(
          completing ? "task_completed" : "task_reopened",
          `${completing ? "Completed" : "Reopened"} ${target.title}`,
          "Task status changed from the workspace",
          true,
        ),
        ...this.state.activity,
      ],
    };
    return this.persist(next);
  }

  async createTask(input: Pick<Task, "title" | "priority" | "projectId" | "dueAt">) {
    const task: Task = {
      id: makeId("task"),
      title: input.title,
      projectId: input.projectId,
      status: "planned",
      priority: input.priority,
      dueAt: input.dueAt,
      scheduledStart: null,
      scheduledEnd: null,
      estimateMinutes: 30,
      completedAt: null,
      tags: [],
      createdAt: new Date().toISOString(),
      source: "manual",
    };
    return this.persist({
      ...this.state,
      tasks: [task, ...this.state.tasks],
      activity: [
        event("task_created", `Created ${task.title}`, "New task added from Tasks", true),
        ...this.state.activity,
      ],
    });
  }

  async addCapture(title: string, note = "") {
    const capture = {
      id: makeId("inbox"),
      title,
      note,
      createdAt: new Date().toISOString(),
      triaged: false,
    };
    return this.persist({
      ...this.state,
      inbox: [capture, ...this.state.inbox],
      activity: [
        event("capture_added", `Captured ${title}`, note || "Added to Inbox", true),
        ...this.state.activity,
      ],
    });
  }

  async promoteCapture(captureId: string) {
    const capture = this.state.inbox.find((item) => item.id === captureId);
    if (!capture) return structuredClone(this.state);
    const task: Task = {
      id: makeId("task"),
      title: capture.title,
      projectId: null,
      status: "planned",
      priority: "medium",
      dueAt: null,
      scheduledStart: null,
      scheduledEnd: null,
      estimateMinutes: 30,
      completedAt: null,
      tags: ["inbox"],
      createdAt: new Date().toISOString(),
      source: "capture",
    };
    return this.persist({
      ...this.state,
      inbox: this.state.inbox.map((item) =>
        item.id === captureId ? { ...item, triaged: true } : item,
      ),
      tasks: [task, ...this.state.tasks],
      activity: [
        event("task_created", `Promoted ${capture.title}`, "Inbox item converted to a task", true),
        ...this.state.activity,
      ],
    });
  }

  async startSession(taskId: string) {
    if (this.state.sessions.some((session) => session.status === "running")) {
      return structuredClone(this.state);
    }
    const task = this.state.tasks.find((item) => item.id === taskId);
    if (!task) return structuredClone(this.state);
    const session = {
      id: makeId("session"),
      taskId,
      projectId: task.projectId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMinutes: 0,
      status: "running" as const,
      outcome: null,
    };
    return this.persist({
      ...this.state,
      sessions: [session, ...this.state.sessions],
      tasks: this.state.tasks.map((item) =>
        item.id === taskId ? { ...item, status: "in_progress" as const } : item,
      ),
      activity: [
        event("session_started", `Started focus on ${task.title}`, "Work timer is running"),
        ...this.state.activity,
      ],
    });
  }

  async stopSession(outcome = "") {
    const running = this.state.sessions.find((session) => session.status === "running");
    if (!running) return structuredClone(this.state);
    const endedAt = new Date();
    const minutes = Math.max(
      1,
      Math.round((endedAt.getTime() - new Date(running.startedAt).getTime()) / 60000),
    );
    return this.persist({
      ...this.state,
      sessions: this.state.sessions.map((session) =>
        session.id === running.id
          ? {
              ...session,
              endedAt: endedAt.toISOString(),
              durationMinutes: minutes,
              status: "completed" as const,
              outcome: outcome || "Session completed from the workspace.",
            }
          : session,
      ),
      activity: [
        event(
          "session_completed",
          `Focused for ${minutes} minute${minutes === 1 ? "" : "s"}`,
          outcome || "Work session completed",
        ),
        ...this.state.activity,
      ],
    });
  }

  async commitChangeSet(changeSetId: string) {
    const draft = this.state.changeSets.find((item) => item.id === changeSetId);
    if (!draft || draft.status !== "draft") return structuredClone(this.state);
    const applied = applyChangeSet(this.state, draft);
    return this.persist({
      ...applied,
      changeSets: applied.changeSets.map((item) =>
        item.id === changeSetId
          ? { ...item, status: "committed" as const, committedAt: new Date().toISOString() }
          : item,
      ),
      activity: [
        event(
          "changeset_committed",
          `Committed ${draft.title}`,
          `${draft.operations.length} reviewed changes applied`,
          true,
        ),
        ...applied.activity,
      ],
    });
  }

  async discardChangeSet(changeSetId: string) {
    const draft = this.state.changeSets.find((item) => item.id === changeSetId);
    if (!draft || draft.status !== "draft") return structuredClone(this.state);
    return this.persist({
      ...this.state,
      changeSets: this.state.changeSets.map((item) =>
        item.id === changeSetId ? { ...item, status: "discarded" as const } : item,
      ),
      activity: [
        event(
          "changeset_discarded",
          `Discarded ${draft.title}`,
          "No proposed changes were applied",
        ),
        ...this.state.activity,
      ],
    });
  }

  async reset() {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    return this.persist(createSeedWorkspace());
  }
}
