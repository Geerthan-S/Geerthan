"use client";

import { useMemo, useState } from "react";
import { Check, Flame, Minus, Plus, Target } from "lucide-react";
import { dateKey, habitConsistency, habitProgress, habitStreak } from "@/domain/planning";
import type { Habit } from "@/domain/models";
import { PageHeader } from "@/features/workspace/components/page-header";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { cn } from "@/shared/lib/utils";

function formatValue(habit: Habit, value: number) {
  if (habit.metric === "boolean") return value >= 1 ? "Done" : "Not yet";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${habit.unit ? ` ${habit.unit}` : ""}`;
}

function stepFor(habit: Habit) {
  if (habit.metric === "duration") return 15;
  if (habit.metric === "numeric") return 0.5;
  return 1;
}

export function HabitsView() {
  const { state, actions } = useWorkspace();
  const today = dateKey(new Date());
  const [draftValues, setDraftValues] = useState<Record<string, number>>({});
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => { const day = new Date(); day.setDate(day.getDate() - 6 + index); return day; }), []);
  const completedToday = state.habits.filter((habit) => {
    const log = state.habitLogs.find((item) => item.habitId === habit.id && item.date === today);
    return habitProgress(habit, log) >= 1;
  }).length;
  const averageConsistency = state.habits.length ? Math.round(state.habits.reduce((sum, habit) => sum + habitConsistency(habit, state.habitLogs), 0) / state.habits.length) : 0;

  function valueFor(habit: Habit) {
    if (draftValues[habit.id] !== undefined) return draftValues[habit.id];
    return state.habitLogs.find((item) => item.habitId === habit.id && item.date === today)?.value ?? 0;
  }

  async function save(habit: Habit, value: number) {
    await actions.checkInHabit(habit.id, today, Math.max(0, value));
    setDraftValues((current) => { const next = { ...current }; delete next[habit.id]; return next; });
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Phase 2 · consistency" title="Daily habits" description="Small promises, measured honestly. Check in once and keep the record in your Personal OS." />

      <div className="habit-summary-grid">
        <GlassPanel><Target size={18} /><div><strong>{completedToday}/{state.habits.length}</strong><span>complete today</span></div></GlassPanel>
        <GlassPanel><Flame size={18} /><div><strong>{Math.max(0, ...state.habits.map((habit) => habitStreak(habit, state.habitLogs)))}</strong><span>best current streak</span></div></GlassPanel>
        <GlassPanel><Check size={18} /><div><strong>{averageConsistency}%</strong><span>7-day consistency</span></div></GlassPanel>
      </div>

      <GlassPanel className="habit-checkin-panel">
        <div className="habit-checkin-heading"><div><span className="eyebrow">Today · {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date())}</span><h2>Daily check-in</h2></div><span>{completedToday === state.habits.length ? "Day complete" : `${state.habits.length - completedToday} remaining`}</span></div>
        <div className="habit-card-grid">
          {state.habits.map((habit) => {
            const value = valueFor(habit);
            const progress = Math.min(100, Math.round((value / habit.targetValue) * 100));
            const currentLog = state.habitLogs.find((item) => item.habitId === habit.id && item.date === today);
            return (
              <article className={cn("habit-card", `habit-${habit.accent}`, progress >= 100 && "is-complete")} key={habit.id}>
                <div className="habit-card-top"><span className="habit-icon"><Check size={15} /></span><div><strong>{habit.name}</strong><small>{habit.description}</small></div><span className="habit-streak"><Flame size={12} /> {habitStreak(habit, state.habitLogs)}</span></div>
                <div className="habit-progress-track"><i style={{ width: `${progress}%` }} /></div>
                <div className="habit-value-row"><div><strong>{formatValue(habit, value)}</strong><small>Target {formatValue(habit, habit.targetValue)}</small></div>
                  {habit.metric === "boolean" ? <Button size="sm" variant={value >= 1 ? "secondary" : "primary"} onClick={() => save(habit, value >= 1 ? 0 : 1)}>{value >= 1 ? "Undo" : "Complete"}</Button> : <div className="habit-stepper"><button onClick={() => setDraftValues((current) => ({ ...current, [habit.id]: Math.max(0, value - stepFor(habit)) }))}><Minus size={14} /></button><input aria-label={`${habit.name} value`} type="number" step={stepFor(habit)} value={value} onChange={(event) => setDraftValues((current) => ({ ...current, [habit.id]: Number(event.target.value) }))} /><button onClick={() => setDraftValues((current) => ({ ...current, [habit.id]: value + stepFor(habit) }))}><Plus size={14} /></button><Button size="sm" onClick={() => save(habit, value)} disabled={currentLog?.value === value}>Save</Button></div>}
                </div>
              </article>
            );
          })}
        </div>
      </GlassPanel>

      <GlassPanel className="habit-consistency-panel">
        <div className="section-heading"><div><span className="eyebrow">Last seven days</span><h2>Consistency, not perfection</h2></div></div>
        <div className="habit-week-table">
          <div className="habit-week-header"><span>Habit</span>{week.map((day) => <span key={dateKey(day)}>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(day)}<small>{day.getDate()}</small></span>)}<span>Rate</span></div>
          {state.habits.map((habit) => <div className="habit-week-row" key={habit.id}><strong>{habit.name}</strong>{week.map((day) => { const log = state.habitLogs.find((item) => item.habitId === habit.id && item.date === dateKey(day)); const progress = habitProgress(habit, log); return <span key={dateKey(day)} className={cn(progress >= 1 && "is-done", progress > 0 && progress < 1 && "is-partial")} title={log ? formatValue(habit, log.value) : "No check-in"}>{progress >= 1 ? <Check size={13} /> : progress > 0 ? Math.round(progress * 100) : "·"}</span>; })}<strong>{habitConsistency(habit, state.habitLogs)}%</strong></div>)}
        </div>
      </GlassPanel>
    </div>
  );
}
