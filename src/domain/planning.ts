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
    ...tasks.filter((task) => task.scheduledStart && task.scheduledEnd).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      startsAt: task.scheduledStart as string,
      endsAt: task.scheduledEnd as string,
      kind: "task" as const,
      taskId: task.id,
      priority: task.priority,
    })),
    ...blocks.map((block) => ({ id: `block-${block.id}`, title: block.title, startsAt: block.startsAt, endsAt: block.endsAt, kind: block.kind })),
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
      if (new Date(items[index].startsAt) < new Date(items[comparison].endsAt) && new Date(items[index].endsAt) > new Date(items[comparison].startsAt)) {
        conflicts.add(items[index].id);
        conflicts.add(items[comparison].id);
      }
    }
  }
  return conflicts;
}

export function freeMinutesForDate(items: CalendarItem[], date: Date, startHour = 9, endHour = 19) {
  const dayStart = new Date(date); dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(date); dayEnd.setHours(endHour, 0, 0, 0);
  const intervals = itemsForDate(items, date).map((item) => ({ start: Math.max(dayStart.getTime(), new Date(item.startsAt).getTime()), end: Math.min(dayEnd.getTime(), new Date(item.endsAt).getTime()) })).filter((item) => item.end > item.start).sort((a, b) => a.start - b.start);
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

export function habitConsistency(habit: Habit, logs: HabitLog[], days = 7) {
  const values = new Map(logs.filter((log) => log.habitId === habit.id).map((log) => [log.date, log.value]));
  let completed = 0;
  const cursor = new Date();
  for (let offset = 0; offset < days; offset += 1) {
    if ((values.get(dateKey(cursor)) ?? 0) >= habit.targetValue) completed += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return Math.round((completed / days) * 100);
}
