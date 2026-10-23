import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { readWorkspaceState } from "@/data/supabase/read-workspace-state";

type Row = Record<string, unknown>;
type TableData = Record<string, Row[]>;

class FakeQuery implements PromiseLike<{ data: Row[] | Row | null; error: null }> {
  private filters: Array<[string, unknown]> = [];
  private lowerBounds: Array<[string, string]> = [];
  private maximum: number | null = null;
  private window: [number, number] | null = null;
  private wantsSingle = false;

  constructor(
    private readonly table: string,
    private readonly data: TableData,
    private readonly seenFilters: Array<{ table: string; column: string; value: unknown }>,
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    this.seenFilters.push({ table: this.table, column, value });
    return this;
  }
  gte(column: string, value: string) {
    this.lowerBounds.push([column, value]);
    return this;
  }
  order() {
    return this;
  }
  limit(value: number) {
    this.maximum = value;
    return this;
  }
  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }
  single() {
    this.wantsSingle = true;
    return this;
  }

  then<TResult1 = { data: Row[] | Row | null; error: null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: Row[] | Row | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let rows = [...(this.data[this.table] ?? [])];
    for (const [column, value] of this.filters) rows = rows.filter((row) => row[column] === value);
    for (const [column, value] of this.lowerBounds)
      rows = rows.filter((row) => String(row[column] ?? "") >= value);
    if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1);
    // Mirror PostgREST's default max-rows cap.
    rows = rows.slice(0, this.maximum ?? 1000);
    const result = { data: this.wantsSingle ? (rows[0] ?? null) : rows, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

describe("Supabase workspace reads", () => {
  it("applies the authenticated user id to every user-owned table and excludes another user's rows", async () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    const now = "2026-08-25T09:00:00.000Z";
    const data: TableData = {
      profiles: [
        { id: userA, display_name: "User A", timezone: "Asia/Kolkata", focus_target_minutes: 300 },
        { id: userB, display_name: "User B", timezone: "UTC", focus_target_minutes: 240 },
      ],
      projects: [
        { id: "project-a", user_id: userA, name: "A project", status: "active", deadline: now },
        { id: "project-b", user_id: userB, name: "B private project", status: "active", deadline: now },
      ],
      tasks: [
        {
          id: "task-a",
          user_id: userA,
          title: "A task",
          status: "planned",
          priority: "high",
          created_at: now,
        },
        {
          id: "task-b",
          user_id: userB,
          title: "B private task",
          status: "planned",
          priority: "critical",
          created_at: now,
        },
      ],
      work_sessions: [],
      inbox_items: [],
      activity_log: [],
      change_sets: [],
      calendar_blocks: [],
      habits: [],
      habit_logs: [],
    };
    const seenFilters: Array<{ table: string; column: string; value: unknown }> = [];
    const client = {
      from: (table: string) => new FakeQuery(table, data, seenFilters),
    } as unknown as SupabaseClient;

    const state = await readWorkspaceState(client, { id: userA, email: "user-a@example.test" });

    expect(state.profile.id).toBe(userA);
    expect(state.projects.map((project) => project.id)).toEqual(["project-a"]);
    expect(state.tasks.map((task) => task.id)).toEqual(["task-a"]);
    expect(JSON.stringify(state)).not.toContain("private");

    const userOwnedTables = [
      "projects",
      "tasks",
      "work_sessions",
      "inbox_items",
      "activity_log",
      "change_sets",
      "calendar_blocks",
      "habits",
      "habit_logs",
    ];
    for (const table of userOwnedTables) {
      expect(seenFilters).toContainEqual({ table, column: "user_id", value: userA });
    }
    expect(seenFilters).toContainEqual({ table: "profiles", column: "id", value: userA });
  });

  it("reads every task even when a user has more rows than one response can hold", async () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const tasks = Array.from({ length: 2500 }, (_, index) => ({
      id: `task-${index}`,
      user_id: userA,
      title: `Task ${index}`,
      status: "completed",
      priority: "low",
      created_at: "2026-08-25T09:00:00.000Z",
      completed_at: "2026-08-25T10:00:00.000Z",
    }));
    const data: TableData = {
      profiles: [{ id: userA, display_name: "User A", timezone: "UTC", focus_target_minutes: 300 }],
      projects: [],
      tasks,
      work_sessions: [],
      inbox_items: [],
      activity_log: [],
      change_sets: [],
      calendar_blocks: [],
      habits: [],
      habit_logs: [],
    };
    const client = { from: (table: string) => new FakeQuery(table, data, []) } as unknown as SupabaseClient;

    const state = await readWorkspaceState(client, { id: userA, email: "user-a@example.test" });

    expect(state.tasks).toHaveLength(2500);
    expect(new Set(state.tasks.map((task) => task.id)).size).toBe(2500);
  });
});
