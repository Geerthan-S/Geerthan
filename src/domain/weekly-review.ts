import type { Habit, WorkspaceState } from "@/domain/models";
import { addDays, dateFromKey, todayKey } from "@/domain/planning";

export interface HabitWeek {
  habit: Habit;
  completedDays: number;
  elapsedDays: number;
  rate: number;
  previousRate: number;
}

export interface ReviewDay {
  date: string;
  habitRate: number;
  focusMinutes: number;
  tasksCompleted: number;
}

export interface WeekTotals {
  habitRate: number;
  focusMinutes: number;
  tasksCompleted: number;
  tasksPlanned: number;
  plannedCompleted: number;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  elapsedDays: number;
  inProgress: boolean;
  current: WeekTotals;
  previous: WeekTotals;
  days: ReviewDay[];
  habits: HabitWeek[];
  bestDay: ReviewDay | null;
  suggestion: string;
}

/** Monday (YYYY-MM-DD) of the ISO week containing a date key. */
export function weekStartFor(key: string) {
  const day = dateFromKey(key).getDay();
  return addDays(key, -((day + 6) % 7));
}

function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function ratio(part: number, whole: number) {
  return whole ? part / whole : 0;
}

/** Shortened to the days that have happened, so a week in progress isn't penalised for the future. */
function totalsFor(state: WorkspaceState, dates: string[], dayOf: (iso: string) => string) {
  const inWeek = new Set(dates);
  const values = new Map(state.habitLogs.map((log) => [`${log.habitId}:${log.date}`, log.value]));
  const possible = state.habits.length * dates.length;
  const met = dates.reduce(
    (sum, date) =>
      sum +
      state.habits.filter((habit) => (values.get(`${habit.id}:${date}`) ?? 0) >= habit.targetValue).length,
    0,
  );
  const completed = state.tasks.filter((task) => task.completedAt && inWeek.has(dayOf(task.completedAt)));
  const planned = state.tasks.filter((task) => task.scheduledStart && inWeek.has(dayOf(task.scheduledStart)));
  return {
    habitRate: ratio(met, possible),
    focusMinutes: state.sessions
      .filter((session) => session.status === "completed" && inWeek.has(dayOf(session.startedAt)))
      .reduce((sum, session) => sum + session.durationMinutes, 0),
    tasksCompleted: completed.length,
    tasksPlanned: planned.length,
    plannedCompleted: planned.filter((task) => task.status === "completed").length,
  };
}

function habitWeek(state: WorkspaceState, habit: Habit, dates: string[], previousDates: string[]): HabitWeek {
  const values = new Map(
    state.habitLogs.filter((log) => log.habitId === habit.id).map((log) => [log.date, log.value]),
  );
  const met = (date: string) => (values.get(date) ?? 0) >= habit.targetValue;
  const completedDays = dates.filter(met).length;
  return {
    habit,
    completedDays,
    elapsedDays: dates.length,
    rate: ratio(completedDays, dates.length),
    previousRate: ratio(previousDates.filter(met).length, previousDates.length),
  };
}

function suggestionFor(review: Omit<WeeklyReview, "suggestion">) {
  if (!review.habits.length && !review.current.tasksCompleted && !review.current.focusMinutes) {
    return "Nothing was tracked this week. Add one small habit and plan one focus block for next week.";
  }
  const weakest = [...review.habits].sort((a, b) => a.rate - b.rate)[0];
  if (weakest && weakest.rate < 0.5) {
    const days = `${weakest.completedDays} of ${weakest.elapsedDays} day${weakest.elapsedDays === 1 ? "" : "s"}`;
    return weakest.habit.reminderTime
      ? `"${weakest.habit.name}" happened on ${days}. Make it smaller for next week so it fits a busy day.`
      : `"${weakest.habit.name}" happened on ${days}. Give it a reminder at a time you're usually free.`;
  }
  const { current, previous } = review;
  if (previous.focusMinutes >= 60 && current.focusMinutes < previous.focusMinutes * 0.75) {
    return "Focus time dropped from last week. Put one deep-work block in your calendar each weekday morning.";
  }
  if (current.tasksPlanned >= 3 && ratio(current.plannedCompleted, current.tasksPlanned) < 0.6) {
    return "Fewer than 60% of planned tasks got done. Plan fewer tasks per day next week and protect the top one.";
  }
  return "A solid week. Keep the same plan, and raise one habit target slightly.";
}

/**
 * Summarises one Monday–Sunday week against the week before it. Dates are
 * the user's local dates; "today" bounds a week still in progress.
 */
export function weeklyReview(state: WorkspaceState, weekStart: string, today: string): WeeklyReview {
  const dayOf = (iso: string) => todayKey(state.profile.timezone, new Date(iso));
  const allDates = weekDates(weekStart);
  const dates = allDates.filter((date) => date <= today);
  const previousDates = weekDates(addDays(weekStart, -7)).slice(0, Math.max(dates.length, 1));
  const habitValues = new Map(state.habitLogs.map((log) => [`${log.habitId}:${log.date}`, log.value]));

  const days = dates.map((date) => {
    const single = totalsFor(state, [date], dayOf);
    return {
      date,
      habitRate: ratio(
        state.habits.filter((habit) => (habitValues.get(`${habit.id}:${date}`) ?? 0) >= habit.targetValue)
          .length,
        state.habits.length,
      ),
      focusMinutes: single.focusMinutes,
      tasksCompleted: single.tasksCompleted,
    };
  });

  const bestDay = days.reduce<ReviewDay | null>((best, day) => {
    const score = day.habitRate * 100 + day.focusMinutes / 10 + day.tasksCompleted * 5;
    const bestScore = best ? best.habitRate * 100 + best.focusMinutes / 10 + best.tasksCompleted * 5 : 0;
    return score > bestScore ? day : best;
  }, null);

  const review = {
    weekStart,
    weekEnd: allDates[6],
    elapsedDays: dates.length,
    inProgress: dates.length < 7,
    current: totalsFor(state, dates, dayOf),
    // Compare like with like: the same number of days from the previous week.
    previous: totalsFor(state, previousDates, dayOf),
    days,
    habits: state.habits.map((habit) => habitWeek(state, habit, dates, previousDates)),
    bestDay,
  };
  return { ...review, suggestion: suggestionFor(review) };
}
