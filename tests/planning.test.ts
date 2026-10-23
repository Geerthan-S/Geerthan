import { describe, expect, it } from "vitest";
import type { Habit, HabitLog } from "@/domain/models";
import {
  addDays,
  addMonths,
  calendarItems,
  dailyHabitCompletion,
  dateFromKey,
  daysInMonth,
  findConflicts,
  freeMinutesForDate,
  habitConsistency,
  habitMonthRate,
  habitProgress,
  habitStreak,
  monthKey,
  todayKey,
} from "@/domain/planning";

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    name: "Steps",
    description: "",
    metric: "count",
    targetValue: 10,
    unit: "steps",
    accent: "blue",
    active: true,
    sortOrder: 1,
    reminderTime: null,
    ...overrides,
  };
}

function logs(habitId: string, entries: Record<string, number>): HabitLog[] {
  return Object.entries(entries).map(([date, value]) => ({
    id: `${habitId}-${date}`,
    habitId,
    date,
    value,
    note: "",
  }));
}

describe("dates", () => {
  it("returns today's date in the profile timezone, not the machine's", () => {
    const instant = new Date("2026-03-01T20:00:00Z");
    expect(todayKey("Asia/Kolkata", instant)).toBe("2026-03-02");
    expect(todayKey("America/Los_Angeles", instant)).toBe("2026-03-01");
    expect(todayKey("UTC", instant)).toBe("2026-03-01");
  });

  it("falls back to the local date for an unknown timezone", () => {
    expect(todayKey("Not/AZone", new Date(2026, 4, 9, 12))).toBe("2026-05-09");
  });

  it("steps across month, year and daylight-saving boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(dateFromKey("2026-03-08").getHours()).toBe(12);
  });

  it("builds month keys and month day lists", () => {
    expect(monthKey("2026-10-21")).toBe("2026-10");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(daysInMonth("2026-02")).toHaveLength(28);
    expect(daysInMonth("2028-02")).toHaveLength(29);
    expect(daysInMonth("2026-03")[30]).toBe("2026-03-31");
  });
});

describe("habit progress", () => {
  it("caps progress at 100%", () => {
    expect(habitProgress(habit(), undefined)).toBe(0);
    expect(habitProgress(habit(), logs("habit-1", { "2026-03-01": 5 })[0])).toBe(0.5);
    expect(habitProgress(habit(), logs("habit-1", { "2026-03-01": 25 })[0])).toBe(1);
  });

  it("counts a streak through today, or through yesterday if today is still open", () => {
    const history = logs("habit-1", { "2026-03-07": 10, "2026-03-08": 12, "2026-03-09": 10 });
    expect(habitStreak(habit(), history, dateFromKey("2026-03-09"))).toBe(3);
    expect(habitStreak(habit(), history, dateFromKey("2026-03-10"))).toBe(3);
    expect(habitStreak(habit(), history, dateFromKey("2026-03-11"))).toBe(0);
  });

  it("breaks a streak on a partial day", () => {
    const history = logs("habit-1", { "2026-03-07": 10, "2026-03-08": 9, "2026-03-09": 10 });
    expect(habitStreak(habit(), history, dateFromKey("2026-03-09"))).toBe(1);
  });

  it("measures 7-day consistency from a given day", () => {
    const history = logs("habit-1", {
      "2026-03-03": 10,
      "2026-03-05": 10,
      "2026-03-08": 10,
      "2026-03-09": 10,
      "2026-03-01": 10,
    });
    expect(habitConsistency(habit(), history, 7, dateFromKey("2026-03-09"))).toBe(57);
  });

  it("ignores other habits' logs", () => {
    const history = logs("habit-2", { "2026-03-09": 10 });
    expect(habitStreak(habit(), history, dateFromKey("2026-03-09"))).toBe(0);
  });
});

describe("month tracker", () => {
  const steps = habit();
  const gym = habit({ id: "habit-2", name: "Gym", metric: "boolean", targetValue: 1, unit: "" });
  const history = [
    ...logs("habit-1", { "2026-03-01": 10, "2026-03-02": 4 }),
    ...logs("habit-2", { "2026-03-01": 1, "2026-03-03": 1 }),
  ];

  it("reports the share of habits completed each day", () => {
    const days = dailyHabitCompletion([steps, gym], history, ["2026-03-01", "2026-03-02", "2026-03-03"]);
    expect(days.map((day) => day.rate)).toEqual([1, 0, 0.5]);
    expect(days.map((day) => day.completed)).toEqual([2, 0, 1]);
  });

  it("reports zero completion when there are no habits", () => {
    expect(dailyHabitCompletion([], history, ["2026-03-01"])).toEqual([
      { date: "2026-03-01", completed: 0, rate: 0 },
    ]);
  });

  it("only counts elapsed days in a habit's month rate", () => {
    const march = daysInMonth("2026-03");
    expect(habitMonthRate(gym, history, march, "2026-03-04")).toBe(0.5);
    expect(habitMonthRate(gym, history, march, "2026-02-28")).toBe(0);
  });
});

describe("calendar", () => {
  const tasks = [
    {
      id: "t1",
      title: "Write",
      projectId: null,
      status: "planned" as const,
      priority: "high" as const,
      dueAt: null,
      scheduledStart: new Date(2026, 2, 9, 10).toISOString(),
      scheduledEnd: new Date(2026, 2, 9, 11).toISOString(),
      estimateMinutes: 60,
      completedAt: null,
      tags: [],
      createdAt: new Date(2026, 2, 1).toISOString(),
      source: "manual" as const,
    },
  ];
  const blocks = [
    {
      id: "b1",
      title: "Standup",
      kind: "meeting" as const,
      startsAt: new Date(2026, 2, 9, 10, 30).toISOString(),
      endsAt: new Date(2026, 2, 9, 11, 30).toISOString(),
      notes: "",
      source: "web" as const,
    },
  ];

  it("flags overlapping items as conflicts", () => {
    const items = calendarItems(tasks, blocks);
    expect([...findConflicts(items)].sort()).toEqual(["block-b1", "task-t1"]);
  });

  it("counts free minutes without double-counting overlaps", () => {
    const items = calendarItems(tasks, blocks);
    // 09:00–19:00 is 600 minutes; 10:00–11:30 is busy.
    expect(freeMinutesForDate(items, dateFromKey("2026-03-09"))).toBe(510);
  });
});
