import { describe, expect, it } from "vitest";
import type { Habit, HabitLog, Task, WorkSession, WorkspaceState } from "@/domain/models";
import { createEmptyWorkspace } from "@/data/seed";
import { weekStartFor, weeklyReview } from "@/domain/weekly-review";

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    name: id,
    description: "",
    metric: "boolean",
    targetValue: 1,
    unit: "",
    accent: "blue",
    active: true,
    sortOrder: 1,
    reminderTime: null,
    ...overrides,
  };
}

function done(habitId: string, ...dates: string[]): HabitLog[] {
  return dates.map((date) => ({ id: `${habitId}-${date}`, habitId, date, value: 1, note: "" }));
}

function session(startedAt: string, durationMinutes: number): WorkSession {
  return {
    id: startedAt,
    taskId: null,
    projectId: null,
    startedAt,
    endedAt: startedAt,
    durationMinutes,
    status: "completed",
    outcome: null,
  };
}

function task(id: string, overrides: Partial<Task>): Task {
  return {
    id,
    title: id,
    projectId: null,
    status: "planned",
    priority: "medium",
    dueAt: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimateMinutes: 30,
    completedAt: null,
    tags: [],
    createdAt: "2026-10-01T00:00:00Z",
    source: "manual",
    ...overrides,
  };
}

function workspace(overrides: Partial<WorkspaceState>): WorkspaceState {
  const base = createEmptyWorkspace();
  return { ...base, profile: { ...base.profile, timezone: "UTC" }, ...overrides };
}

describe("weekly review", () => {
  it("finds the Monday of any date's week", () => {
    expect(weekStartFor("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStartFor("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(weekStartFor("2026-11-01")).toBe("2026-10-26");
  });

  it("compares a finished week with the week before", () => {
    const state = workspace({
      habits: [habit("gym"), habit("read")],
      habitLogs: [
        ...done(
          "gym",
          "2026-10-19",
          "2026-10-20",
          "2026-10-21",
          "2026-10-22",
          "2026-10-23",
          "2026-10-24",
          "2026-10-25",
        ),
        ...done("read", "2026-10-19"),
        ...done("gym", "2026-10-12", "2026-10-13"),
        ...done("read", "2026-10-12", "2026-10-13", "2026-10-14"),
      ],
      sessions: [session("2026-10-20T09:00:00Z", 90), session("2026-10-13T09:00:00Z", 30)],
      tasks: [
        task("shipped", {
          status: "completed",
          completedAt: "2026-10-21T12:00:00Z",
          scheduledStart: "2026-10-21T09:00:00Z",
        }),
        task("missed", { scheduledStart: "2026-10-22T09:00:00Z" }),
      ],
    });

    const review = weeklyReview(state, "2026-10-19", "2026-10-26");

    expect(review.inProgress).toBe(false);
    expect(review.weekEnd).toBe("2026-10-25");
    expect(review.current.habitRate).toBeCloseTo(8 / 14);
    expect(review.previous.habitRate).toBeCloseTo(5 / 14);
    expect(review.current.focusMinutes).toBe(90);
    expect(review.previous.focusMinutes).toBe(30);
    expect(review.current).toMatchObject({ tasksCompleted: 1, tasksPlanned: 2, plannedCompleted: 1 });

    const read = review.habits.find((item) => item.habit.id === "read");
    expect(read).toMatchObject({ completedDays: 1, elapsedDays: 7 });
    expect(read?.previousRate).toBeCloseTo(3 / 7);
    expect(review.bestDay?.date).toBe("2026-10-19");
    expect(review.suggestion).toContain('"read" happened on 1 of 7 days');
    expect(review.suggestion).toContain("reminder");
  });

  it("only counts the days that have happened in a week in progress, against the same days last week", () => {
    const state = workspace({
      habits: [habit("gym")],
      habitLogs: done("gym", "2026-10-19", "2026-10-20", "2026-10-12"),
    });
    const review = weeklyReview(state, "2026-10-19", "2026-10-21");
    expect(review.inProgress).toBe(true);
    expect(review.elapsedDays).toBe(3);
    expect(review.days.map((day) => day.date)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(review.current.habitRate).toBeCloseTo(2 / 3);
    expect(review.previous.habitRate).toBeCloseTo(1 / 3);
  });

  it("assigns sessions and tasks to the user's local day, not UTC", () => {
    const state = workspace({
      profile: { ...createEmptyWorkspace().profile, timezone: "Asia/Kolkata" },
      // 20:00 UTC on Sunday is already Monday morning in India.
      sessions: [session("2026-10-25T20:00:00Z", 60)],
    });
    expect(weeklyReview(state, "2026-10-26", "2026-11-01").current.focusMinutes).toBe(60);
    expect(weeklyReview(state, "2026-10-19", "2026-10-25").current.focusMinutes).toBe(0);
  });

  it("suggests protecting focus time when it drops sharply", () => {
    const state = workspace({
      habits: [habit("gym")],
      habitLogs: done(
        "gym",
        "2026-10-19",
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        "2026-10-24",
        "2026-10-25",
      ),
      sessions: [session("2026-10-13T09:00:00Z", 300), session("2026-10-20T09:00:00Z", 60)],
    });
    expect(weeklyReview(state, "2026-10-19", "2026-10-26").suggestion).toContain("Focus time dropped");
  });

  it("handles a week with nothing tracked", () => {
    const review = weeklyReview(workspace({}), "2026-10-19", "2026-10-26");
    expect(review.current.habitRate).toBe(0);
    expect(review.bestDay).toBeNull();
    expect(review.suggestion).toContain("Nothing was tracked");
  });
});
