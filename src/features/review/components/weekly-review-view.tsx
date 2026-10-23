"use client";

import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Lightbulb, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, dateFromKey, todayKey } from "@/domain/planning";
import { weekStartFor, weeklyReview } from "@/domain/weekly-review";
import { PageHeader } from "@/features/workspace/components/page-header";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { cn, formatMinutes } from "@/shared/lib/utils";

// Habit history in the workspace covers about 90 days.
const OLDEST_WEEK_OFFSET = 11;

function formatRange(start: string, end: string) {
  const format = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  return `${format.format(dateFromKey(start))} – ${format.format(dateFromKey(end))}`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function Change({
  current,
  previous,
  unit,
}: {
  current: number;
  previous: number;
  unit: "percent" | "count" | "minutes";
}) {
  const delta = unit === "percent" ? Math.round((current - previous) * 100) : current - previous;
  if (delta === 0 || (current === 0 && previous === 0)) {
    return (
      <span className="review-change is-flat">
        <Minus size={12} /> same as last week
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={cn("review-change", up ? "is-up" : "is-down")}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {up ? "+" : "−"}
      {unit === "minutes" ? formatMinutes(Math.abs(delta)) : Math.abs(delta)}
      {unit === "percent" ? " pts" : ""} vs last week
    </span>
  );
}

export function WeeklyReviewView() {
  const { state } = useWorkspace();
  const today = todayKey(state.profile.timezone);
  const thisWeek = weekStartFor(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const oldest = addDays(thisWeek, -7 * OLDEST_WEEK_OFFSET);
  const review = useMemo(() => weeklyReview(state, weekStart, today), [state, weekStart, today]);
  const { current, previous } = review;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Weekly review"
        title={review.inProgress ? "Your week so far" : "How your week went"}
        description="Habits, focus and finished work compared with the week before, plus one thing to change."
      />

      <div className="review-week-nav">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous week"
          disabled={weekStart <= oldest}
          onClick={() => setWeekStart((value) => addDays(value, -7))}
        >
          <ChevronLeft size={18} />
        </Button>
        <strong>{formatRange(review.weekStart, review.weekEnd)}</strong>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next week"
          disabled={weekStart >= thisWeek}
          onClick={() => setWeekStart((value) => addDays(value, 7))}
        >
          <ChevronRight size={18} />
        </Button>
        {review.inProgress ? (
          <span className="review-week-note">
            {review.elapsedDays} of 7 days so far, compared with the same days last week
          </span>
        ) : null}
      </div>

      <GlassPanel className="review-suggestion">
        <Lightbulb size={18} />
        <div>
          <span className="eyebrow">One thing to change</span>
          <p>{review.suggestion}</p>
        </div>
      </GlassPanel>

      <div className="review-stats">
        <GlassPanel>
          <span>Habits completed</span>
          <strong>{percent(current.habitRate)}</strong>
          <Change current={current.habitRate} previous={previous.habitRate} unit="percent" />
        </GlassPanel>
        <GlassPanel>
          <span>Focus time</span>
          <strong>{formatMinutes(current.focusMinutes)}</strong>
          <Change current={current.focusMinutes} previous={previous.focusMinutes} unit="minutes" />
        </GlassPanel>
        <GlassPanel>
          <span>Tasks finished</span>
          <strong>{current.tasksCompleted}</strong>
          <Change current={current.tasksCompleted} previous={previous.tasksCompleted} unit="count" />
        </GlassPanel>
        <GlassPanel>
          <span>Planned tasks done</span>
          <strong>
            {current.plannedCompleted}/{current.tasksPlanned}
          </strong>
          <span className="review-change is-flat">
            {current.tasksPlanned
              ? percent(current.plannedCompleted / current.tasksPlanned)
              : "nothing scheduled"}
          </span>
        </GlassPanel>
      </div>

      <GlassPanel className="review-days">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Day by day</span>
            <h2>
              {review.bestDay
                ? `Best day: ${new Intl.DateTimeFormat("en", { weekday: "long" }).format(dateFromKey(review.bestDay.date))}`
                : "No tracked days yet"}
            </h2>
          </div>
        </div>
        <div className="review-day-bars" role="img" aria-label="Habit completion for each day of the week">
          {review.days.map((day) => (
            <div key={day.date} className={cn(day.date === review.bestDay?.date && "is-best")}>
              <div className="review-day-track">
                <i style={{ height: `${Math.round(day.habitRate * 100)}%` }} />
              </div>
              <small>
                {new Intl.DateTimeFormat("en", { weekday: "short" }).format(dateFromKey(day.date))}
              </small>
              <span>
                {day.focusMinutes ? formatMinutes(day.focusMinutes) : "—"} · {day.tasksCompleted} done
              </span>
            </div>
          ))}
        </div>
      </GlassPanel>

      {review.habits.length ? (
        <GlassPanel className="review-habits">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Habits</span>
              <h2>This week against last week</h2>
            </div>
          </div>
          <ul>
            {[...review.habits]
              .sort((a, b) => a.rate - b.rate)
              .map((item) => (
                <li key={item.habit.id} className={`habit-${item.habit.accent}`}>
                  <span className="habit-manage-dot" aria-hidden />
                  <strong>{item.habit.name}</strong>
                  <span>
                    {item.completedDays}/{item.elapsedDays} days
                  </span>
                  <div className="review-habit-bar" aria-hidden>
                    <i style={{ width: percent(item.rate) }} />
                  </div>
                  <Change current={item.rate} previous={item.previousRate} unit="percent" />
                </li>
              ))}
          </ul>
        </GlassPanel>
      ) : null}
    </div>
  );
}
