import type { CalendarBlock, Habit, HabitLog, Task } from "@/domain/models";

export interface CalendarItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  kind: "task" | CalendarBlock["kind"];
  taskId?: string;
  priority?: Task["priority"];
}

export function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarItems(tasks: Task[], blocks: CalendarBlock[]): CalendarItem[] {
  return [
    ...tasks
      .filter((task) => task.scheduledStart && task.scheduledEnd)
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        startsAt: task.scheduledStart as string,
        endsAt: task.scheduledEnd as string,
        kind: "task" as const,
        taskId: task.id,
        priority: task.priority,
      })),
    ...blocks.map((block) => ({
      id: `block-${block.id}`,
      title: block.title,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      kind: block.kind,
    })),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function itemsForDate(items: CalendarItem[], date: Date) {
  const key = dateKey(date);
  return items.filter((item) => dateKey(new Date(item.startsAt)) === key);
}

export function findConflicts(items: CalendarItem[]) {
  const conflicts = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    for (let comparison = index + 1; comparison < items.length; comparison += 1) {
      if (
        new Date(items[index].startsAt) < new Date(items[comparison].endsAt) &&
        new Date(items[index].endsAt) > new Date(items[comparison].startsAt)
      ) {
        conflicts.add(items[index].id);
        conflicts.add(items[comparison].id);
      }
    }
  }
  return conflicts;
}

export function freeMinutesForDate(items: CalendarItem[], date: Date, startHour = 9, endHour = 19) {
  const dayStart = new Date(date);
  dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, 0, 0, 0);
  const intervals = itemsForDate(items, date)
    .map((item) => ({
      start: Math.max(dayStart.getTime(), new Date(item.startsAt).getTime()),
      end: Math.min(dayEnd.getTime(), new Date(item.endsAt).getTime()),
    }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);
  let occupied = 0;
  let cursor = dayStart.getTime();
  for (const interval of intervals) {
    if (interval.end <= cursor) continue;
    occupied += interval.end - Math.max(cursor, interval.start);
    cursor = Math.max(cursor, interval.end);
  }
  return Math.max(0, Math.round((dayEnd.getTime() - dayStart.getTime() - occupied) / 60000));
}

export function habitProgress(habit: Habit, log?: HabitLog) {
  if (!log) return 0;
  return Math.min(1, log.value / habit.targetValue);
}

export function habitStreak(habit: Habit, logs: HabitLog[], from = new Date()) {
  const values = new Map(logs.filter((log) => log.habitId === habit.id).map((log) => [log.date, log.value]));
  let streak = 0;
  const cursor = new Date(from);
  if ((values.get(dateKey(cursor)) ?? 0) < habit.targetValue) cursor.setDate(cursor.getDate() - 1);
  while ((values.get(dateKey(cursor)) ?? 0) >= habit.targetValue) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function habitConsistency(habit: Habit, logs: HabitLog[], days = 7, from = new Date()) {
  const values = new Map(logs.filter((log) => log.habitId === habit.id).map((log) => [log.date, log.value]));
  let completed = 0;
  const cursor = new Date(from);
  for (let offset = 0; offset < days; offset += 1) {
    if ((values.get(dateKey(cursor)) ?? 0) >= habit.targetValue) completed += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return Math.round((completed / days) * 100);
}

/** The calendar date (YYYY-MM-DD) it currently is in the given IANA timezone. */
export function todayKey(timeZone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return dateKey(now);
  }
}

/** A local Date at noon for a YYYY-MM-DD key, safe to step through day by day across DST changes. */
export function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(key: string, days: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/** "YYYY-MM" for the month containing a YYYY-MM-DD key. */
export function monthKey(key: string) {
  return key.slice(0, 7);
}

export function addMonths(month: string, months: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + months, 1, 12);
  return dateKey(date).slice(0, 7);
}

/** Every YYYY-MM-DD key in a "YYYY-MM" month. */
export function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

/** Share of habits (0–1) that met their target on each date. */
export function dailyHabitCompletion(habits: Habit[], logs: HabitLog[], dates: string[]) {
  const values = new Map(logs.map((log) => [`${log.habitId}:${log.date}`, log.value]));
  return dates.map((date) => {
    if (!habits.length) return { date, completed: 0, rate: 0 };
    const completed = habits.filter(
      (habit) => (values.get(`${habit.id}:${date}`) ?? 0) >= habit.targetValue,
    ).length;
    return { date, completed, rate: completed / habits.length };
  });
}

/** Share of days (0–1) a habit met its target, counting only days up to and including today. */
export function habitMonthRate(habit: Habit, logs: HabitLog[], dates: string[], today: string) {
  const elapsed = dates.filter((date) => date <= today);
  if (!elapsed.length) return 0;
  const values = new Map(logs.filter((log) => log.habitId === habit.id).map((log) => [log.date, log.value]));
  return elapsed.filter((date) => (values.get(date) ?? 0) >= habit.targetValue).length / elapsed.length;
}
