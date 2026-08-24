"use client";

import { Clock3, Play, Square, Target, TimerReset, Zap } from "lucide-react";
import { getActiveTasks, getFocusedMinutesToday, getProjectById } from "@/domain/queries";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { StatusPill } from "@/shared/components/ui/status-pill";
import { formatMinutes, formatShortDate, formatTime } from "@/shared/lib/utils";

export function SessionsView() {
  const { state, actions } = useWorkspace();
  const running = state.sessions.find((session) => session.status === "running");
  const runningTask = state.tasks.find((task) => task.id === running?.taskId);
  const todayMinutes = getFocusedMinutesToday(state);
  const weekMinutes = state.sessions.filter((session) => session.status === "completed").reduce((sum, session) => sum + session.durationMinutes, 0);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Work sessions" title="Measure attention, not presence." description="Attach focused time to real work and leave a useful outcome when you stop." />

      <div className="focus-layout">
        <GlassPanel className="focus-console">
          {running && runningTask ? (
            <>
              <div className="focus-state"><span className="focus-pulse" /> Session in progress</div>
              <span className="focus-project">{getProjectById(state, runningTask.projectId)?.name ?? "Personal"}</span>
              <h1>{runningTask.title}</h1>
              <div className="focus-clock">Focused now</div>
              <p>Stay with the current block. Capture interruptions; do not switch silently.</p>
              <Button className="stop-session-button" onClick={() => actions.stopSession("Completed the planned focus block.")}><Square size={15} fill="currentColor" /> Finish and log</Button>
            </>
          ) : (
            <>
              <span className="eyebrow"><Zap size={14} /> Ready when you are</span>
              <h1>Choose one clear outcome.</h1>
              <p>Starting a session marks the task in progress and records the time against its project.</p>
              <div className="focus-task-options">
                {getActiveTasks(state).filter((task) => task.status !== "blocked").slice(0, 4).map((task) => (
                  <button key={task.id} onClick={() => actions.startSession(task.id)}>
                    <span><small>{getProjectById(state, task.projectId)?.name ?? "Personal"}</small><strong>{task.title}</strong></span>
                    <Play size={17} fill="currentColor" />
                  </button>
                ))}
              </div>
            </>
          )}
        </GlassPanel>

        <div className="focus-stats">
          <GlassPanel className="focus-stat"><TimerReset size={19} /><span>Today</span><strong>{formatMinutes(todayMinutes)}</strong><small>of {formatMinutes(state.profile.focusTargetMinutes)}</small></GlassPanel>
          <GlassPanel className="focus-stat"><Target size={19} /><span>This week</span><strong>{formatMinutes(weekMinutes)}</strong><small>across {state.sessions.filter((s) => s.status === "completed").length} sessions</small></GlassPanel>
          <GlassPanel className="focus-stat"><Clock3 size={19} /><span>Average</span><strong>{formatMinutes(Math.round(weekMinutes / Math.max(1, state.sessions.filter((s) => s.status === "completed").length)))}</strong><small>per finished session</small></GlassPanel>
        </div>
      </div>

      <GlassPanel className="session-history-card">
        <div className="section-heading"><div><span className="eyebrow"><TimerReset size={14} /> Record</span><h2>Recent sessions</h2></div><StatusPill tone="neutral">Local timezone</StatusPill></div>
        <div className="session-list">
          {state.sessions.filter((session) => session.status === "completed").map((session) => {
            const task = state.tasks.find((item) => item.id === session.taskId);
            const project = getProjectById(state, session.projectId);
            return (
              <div className="session-row" key={session.id}>
                <div className="session-date"><strong>{formatShortDate(session.startedAt)}</strong><span>{formatTime(session.startedAt)}</span></div>
                <span className={`project-monogram accent-${project?.accent ?? "blue"}`}>{project?.code ?? "PER"}</span>
                <div className="session-main"><strong>{task?.title ?? "Independent work session"}</strong><span>{session.outcome}</span></div>
                <strong className="session-duration">{formatMinutes(session.durationMinutes)}</strong>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}
