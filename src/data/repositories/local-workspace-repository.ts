import { applyChangeSet } from "@/domain/change-set";
import type {
  ActivityEvent,
  CalendarBlockKind,
  Habit,
  HabitInput,
  HabitUpdateInput,
  Project,
  ProjectInput,
  ProjectPatch,
  Task,
  TaskDetailsInput,
  WorkspaceState,
} from "@/domain/models";
import { createSeedWorkspace } from "@/data/seed";
import { todayKey } from "@/domain/planning";
import type { WorkspaceRepository } from "@/data/repositories/workspace-repository";

const STORAGE_KEY = "geerthan-personal-os-v1";
const ARCHIVED_HABITS_KEY = "geerthan-personal-os-archived-habits-v1";

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
      inbox: this.state.inbox.map((item) => (item.id === captureId ? { ...item, triaged: true } : item)),
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
        event("changeset_discarded", `Discarded ${draft.title}`, "No proposed changes were applied"),
        ...this.state.activity,
      ],
    });
  }

  async scheduleTask(taskId: string, startsAt: string, endsAt: string) {
    const task = this.state.tasks.find((item) => item.id === taskId);
    if (!task) return structuredClone(this.state);
    return this.persist({
      ...this.state,
      tasks: this.state.tasks.map((item) =>
        item.id === taskId
          ? { ...item, scheduledStart: startsAt, scheduledEnd: endsAt, status: "planned" as const }
          : item,
      ),
      activity: [
        event("task_scheduled", `Scheduled ${task.title}`, new Date(startsAt).toLocaleString(), true),
        ...this.state.activity,
      ],
    });
  }

  async createCalendarBlock(input: {
    title: string;
    kind: CalendarBlockKind;
    startsAt: string;
    endsAt: string;
    notes?: string;
  }) {
    const block = {
      id: makeId("block"),
      title: input.title,
      kind: input.kind,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      notes: input.notes ?? "",
      source: "web" as const,
    };
    return this.persist({
      ...this.state,
      calendarBlocks: [...this.state.calendarBlocks, block],
      activity: [
        event("calendar_block_created", `Blocked ${block.title}`, "Added to calendar", true),
        ...this.state.activity,
      ],
    });
  }

  async checkInHabit(habitId: string, date: string, value: number, note = "") {
    const habit = this.state.habits.find((item) => item.id === habitId);
    if (!habit) return structuredClone(this.state);
    if (date > todayKey(this.state.profile.timezone)) throw new Error("invalid_habit_date_future");
    const existing = this.state.habitLogs.find((log) => log.habitId === habitId && log.date === date);
    const log = {
      id: existing?.id ?? makeId("habit-log"),
      habitId,
      date,
      value: habit.metric === "boolean" ? Number(value > 0) : value,
      note,
    };
    return this.persist({
      ...this.state,
      habitLogs: [
        log,
        ...this.state.habitLogs.filter((item) => !(item.habitId === habitId && item.date === date)),
      ],
      activity: [
        event(
          "habit_checked_in",
          `Checked in ${habit.name}`,
          `${log.value}${habit.unit ? ` ${habit.unit}` : ""}`,
          true,
        ),
        ...this.state.activity,
      ],
    });
  }

  async generateDailyPlan(date: string) {
    const candidates = this.state.tasks
      .filter((task) => task.status !== "completed" && task.status !== "blocked" && !task.scheduledStart)
      .slice(0, 6);
    if (!candidates.length) return structuredClone(this.state);
    let cursor = new Date(`${date}T09:00:00`);
    const operations = candidates.map((task, index) => {
      const start = new Date(cursor);
      const end = new Date(start.getTime() + Math.max(15, task.estimateMinutes) * 60000);
      cursor = new Date(end.getTime() + 10 * 60000);
      return {
        id: makeId("operation"),
        entity: "task" as const,
        action: "reschedule" as const,
        entityId: task.id,
        summary: `Schedule ${task.title} at ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
        before: { scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd },
        after: { scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), status: "planned" },
        sequence: index,
      };
    });
    const draft = {
      id: makeId("changeset"),
      title: `Plan ${new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}`,
      rationale: "Prioritizes urgent work and protects existing commitments.",
      status: "draft" as const,
      createdAt: new Date().toISOString(),
      committedAt: null,
      createdBy: "You" as const,
      kind: "daily_plan" as const,
      planDate: date,
      operations,
    };
    return this.persist({
      ...this.state,
      changeSets: [draft, ...this.state.changeSets],
      activity: [
        event(
          "changeset_created",
          "Drafted a daily plan",
          `${operations.length} changes are ready for review`,
        ),
        ...this.state.activity,
      ],
    });
  }

  async rescheduleUnfinished(date: string) {
    const unfinished = this.state.tasks
      .filter(
        (task) =>
          task.status !== "completed" && task.scheduledEnd && new Date(task.scheduledEnd) < new Date(),
      )
      .slice(0, 6);
    if (!unfinished.length) return structuredClone(this.state);
    let cursor = new Date(`${date}T09:00:00`);
    const operations = unfinished.map((task) => {
      const start = new Date(cursor);
      const end = new Date(start.getTime() + Math.max(15, task.estimateMinutes) * 60000);
      cursor = new Date(end.getTime() + 10 * 60000);
      return {
        id: makeId("operation"),
        entity: "task" as const,
        action: "reschedule" as const,
        entityId: task.id,
        summary: `Move ${task.title} to tomorrow`,
        before: { scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd },
        after: { scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), status: "planned" },
      };
    });
    const draft = {
      id: makeId("changeset"),
      title: "Carry unfinished work forward",
      rationale: "Moves incomplete scheduled work into tomorrow for review.",
      status: "draft" as const,
      createdAt: new Date().toISOString(),
      committedAt: null,
      createdBy: "You" as const,
      kind: "unfinished_reschedule" as const,
      planDate: date,
      operations,
    };
    return this.persist({
      ...this.state,
      changeSets: [draft, ...this.state.changeSets],
      activity: [
        event(
          "changeset_created",
          "Drafted unfinished-task carryover",
          `${operations.length} tasks are ready to review`,
        ),
        ...this.state.activity,
      ],
    });
  }

  private versionConflict(current: { version?: number }, expectedVersion: number) {
    if ((current.version ?? 1) !== expectedVersion) {
      throw new Error("This item changed somewhere else. Reload and try again.");
    }
  }

  private readArchivedHabits(): Habit[] {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(ARCHIVED_HABITS_KEY) ?? "[]") as Habit[];
    } catch {
      return [];
    }
  }

  private writeArchivedHabits(habits: Habit[]) {
    if (typeof window !== "undefined")
      window.localStorage.setItem(ARCHIVED_HABITS_KEY, JSON.stringify(habits));
  }

  async updateTask(taskId: string, expectedVersion: number, input: TaskDetailsInput) {
    const task = this.state.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("That task no longer exists.");
    this.versionConflict(task, expectedVersion);
    const updated = { ...task, ...input, title: input.title.trim(), version: (task.version ?? 1) + 1 };
    return this.persist({
      ...this.state,
      tasks: this.state.tasks.map((item) => (item.id === taskId ? updated : item)),
      activity: [
        event("task_updated", `Updated ${updated.title}`, "Task details edited from the workspace", true),
        ...this.state.activity,
      ],
    });
  }

  async deleteTask(taskId: string) {
    const task = this.state.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("That task no longer exists.");
    return this.persist({
      ...this.state,
      tasks: this.state.tasks.filter((item) => item.id !== taskId),
      sessions: this.state.sessions.map((session) =>
        session.taskId === taskId ? { ...session, taskId: null } : session,
      ),
      activity: [
        event("task_deleted", `Deleted ${task.title}`, "Task removed from the workspace"),
        ...this.state.activity,
      ],
    });
  }

  async createProject(input: ProjectInput) {
    const code = input.code.trim().toUpperCase();
    if (this.state.projects.some((project) => project.code === code)) {
      throw new Error(`A project already uses the code ${code}.`);
    }
    const project: Project = {
      id: makeId("project"),
      version: 1,
      name: input.name.trim(),
      code,
      description: input.description,
      client: input.client,
      status: "active",
      health: "on_track",
      progress: 0,
      deadline: input.deadline,
      nextMilestone: "",
      accent: input.accent,
    };
    return this.persist({
      ...this.state,
      projects: [project, ...this.state.projects],
      activity: [
        event("project_created", `Created ${project.name}`, "New project added from Projects"),
        ...this.state.activity,
      ],
    });
  }

  async updateProject(projectId: string, expectedVersion: number, patch: ProjectPatch) {
    const project = this.state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("That project no longer exists.");
    this.versionConflict(project, expectedVersion);
    const updated: Project = {
      ...project,
      ...patch,
      code: patch.code ? patch.code.trim().toUpperCase() : project.code,
      version: (project.version ?? 1) + 1,
    };
    return this.persist({
      ...this.state,
      projects: this.state.projects.map((item) => (item.id === projectId ? updated : item)),
      activity: [
        event(
          "project_updated",
          `Updated ${updated.name}`,
          "Project details edited from the workspace",
          true,
        ),
        ...this.state.activity,
      ],
    });
  }

  async deleteProject(projectId: string) {
    const project = this.state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("That project no longer exists.");
    return this.persist({
      ...this.state,
      projects: this.state.projects.filter((item) => item.id !== projectId),
      tasks: this.state.tasks.map((task) =>
        task.projectId === projectId ? { ...task, projectId: null } : task,
      ),
      sessions: this.state.sessions.map((session) =>
        session.projectId === projectId ? { ...session, projectId: null } : session,
      ),
      activity: [
        event(
          "project_deleted",
          `Deleted ${project.name}`,
          "Project removed; its tasks were kept without a project",
        ),
        ...this.state.activity,
      ],
    });
  }

  async createHabit(input: HabitInput) {
    const boolean = input.metric === "boolean";
    const habit: Habit = {
      id: makeId("habit"),
      version: 1,
      name: input.name.trim(),
      description: input.description,
      metric: input.metric,
      targetValue: boolean ? 1 : input.targetValue,
      unit: boolean ? "" : input.unit.trim(),
      accent: input.accent,
      active: true,
      sortOrder: Math.max(0, ...this.state.habits.map((item) => item.sortOrder)) + 1,
    };
    return this.persist({
      ...this.state,
      habits: [...this.state.habits, habit],
      activity: [
        event("habit_created", `Started tracking ${habit.name}`, "New habit added from Habits"),
        ...this.state.activity,
      ],
    });
  }

  async updateHabit(habitId: string, expectedVersion: number, input: HabitUpdateInput) {
    const habit = this.state.habits.find((item) => item.id === habitId);
    if (!habit) throw new Error("That habit no longer exists.");
    this.versionConflict(habit, expectedVersion);
    const boolean = habit.metric === "boolean";
    const updated: Habit = {
      ...habit,
      name: input.name.trim(),
      description: input.description,
      targetValue: boolean ? 1 : input.targetValue,
      unit: boolean ? "" : input.unit.trim(),
      accent: input.accent,
      version: (habit.version ?? 1) + 1,
    };
    return this.persist({
      ...this.state,
      habits: this.state.habits.map((item) => (item.id === habitId ? updated : item)),
      activity: [
        event("habit_updated", `Updated ${updated.name}`, "Habit settings edited from Habits", true),
        ...this.state.activity,
      ],
    });
  }

  async setHabitActive(habitId: string, active: boolean) {
    const archived = this.readArchivedHabits();
    if (active) {
      const habit = archived.find((item) => item.id === habitId);
      if (!habit) throw new Error("That habit no longer exists.");
      this.writeArchivedHabits(archived.filter((item) => item.id !== habitId));
      return this.persist({
        ...this.state,
        habits: [...this.state.habits, { ...habit, active: true }].sort((a, b) => a.sortOrder - b.sortOrder),
        activity: [
          event("habit_restored", `Restored ${habit.name}`, "Habit is tracked again", true),
          ...this.state.activity,
        ],
      });
    }
    const habit = this.state.habits.find((item) => item.id === habitId);
    if (!habit) throw new Error("That habit no longer exists.");
    this.writeArchivedHabits([{ ...habit, active: false }, ...archived]);
    return this.persist({
      ...this.state,
      habits: this.state.habits.filter((item) => item.id !== habitId),
      activity: [
        event("habit_archived", `Archived ${habit.name}`, "Habit hidden; its history is kept", true),
        ...this.state.activity,
      ],
    });
  }

  async reorderHabits(orderedHabitIds: string[]) {
    const position = new Map(orderedHabitIds.map((id, index) => [id, index + 1]));
    return this.persist({
      ...this.state,
      habits: this.state.habits
        .map((habit) => ({ ...habit, sortOrder: position.get(habit.id) ?? habit.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }

  async loadHabitLogs(from: string, to: string) {
    return structuredClone(this.state.habitLogs.filter((log) => log.date >= from && log.date <= to));
  }

  async loadArchivedHabits() {
    return this.readArchivedHabits();
  }

  async reset() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(ARCHIVED_HABITS_KEY);
    }
    return this.persist(createSeedWorkspace());
  }
}
