import type { Habit, HabitLog, Task, WorkspaceState } from "@/domain/models";
import { calendarItems, findConflicts } from "@/domain/planning";

const OPEN_STATUSES = new Set(["inbox", "planned", "in_progress", "blocked"]);

function parts(value: Date | string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
}

export function dateInTimeZone(value: Date | string, timeZone: string) {
  const valueParts = parts(value, timeZone);
  return `${valueParts.year}-${valueParts.month}-${valueParts.day}`;
}

function minuteInTimeZone(value: string, timeZone: string) {
  const valueParts = parts(value, timeZone);
  return Number(valueParts.hour) * 60 + Number(valueParts.minute);
}

export function addDateDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function weekStartFor(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = (value.getUTCDay() + 6) % 7;
  return addDateDays(date, -day);
}

function compactTask(task: Task, projectNames: Map<string, string>) {
  return {
    id: task.id,
    title: task.title,
    project: task.projectId ? projectNames.get(task.projectId) ?? null : null,
    status: task.status,
    priority: task.priority,
    due_at: task.dueAt,
    scheduled_start: task.scheduledStart,
    scheduled_end: task.scheduledEnd,
    estimate_minutes: task.estimateMinutes,
    tags: task.tags,
  };
}

function projectMap(state: WorkspaceState) {
  return new Map(state.projects.map((project) => [project.id, project.name]));
}

function openTasks(state: WorkspaceState) {
  return state.tasks.filter((task) => OPEN_STATUSES.has(task.status));
}

function priorityRank(task: Task) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[task.priority];
}

function scheduleForDate(state: WorkspaceState, date: string) {
  const items = calendarItems(state.tasks, state.calendarBlocks)
    .filter((item) => dateInTimeZone(item.startsAt, state.profile.timezone) === date);
  const conflicts = findConflicts(items);
  return items.map((item) => ({
    id: item.id,
    type: item.kind === "task" ? "task" : "calendar_block",
    kind: item.kind,
    title: item.title,
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    duration_minutes: Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000),
    priority: item.priority ?? null,
    conflict: conflicts.has(item.id),
  }));
}

function freeTime(state: WorkspaceState, date: string) {
  const workStart = 9 * 60;
  const workEnd = 19 * 60;
  const schedule = scheduleForDate(state, date);
  const intervals = schedule.map((item) => ({
    start: Math.max(workStart, minuteInTimeZone(item.starts_at, state.profile.timezone)),
    end: Math.min(workEnd, minuteInTimeZone(item.ends_at, state.profile.timezone)),
  })).filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  const slots: Array<{ start_minute: number; end_minute: number; minutes: number }> = [];
  let cursor = workStart;
  for (const interval of merged) {
    if (interval.start > cursor) slots.push({ start_minute: cursor, end_minute: interval.start, minutes: interval.start - cursor });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < workEnd) slots.push({ start_minute: cursor, end_minute: workEnd, minutes: workEnd - cursor });
  const freeMinutes = slots.reduce((sum, slot) => sum + slot.minutes, 0);
  return { workday_minutes: workEnd - workStart, free_minutes: freeMinutes, occupied_minutes: workEnd - workStart - freeMinutes, slots: slots.filter((slot) => slot.minutes >= 15) };
}

function habitValue(habit: Habit, logs: HabitLog[], date: string) {
  return logs.find((log) => log.habitId === habit.id && log.date === date)?.value ?? 0;
}

function habitStreak(habit: Habit, logs: HabitLog[], date: string) {
  const values = new Map(logs.filter((log) => log.habitId === habit.id).map((log) => [log.date, log.value]));
  let cursor = date;
  if ((values.get(cursor) ?? 0) < habit.targetValue) cursor = addDateDays(cursor, -1);
  let streak = 0;
  while ((values.get(cursor) ?? 0) >= habit.targetValue && streak < 366) {
    streak += 1;
    cursor = addDateDays(cursor, -1);
  }
  return streak;
}

function habitConsistency(habit: Habit, logs: HabitLog[], date: string, days = 7) {
  let completed = 0;
  for (let index = 0; index < days; index += 1) {
    if (habitValue(habit, logs, addDateDays(date, -index)) >= habit.targetValue) completed += 1;
  }
  return Math.round((completed / days) * 100);
}

function habitsForDate(state: WorkspaceState, date: string) {
  return state.habits.map((habit) => {
    const value = habitValue(habit, state.habitLogs, date);
    return {
      id: habit.id,
      name: habit.name,
      metric: habit.metric,
      target: habit.targetValue,
      unit: habit.unit,
      value,
      progress: Math.min(1, value / habit.targetValue),
      complete: value >= habit.targetValue,
      streak_days: habitStreak(habit, state.habitLogs, date),
      consistency_7d: habitConsistency(habit, state.habitLogs, date),
    };
  });
}

function meta(state: WorkspaceState, now = new Date()) {
  return { as_of: now.toISOString(), timezone: state.profile.timezone };
}

export function buildOpenTasks(state: WorkspaceState, input: { priority?: Task["priority"]; projectId?: string; dueBefore?: string; includeBlocked?: boolean; limit?: number } = {}) {
  const projects = projectMap(state);
  let tasks = openTasks(state);
  if (!input.includeBlocked) tasks = tasks.filter((task) => task.status !== "blocked");
  if (input.priority) tasks = tasks.filter((task) => task.priority === input.priority);
  if (input.projectId) tasks = tasks.filter((task) => task.projectId === input.projectId);
  const dueBefore = input.dueBefore;
  if (dueBefore) tasks = tasks.filter((task) => task.dueAt && dateInTimeZone(task.dueAt, state.profile.timezone) <= dueBefore);
  tasks.sort((a, b) => priorityRank(a) - priorityRank(b) || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const total = tasks.length;
  const selected = tasks.slice(0, input.limit ?? 100);
  return {
    meta: meta(state),
    counts: {
      total,
      returned: selected.length,
      critical: tasks.filter((task) => task.priority === "critical").length,
      high: tasks.filter((task) => task.priority === "high").length,
      blocked: tasks.filter((task) => task.status === "blocked").length,
      unscheduled: tasks.filter((task) => !task.scheduledStart).length,
    },
    tasks: selected.map((task) => compactTask(task, projects)),
  };
}

export function buildProjects(state: WorkspaceState, status?: "active" | "paused" | "completed") {
  const projects = status ? state.projects.filter((project) => project.status === status) : state.projects;
  return {
    meta: meta(state),
    counts: { total: projects.length, active: projects.filter((project) => project.status === "active").length, at_risk: projects.filter((project) => project.health === "at_risk").length, blocked: projects.filter((project) => project.health === "blocked").length },
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      client: project.client || null,
      status: project.status,
      health: project.health,
      progress: project.progress,
      deadline: project.deadline,
      next_milestone: project.nextMilestone,
      open_tasks: state.tasks.filter((task) => task.projectId === project.id && OPEN_STATUSES.has(task.status)).length,
      completed_tasks: state.tasks.filter((task) => task.projectId === project.id && task.status === "completed").length,
      tracked_minutes: state.sessions
        .filter((session) => session.projectId === project.id)
        .reduce((sum, session) => sum + session.durationMinutes, 0),
    })),
  };
}

export function buildCalendarRange(state: WorkspaceState, start: string, end: string) {
  const all = calendarItems(state.tasks, state.calendarBlocks);
  const selected = all.filter((item) => {
    const date = dateInTimeZone(item.startsAt, state.profile.timezone);
    return date >= start && date <= end;
  });
  const conflicts = findConflicts(selected);
  return {
    meta: meta(state),
    range: { start, end, days: Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86400000) + 1 },
    totals: { items: selected.length, scheduled_minutes: selected.reduce((sum, item) => sum + Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000), 0), conflicts: conflicts.size },
    days: Array.from({ length: Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86400000) + 1 }, (_, index) => {
      const date = addDateDays(start, index);
      return { date, free_time: freeTime(state, date), schedule: scheduleForDate(state, date) };
    }),
  };
}

export function buildWorkSessions(state: WorkspaceState, input: { start?: string; end?: string; limit?: number } = {}) {
  const projects = projectMap(state);
  const tasks = new Map(state.tasks.map((task) => [task.id, task.title]));
  const limit = input.limit ?? 30;
  const sessions = state.sessions.filter((session) => {
    const date = dateInTimeZone(session.startedAt, state.profile.timezone);
    return (!input.start || date >= input.start) && (!input.end || date <= input.end);
  }).slice(0, limit);
  return {
    meta: meta(state),
    summary: { sessions: sessions.length, focused_minutes: sessions.reduce((sum, session) => sum + session.durationMinutes, 0), running: sessions.some((session) => session.status === "running") },
    sessions: sessions.map((session) => ({ id: session.id, task: session.taskId ? tasks.get(session.taskId) ?? null : null, project: session.projectId ? projects.get(session.projectId) ?? null : null, started_at: session.startedAt, ended_at: session.endedAt, duration_minutes: session.durationMinutes, status: session.status, outcome: session.outcome })),
  };
}

export function buildHabits(state: WorkspaceState, date: string, days: number) {
  const dates = Array.from({ length: days }, (_, index) => addDateDays(date, -(days - 1 - index)));
  return {
    meta: meta(state),
    date,
    summary: { habits: state.habits.length, complete: habitsForDate(state, date).filter((habit) => habit.complete).length, average_consistency: state.habits.length ? Math.round(state.habits.reduce((sum, habit) => sum + habitConsistency(habit, state.habitLogs, date, days), 0) / state.habits.length) : 0 },
    habits: habitsForDate(state, date).map((habit) => ({ ...habit, history: dates.map((historyDate) => ({ date: historyDate, value: habitValue(state.habits.find((item) => item.id === habit.id) as Habit, state.habitLogs, historyDate) })) })),
  };
}

export function buildActivityHistory(state: WorkspaceState, input: { since?: string; limit?: number } = {}) {
  const activity = state.activity.filter((event) => !input.since || event.occurredAt >= input.since).slice(0, input.limit ?? 50);
  return { meta: meta(state), count: activity.length, events: activity.map((event) => ({ id: event.id, type: event.type, summary: event.summary, detail: event.detail, occurred_at: event.occurredAt, actor: event.actor, source: event.source, reversible: event.undoable })) };
}

export function buildToday(state: WorkspaceState, date: string) {
  const now = new Date();
  const projects = projectMap(state);
  const tasks = openTasks(state);
  const due = tasks.filter((task) => task.dueAt && dateInTimeZone(task.dueAt, state.profile.timezone) === date);
  return {
    meta: meta(state, now),
    date,
    schedule: scheduleForDate(state, date),
    free_time: freeTime(state, date),
    tasks: {
      due: due.map((task) => compactTask(task, projects)),
      unscheduled: tasks.filter((task) => !task.scheduledStart).sort((a, b) => priorityRank(a) - priorityRank(b)).map((task) => compactTask(task, projects)),
      completed: state.tasks.filter((task) => task.completedAt && dateInTimeZone(task.completedAt, state.profile.timezone) === date).length,
    },
    habits: habitsForDate(state, date),
  };
}

export function buildWeekSummary(state: WorkspaceState, start: string) {
  const end = addDateDays(start, 6);
  const calendar = buildCalendarRange(state, start, end);
  const sessions = buildWorkSessions(state, { start, end, limit: 250 });
  const completed = state.tasks.filter((task) => task.completedAt && dateInTimeZone(task.completedAt, state.profile.timezone) >= start && dateInTimeZone(task.completedAt, state.profile.timezone) <= end);
  const habitDays = state.habits.length * 7;
  const completedHabits = state.habits.reduce(
    (sum, habit) =>
      sum +
      Array.from({ length: 7 }, (_, index) =>
        habitValue(habit, state.habitLogs, addDateDays(start, index)) >= habit.targetValue ? 1 : 0,
      ).reduce<number>((inner, value) => inner + value, 0),
    0,
  );
  return {
    meta: meta(state),
    range: { start, end },
    work: { completed_tasks: completed.length, focused_minutes: sessions.summary.focused_minutes, sessions: sessions.summary.sessions, scheduled_minutes: calendar.totals.scheduled_minutes },
    habits: { completed_checkins: completedHabits, possible_checkins: habitDays, consistency: habitDays ? Math.round((completedHabits / habitDays) * 100) : 0 },
    workload: calendar.days.map((day) => ({ date: day.date, scheduled_minutes: day.free_time.occupied_minutes, free_minutes: day.free_time.free_minutes, conflicts: day.schedule.filter((item) => item.conflict).length })),
    projects: buildProjects(state).projects.filter((project) => project.status === "active"),
  };
}

export function buildPlanningContext(state: WorkspaceState, date: string) {
  const now = new Date();
  const tomorrow = addDateDays(date, 1);
  const projects = projectMap(state);
  const tasks = openTasks(state);
  const overdue = tasks.filter((task) => task.dueAt && new Date(task.dueAt) < now && dateInTimeZone(task.dueAt, state.profile.timezone) < date);
  const dueToday = tasks.filter((task) => task.dueAt && dateInTimeZone(task.dueAt, state.profile.timezone) === date);
  const unfinished = tasks.filter((task) => task.scheduledEnd && new Date(task.scheduledEnd) < now);
  const currentSchedule = scheduleForDate(state, date);
  const currentFreeTime = freeTime(state, date);
  const habits = habitsForDate(state, date);
  const unscheduled = tasks.filter((task) => !task.scheduledStart).sort((a, b) => priorityRank(a) - priorityRank(b));
  return {
    meta: meta(state, now),
    planning_date: date,
    schedule: currentSchedule,
    free_time: currentFreeTime,
    tasks: {
      counts: { open: tasks.length, overdue: overdue.length, due_today: dueToday.length, unfinished: unfinished.length, unscheduled: unscheduled.length },
      overdue: overdue.slice(0, 50).map((task) => compactTask(task, projects)),
      due_today: dueToday.slice(0, 50).map((task) => compactTask(task, projects)),
      unfinished: unfinished.slice(0, 50).map((task) => compactTask(task, projects)),
      unscheduled: unscheduled.slice(0, 50).map((task) => compactTask(task, projects)),
      priority_counts: { critical: tasks.filter((task) => task.priority === "critical").length, high: tasks.filter((task) => task.priority === "high").length, medium: tasks.filter((task) => task.priority === "medium").length, low: tasks.filter((task) => task.priority === "low").length, blocked: tasks.filter((task) => task.status === "blocked").length },
    },
    projects: buildProjects(state).projects,
    recent_work_sessions: buildWorkSessions(state, { limit: 10 }),
    habits: { complete: habits.filter((habit) => habit.complete).length, total: habits.length, items: habits },
    workload: { scheduled_minutes: currentFreeTime.occupied_minutes, free_minutes: currentFreeTime.free_minutes, open_tasks: tasks.length, unscheduled_tasks: tasks.filter((task) => !task.scheduledStart).length, capacity_used: Math.round((currentFreeTime.occupied_minutes / currentFreeTime.workday_minutes) * 100) },
    conflicts: currentSchedule.filter((item) => item.conflict),
    draft_plans: state.changeSets.filter((changeSet) => changeSet.status === "draft").slice(0, 20).map((changeSet) => ({ id: changeSet.id, title: changeSet.title, kind: changeSet.kind ?? "general", plan_date: changeSet.planDate ?? null, operations: changeSet.operations.length })),
    tomorrow_preview: { date: tomorrow, schedule: scheduleForDate(state, tomorrow), free_time: freeTime(state, tomorrow), due_tasks: tasks.filter((task) => task.dueAt && dateInTimeZone(task.dueAt, state.profile.timezone) === tomorrow).map((task) => compactTask(task, projects)) },
  };
}
