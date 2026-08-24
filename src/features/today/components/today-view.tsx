"use client";

import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock3, Play, Target } from "lucide-react";
import { getProjectById, getTodayTasks } from "@/domain/queries";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { StatusPill } from "@/shared/components/ui/status-pill";
import { formatMinutes, formatTime } from "@/shared/lib/utils";

export function TodayView() {
  const { state, actions } = useWorkspace();
  const tasks = getTodayTasks(state);
  const running = state.sessions.some((session) => session.status === "running");
  const totalMinutes = tasks.reduce((sum, task) => sum + task.estimateMinutes, 0);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Today"
        title="A deliberate workday."
        description="Five defined blocks, one protected client deadline, and room to close cleanly."
        actions={<StatusPill tone="green"><CalendarCheck2 size={14} /> Plan is realistic</StatusPill>}
      />

      <section className="day-summary-strip glass-panel">
        <div><small>Scheduled</small><strong>{formatMinutes(totalMinutes)}</strong></div>
        <span />
        <div><small>Execution blocks</small><strong>{tasks.length}</strong></div>
        <span />
        <div><small>Hard deadline</small><strong>12:30 PM</strong></div>
        <div className="capacity-meter"><i style={{ width: `${Math.min(100, (totalMinutes / 480) * 100)}%` }} /></div>
      </section>

      <div className="today-layout">
        <GlassPanel className="timeline-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow"><Clock3 size={14} /> Timeline</span>
              <h2>Work the plan</h2>
            </div>
            <span className="timezone-label">Asia / Kolkata</span>
          </div>
          <div className="timeline-list">
            {tasks.map((task, index) => {
              const project = getProjectById(state, task.projectId);
              const complete = task.status === "completed";
              return (
                <article className={`timeline-item ${complete ? "is-complete" : ""}`} key={task.id}>
                  <div className="timeline-time">
                    <strong>{formatTime(task.scheduledStart)}</strong>
                    <span>{formatMinutes(task.estimateMinutes)}</span>
                  </div>
                  <div className="timeline-axis"><i />{index < tasks.length - 1 ? <span /> : null}</div>
                  <div className="timeline-content">
                    <div className="timeline-title-row">
                      <div>
                        <span className={`project-label accent-${project?.accent ?? "blue"}`}>{project?.name ?? "Personal"}</span>
                        <h3>{task.title}</h3>
                      </div>
                      <div className="timeline-actions">
                        {complete ? <CheckCircle2 size={20} /> : (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => actions.toggleTask(task.id)}>Done</Button>
                            <Button variant="secondary" size="sm" disabled={running || task.status === "blocked"} onClick={() => actions.startSession(task.id)}><Play size={13} fill="currentColor" /> Focus</Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="timeline-tags">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  </div>
                </article>
              );
            })}
          </div>
        </GlassPanel>

        <aside className="today-sidebar">
          <GlassPanel className="intent-card">
            <span className="eyebrow"><Target size={14} /> Day intent</span>
            <h2>Protect the Atlas walkthrough.</h2>
            <p>Finish the approval flow before opening lower-value operational work.</p>
            <div className="intent-rule"><span /> Client delivery before admin</div>
          </GlassPanel>
          <GlassPanel className="attention-card">
            <div className="section-heading compact-heading">
              <div><span className="eyebrow"><AlertTriangle size={14} /> Attention</span><h2>One blocker</h2></div>
            </div>
            {state.tasks.filter((task) => task.status === "blocked").map((task) => (
              <div className="blocker-item" key={task.id}>
                <strong>{task.title}</strong>
                <span>Waiting for backend response format</span>
                <Button variant="ghost" size="sm">Add follow-up</Button>
              </div>
            ))}
          </GlassPanel>
          <GlassPanel className="close-day-card">
            <small>Closing ritual · 20 min</small>
            <strong>Capture loose ends. Commit tomorrow only after review.</strong>
          </GlassPanel>
        </aside>
      </div>
    </div>
  );
}
