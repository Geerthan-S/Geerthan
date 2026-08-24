"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FolderKanban,
  Inbox,
  Play,
  Sparkles,
  TimerReset,
} from "lucide-react";
import {
  getActiveTasks,
  getFocusedMinutesToday,
  getTodayTasks,
} from "@/domain/queries";
import { ChangeSetReview } from "@/features/changesets/components/change-set-review";
import { TaskRow } from "@/features/tasks/components/task-row";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { formatMinutes, formatShortDate } from "@/shared/lib/utils";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function relativeTime(value: string) {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

export function DashboardView() {
  const { state, actions } = useWorkspace();
  const todayTasks = getTodayTasks(state);
  const activeTasks = getActiveTasks(state);
  const focusMinutes = getFocusedMinutesToday(state);
  const target = state.profile.focusTargetMinutes;
  const draft = state.changeSets.find((changeSet) => changeSet.status === "draft");
  const running = state.sessions.find((session) => session.status === "running");
  const runningTask = state.tasks.find((task) => task.id === running?.taskId);
  const completedToday = state.tasks.filter(
    (task) => task.completedAt && new Date(task.completedAt).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <div className="page-stack dashboard-page">
      <PageHeader
        eyebrow="Work command"
        title={`${greeting()}, ${state.profile.name}.`}
        description="Keep the day small: protect the deadline, finish the active block, then reassess."
        actions={
          <Link href="/today"><Button><Sparkles size={15} /> Open today</Button></Link>
        }
      />

      <section className="metric-grid" aria-label="Work summary">
        <GlassPanel className="metric-card">
          <span className="metric-icon"><TimerReset size={18} /></span>
          <div><small>Focused today</small><strong>{formatMinutes(focusMinutes)}</strong></div>
          <span className="metric-context">of {formatMinutes(target)}</span>
        </GlassPanel>
        <GlassPanel className="metric-card">
          <span className="metric-icon"><CheckCircle2 size={18} /></span>
          <div><small>Finished</small><strong>{completedToday}</strong></div>
          <span className="metric-context">{activeTasks.length} open</span>
        </GlassPanel>
        <GlassPanel className="metric-card">
          <span className="metric-icon"><FolderKanban size={18} /></span>
          <div><small>Active projects</small><strong>{state.projects.filter((p) => p.status === "active").length}</strong></div>
          <span className="metric-context">1 needs attention</span>
        </GlassPanel>
        <GlassPanel className="metric-card">
          <span className="metric-icon"><Inbox size={18} /></span>
          <div><small>Inbox</small><strong>{state.inbox.filter((item) => !item.triaged).length}</strong></div>
          <Link className="metric-link" href="/inbox">Triage <ArrowRight size={13} /></Link>
        </GlassPanel>
      </section>

      {running && runningTask ? (
        <GlassPanel className="running-focus-banner">
          <div className="running-orb"><Play size={18} fill="currentColor" /></div>
          <div>
            <span className="eyebrow">Focus session running</span>
            <h2>{runningTask.title}</h2>
            <p>Started {relativeTime(running.startedAt)} · stay with this until the next clear stopping point.</p>
          </div>
          <Button variant="secondary" onClick={() => actions.stopSession("Made focused progress.")}>Finish session</Button>
        </GlassPanel>
      ) : null}

      <div className="dashboard-grid">
        <GlassPanel className="today-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow"><Clock3 size={14} /> Today</span>
              <h2>Your execution queue</h2>
            </div>
            <Link href="/today" className="text-link">Full day <ArrowRight size={14} /></Link>
          </div>
          <div className="task-list">
            {todayTasks.slice(0, 5).map((task) => <TaskRow task={task} compact key={task.id} />)}
          </div>
          <div className="queue-footer">
            <span>{todayTasks.reduce((sum, task) => sum + task.estimateMinutes, 0)} planned minutes</span>
            <strong>{todayTasks.length} blocks</strong>
          </div>
        </GlassPanel>

        {draft ? <ChangeSetReview changeSet={draft} /> : (
          <GlassPanel className="change-set-card empty-draft">
            <span className="metric-icon"><CheckCircle2 size={18} /></span>
            <h2>Plan is committed</h2>
            <p className="muted-copy">There are no unreviewed changes waiting. Your current schedule is the source of truth.</p>
            <Link href="/today" className="text-link">Review the day <ArrowRight size={14} /></Link>
          </GlassPanel>
        )}
      </div>

      <div className="dashboard-grid dashboard-grid-lower">
        <GlassPanel className="project-pulse-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow"><Briefcase size={14} /> Project pulse</span>
              <h2>What is moving</h2>
            </div>
            <Link href="/projects" className="text-link">All projects <ArrowRight size={14} /></Link>
          </div>
          <div className="project-pulse-list">
            {state.projects.filter((project) => project.status === "active").slice(0, 3).map((project) => (
              <div className="project-pulse-row" key={project.id}>
                <span className={`project-monogram accent-${project.accent}`}>{project.code}</span>
                <div className="project-pulse-main">
                  <div><strong>{project.name}</strong><span>{project.nextMilestone}</span></div>
                  <div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div>
                </div>
                <div className="project-pulse-meta"><strong>{project.progress}%</strong><small>{formatShortDate(project.deadline)}</small></div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="activity-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow"><CircleDollarSign size={14} /> System record</span>
              <h2>Recent activity</h2>
            </div>
            <Link href="/activity" className="text-link">History <ArrowRight size={14} /></Link>
          </div>
          <div className="activity-mini-list">
            {state.activity.slice(0, 4).map((item) => (
              <div className="activity-mini-row" key={item.id}>
                <span className="activity-dot" />
                <div><strong>{item.summary}</strong><small>{item.detail}</small></div>
                <time>{relativeTime(item.occurredAt)}</time>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
