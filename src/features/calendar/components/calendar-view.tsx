"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck2, Clock3, Plus, Sparkles, WandSparkles } from "lucide-react";
import { calendarItems, dateKey, findConflicts, freeMinutesForDate, itemsForDate, type CalendarItem } from "@/domain/planning";
import type { CalendarBlockKind } from "@/domain/models";
import { ChangeSetReview } from "@/features/changesets/components/change-set-review";
import { PageHeader } from "@/features/workspace/components/page-header";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { cn } from "@/shared/lib/utils";

type ViewMode = "day" | "week" | "month";

function startOfWeek(value: Date) {
  const result = new Date(value);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

function daysForView(selected: Date, view: ViewMode) {
  if (view === "day") return [new Date(selected)];
  if (view === "week") return Array.from({ length: 7 }, (_, index) => { const day = startOfWeek(selected); day.setDate(day.getDate() + index); return day; });
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day; });
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes ? `${minutes}m` : ""}`.trim() : `${minutes}m`;
}

function CalendarEvent({ item, conflict }: { item: CalendarItem; conflict: boolean }) {
  return (
    <div className={cn("calendar-event", `calendar-event-${item.kind}`, conflict && "has-conflict")}>
      <div>
        <strong>{item.title}</strong>
        <span>{formatTime(item.startsAt)} – {formatTime(item.endsAt)}</span>
      </div>
      {conflict ? <AlertTriangle size={13} /> : null}
    </div>
  );
}

export function CalendarView() {
  const { state, actions } = useWorkspace();
  const [view, setView] = useState<ViewMode>("week");
  const [selected, setSelected] = useState(() => new Date());
  const [taskId, setTaskId] = useState("");
  const [taskTime, setTaskTime] = useState("15:00");
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockKind, setBlockKind] = useState<CalendarBlockKind>("meeting");
  const [blockStart, setBlockStart] = useState("16:00");
  const [blockEnd, setBlockEnd] = useState("16:30");

  const allItems = useMemo(() => calendarItems(state.tasks, state.calendarBlocks), [state.tasks, state.calendarBlocks]);
  const conflicts = useMemo(() => findConflicts(allItems), [allItems]);
  const days = useMemo(() => daysForView(selected, view), [selected, view]);
  const unscheduled = state.tasks.filter((task) => task.status !== "completed" && task.status !== "blocked" && !task.scheduledStart);
  const selectedTask = unscheduled.find((task) => task.id === taskId) ?? unscheduled[0];
  const selectedKey = dateKey(selected);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowItems = itemsForDate(allItems, tomorrow);
  const activeDraft = state.changeSets.find((item) => item.status === "draft" && item.planDate === selectedKey);
  const freeMinutes = freeMinutesForDate(allItems, selected);

  function move(direction: number) {
    const next = new Date(selected);
    next.setDate(next.getDate() + direction * (view === "day" ? 1 : view === "week" ? 7 : 28));
    setSelected(next);
  }

  async function scheduleTask(event: FormEvent) {
    event.preventDefault();
    if (!selectedTask) return;
    const start = new Date(`${selectedKey}T${taskTime}:00`);
    const end = new Date(start.getTime() + selectedTask.estimateMinutes * 60000);
    await actions.scheduleTask(selectedTask.id, start.toISOString(), end.toISOString());
    setTaskId("");
  }

  async function createBlock(event: FormEvent) {
    event.preventDefault();
    if (!blockTitle.trim()) return;
    await actions.createCalendarBlock({ title: blockTitle.trim(), kind: blockKind, startsAt: new Date(`${selectedKey}T${blockStart}:00`).toISOString(), endsAt: new Date(`${selectedKey}T${blockEnd}:00`).toISOString() });
    setBlockTitle("");
    setBlockOpen(false);
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Phase 2 · planning" title="Calendar command" description="Shape the day from one trusted schedule. Draft intelligent changes, review them, then commit." actions={<Button variant="secondary" onClick={() => setBlockOpen((value) => !value)}><Plus size={15} /> Time block</Button>} />

      <GlassPanel className="calendar-command-bar">
        <div className="calendar-nav-controls">
          <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label="Previous period"><ArrowLeft size={16} /></Button>
          <Button variant="ghost" onClick={() => setSelected(new Date())}>Today</Button>
          <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label="Next period"><ArrowRight size={16} /></Button>
          <div><strong>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(selected)}</strong><span>{new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(selected)}</span></div>
        </div>
        <div className="calendar-health">
          <span><Clock3 size={14} /> {formatMinutes(freeMinutes)} free</span>
          <span className={cn(conflicts.size > 0 && "is-warning")}><AlertTriangle size={14} /> {conflicts.size ? `${conflicts.size} conflicts` : "No conflicts"}</span>
        </div>
        <div className="view-switcher">{(["day", "week", "month"] as ViewMode[]).map((mode) => <button key={mode} className={view === mode ? "is-active" : ""} onClick={() => setView(mode)}>{mode}</button>)}</div>
      </GlassPanel>

      {blockOpen ? (
        <GlassPanel className="calendar-inline-form">
          <form onSubmit={createBlock}>
            <label>Block title<input className="glass-input" value={blockTitle} onChange={(event) => setBlockTitle(event.target.value)} placeholder="Meeting, focus, personal…" autoFocus /></label>
            <label>Type<select className="glass-input" value={blockKind} onChange={(event) => setBlockKind(event.target.value as CalendarBlockKind)}><option value="meeting">Meeting</option><option value="focus">Focus</option><option value="personal">Personal</option><option value="break">Break</option></select></label>
            <label>Starts<input className="glass-input" type="time" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} /></label>
            <label>Ends<input className="glass-input" type="time" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} /></label>
            <Button type="submit">Add block</Button>
          </form>
        </GlassPanel>
      ) : null}

      <div className="calendar-layout">
        <GlassPanel className={cn("calendar-surface", `calendar-${view}`)}>
          <div className="calendar-days-grid">
            {days.map((day) => {
              const dayItems = itemsForDate(allItems, day);
              const outsideMonth = view === "month" && day.getMonth() !== selected.getMonth();
              return (
                <button key={dateKey(day)} className={cn("calendar-day", dateKey(day) === selectedKey && "is-selected", dateKey(day) === dateKey(new Date()) && "is-today", outsideMonth && "is-outside")} onClick={() => setSelected(day)}>
                  <div className="calendar-day-heading"><span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong></div>
                  <div className="calendar-day-events">{dayItems.length ? dayItems.slice(0, view === "month" ? 3 : 8).map((item) => <CalendarEvent key={item.id} item={item} conflict={conflicts.has(item.id)} />) : <span className="calendar-day-empty">Open space</span>}{view === "month" && dayItems.length > 3 ? <small>+{dayItems.length - 3} more</small> : null}</div>
                </button>
              );
            })}
          </div>
        </GlassPanel>

        <aside className="calendar-sidebar">
          <GlassPanel className="plan-actions-card">
            <span className="eyebrow"><Sparkles size={13} /> Daily plan</span>
            <h2>Build a realistic {dateKey(selected) === dateKey(new Date()) ? "day" : "plan"}.</h2>
            <p>Urgent unscheduled work is placed around existing commitments. You review every move.</p>
            <Button onClick={() => actions.generateDailyPlan(selectedKey)} disabled={!unscheduled.length || Boolean(activeDraft)}><WandSparkles size={15} /> Generate draft</Button>
            <Button variant="ghost" onClick={() => actions.rescheduleUnfinished(dateKey(tomorrow))}>Carry unfinished to tomorrow</Button>
          </GlassPanel>

          <GlassPanel className="unscheduled-card">
            <div className="section-heading"><div><span className="eyebrow">Unscheduled</span><h2>{unscheduled.length} tasks</h2></div></div>
            <div className="unscheduled-list">{unscheduled.slice(0, 6).map((task) => <button key={task.id} className={selectedTask?.id === task.id ? "is-active" : ""} onClick={() => setTaskId(task.id)}><span className={`priority-dot priority-${task.priority}`} /><div><strong>{task.title}</strong><small>{task.estimateMinutes} min · {task.priority}</small></div></button>)}</div>
            {selectedTask ? <form className="schedule-task-form" onSubmit={scheduleTask}><input className="glass-input" type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} /><Button type="submit" size="sm"><CalendarCheck2 size={14} /> Schedule</Button></form> : <p className="muted-copy">The pool is clear.</p>}
          </GlassPanel>

          <GlassPanel className="tomorrow-card">
            <span className="eyebrow">Tomorrow preview</span>
            <div className="tomorrow-heading"><strong>{new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(tomorrow)}</strong><span>{formatMinutes(freeMinutesForDate(allItems, tomorrow))} free</span></div>
            <div>{tomorrowItems.length ? tomorrowItems.slice(0, 4).map((item) => <div className="tomorrow-row" key={item.id}><span>{formatTime(item.startsAt)}</span><strong>{item.title}</strong></div>) : <p className="muted-copy">A clean slate. Plan it before the day starts.</p>}</div>
          </GlassPanel>
        </aside>
      </div>

      {activeDraft ? <ChangeSetReview changeSet={activeDraft} /> : null}
    </div>
  );
}
