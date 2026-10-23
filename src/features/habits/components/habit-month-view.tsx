"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  addDays,
  addMonths,
  dailyHabitCompletion,
  dateFromKey,
  daysInMonth,
  habitMonthRate,
  monthKey,
} from "@/domain/planning";
import type { Habit, HabitLog } from "@/domain/models";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { cn } from "@/shared/lib/utils";

const OLDEST_EDITABLE_DAYS = 366;

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(dateFromKey(`${month}-01`));
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(
    dateFromKey(date),
  );
}

interface EditingCell {
  habit: Habit;
  date: string;
  value: number;
}

export function HabitMonthView({ today }: { today: string }) {
  const { state, actions, history } = useWorkspace();
  const [month, setMonth] = useState(() => monthKey(today));
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => daysInMonth(month), [month]);
  const oldestEditable = addDays(today, -OLDEST_EDITABLE_DAYS);

  useEffect(() => {
    let active = true;
    history
      .loadHabitLogs(dates[0], dates[dates.length - 1])
      .then((loaded) => {
        if (active) {
          setLogs(loaded);
          setLoadError("");
        }
      })
      .catch(() => active && setLoadError("This month's check-ins couldn't be loaded."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // Today's check-ins also arrive through the workspace state, so refresh when it changes.
  }, [dates, history, state.habitLogs]);

  // On narrow screens, open the grid scrolled to today rather than the 1st.
  useEffect(() => {
    const container = scroller.current;
    const todayCell = container?.querySelector<HTMLElement>("thead th.is-today");
    if (container && todayCell) {
      container.scrollLeft = Math.max(0, todayCell.offsetLeft - container.clientWidth / 2);
    }
  }, [month, loading]);

  const values = useMemo(() => new Map(logs.map((log) => [`${log.habitId}:${log.date}`, log.value])), [logs]);
  const completion = useMemo(
    () => dailyHabitCompletion(state.habits, logs, dates),
    [state.habits, logs, dates],
  );
  const elapsed = completion.filter((day) => day.date <= today);
  const monthRate = elapsed.length
    ? Math.round((elapsed.reduce((sum, day) => sum + day.rate, 0) / elapsed.length) * 100)
    : 0;
  const perfectDays = elapsed.filter((day) => state.habits.length && day.rate === 1).length;

  // A saved check-in refreshes the workspace state, which reloads this month above.
  function save(habit: Habit, date: string, value: number) {
    return actions.checkInHabit(habit.id, date, Math.max(0, value));
  }

  function editable(date: string) {
    return date <= today && date >= oldestEditable;
  }

  function onCellClick(habit: Habit, date: string) {
    if (!editable(date)) return;
    const value = values.get(`${habit.id}:${date}`) ?? 0;
    if (habit.metric === "boolean") void save(habit, date, value >= 1 ? 0 : 1);
    else setEditing({ habit, date, value });
  }

  if (!state.habits.length) return null;

  return (
    <div className="page-stack">
      <GlassPanel className="habit-month-panel">
        <div className="habit-month-toolbar">
          <div>
            <span className="eyebrow">Monthly tracker</span>
            <h2>{formatMonth(month)}</h2>
          </div>
          <div className="habit-month-nav">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => {
                setLoading(true);
                setMonth((current) => addMonths(current, -1));
              }}
            >
              <ChevronLeft size={18} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={month === monthKey(today)}
              onClick={() => {
                setLoading(true);
                setMonth(monthKey(today));
              }}
            >
              This month
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              disabled={month >= monthKey(today)}
              onClick={() => {
                setLoading(true);
                setMonth((current) => addMonths(current, 1));
              }}
            >
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>

        <div className="habit-month-stats">
          <span>
            <strong>{monthRate}%</strong> of habits completed
          </span>
          <span>
            <strong>{perfectDays}</strong> perfect {perfectDays === 1 ? "day" : "days"}
          </span>
        </div>

        <div
          className="habit-daily-chart"
          role="img"
          aria-label={`Daily completion for ${formatMonth(month)}`}
        >
          {completion.map((day) => (
            <div
              key={day.date}
              className={cn(
                "habit-daily-bar",
                day.date > today && "is-future",
                day.date === today && "is-today",
              )}
              title={`${formatDay(day.date)}: ${day.completed}/${state.habits.length}`}
            >
              <i style={{ height: `${Math.round(day.rate * 100)}%` }} />
              <small>{Number(day.date.slice(8))}</small>
            </div>
          ))}
        </div>

        {loadError ? <p className="workspace-error">{loadError}</p> : null}

        <div ref={scroller} className={cn("habit-month-scroll", loading && "is-loading")} aria-busy={loading}>
          <table className="habit-month-table">
            <caption className="sr-only">Habit check-ins for {formatMonth(month)}</caption>
            <thead>
              <tr>
                <th scope="col" className="habit-month-name">
                  Habit
                </th>
                {dates.map((date) => (
                  <th
                    scope="col"
                    key={date}
                    className={cn(date === today && "is-today", date > today && "is-future")}
                  >
                    <small>
                      {new Intl.DateTimeFormat("en", { weekday: "narrow" }).format(dateFromKey(date))}
                    </small>
                    {Number(date.slice(8))}
                  </th>
                ))}
                <th scope="col" className="habit-month-rate">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {state.habits.map((habit) => (
                <tr key={habit.id} className={`habit-${habit.accent}`}>
                  <th scope="row" className="habit-month-name">
                    {habit.name}
                  </th>
                  {dates.map((date) => {
                    const value = values.get(`${habit.id}:${date}`) ?? 0;
                    const progress = Math.min(1, value / habit.targetValue);
                    const label = `${habit.name}, ${formatDay(date)}: ${
                      progress >= 1 ? "done" : value > 0 ? `${value} of ${habit.targetValue}` : "not done"
                    }`;
                    return (
                      <td key={date}>
                        <button
                          type="button"
                          className={cn(
                            "habit-cell",
                            progress >= 1 && "is-done",
                            progress > 0 && progress < 1 && "is-partial",
                            date === today && "is-today",
                          )}
                          disabled={!editable(date)}
                          aria-label={label}
                          aria-pressed={habit.metric === "boolean" ? progress >= 1 : undefined}
                          title={label}
                          onClick={() => onCellClick(habit, date)}
                        >
                          {progress >= 1 ? <Check size={12} strokeWidth={3} /> : progress > 0 ? "·" : null}
                        </button>
                      </td>
                    );
                  })}
                  <td className="habit-month-rate">
                    {Math.round(habitMonthRate(habit, logs, dates, today) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="habit-month-hint">
          Tap a day to tick it. Past days can be filled in for up to a year; future days stay locked.
        </p>
      </GlassPanel>

      <CheckInDialog
        cell={editing}
        onClose={() => setEditing(null)}
        onSave={async (value) => {
          if (editing && (await save(editing.habit, editing.date, value))) setEditing(null);
        }}
      />
    </div>
  );
}

function CheckInDialog({
  cell,
  onClose,
  onSave,
}: {
  cell: EditingCell | null;
  onClose: () => void;
  onSave: (value: number) => Promise<void>;
}) {
  if (!cell) return null;
  return <CheckInForm key={`${cell.habit.id}:${cell.date}`} cell={cell} onClose={onClose} onSave={onSave} />;
}

function CheckInForm({
  cell,
  onClose,
  onSave,
}: {
  cell: EditingCell;
  onClose: () => void;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(cell.value || ""));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) await onSave(parsed);
  }

  return (
    <Dialog open onClose={onClose} eyebrow={formatDay(cell.date)} title={cell.habit.name}>
      <form onSubmit={submit}>
        <label className="field-label" htmlFor="checkin-value">
          Value{" "}
          <span>
            target {cell.habit.targetValue}
            {cell.habit.unit ? ` ${cell.habit.unit}` : ""}
          </span>
        </label>
        <input
          id="checkin-value"
          className="glass-input"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={() => onSave(0)}>
            Clear
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
