"use client";

import { Circle, CircleCheck, Clock3, Play, RotateCcw } from "lucide-react";
import type { Task } from "@/domain/models";
import { getProjectById } from "@/domain/queries";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { StatusPill } from "@/shared/components/ui/status-pill";
import { cn, formatMinutes, formatTime } from "@/shared/lib/utils";

const priorityTone = {
  critical: "red",
  high: "amber",
  medium: "blue",
  low: "neutral",
} as const;

export function TaskRow({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { state, actions } = useWorkspace();
  const project = getProjectById(state, task.projectId);
  const running = state.sessions.some((session) => session.status === "running");
  const completed = task.status === "completed";

  return (
    <article className={cn("task-row", compact && "task-row-compact", completed && "is-complete")}>
      <button
        className="task-check"
        onClick={() => actions.toggleTask(task.id)}
        aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
      >
        {completed ? <CircleCheck size={21} /> : <Circle size={21} />}
      </button>
      <div className="task-main">
        <div className="task-title-line">
          <h3>{task.title}</h3>
          {!compact ? <StatusPill tone={priorityTone[task.priority]}>{task.priority}</StatusPill> : null}
        </div>
        <div className="task-meta">
          {project ? <span className={`project-dot accent-${project.accent}`}>{project.code}</span> : <span>Personal</span>}
          <span><Clock3 size={13} /> {task.scheduledStart ? formatTime(task.scheduledStart) : formatMinutes(task.estimateMinutes)}</span>
          {task.status === "blocked" ? <StatusPill tone="red">Blocked</StatusPill> : null}
        </div>
      </div>
      {!compact ? (
        completed ? (
          <Button variant="ghost" size="icon" onClick={() => actions.toggleTask(task.id)} aria-label="Reopen task">
            <RotateCcw size={16} />
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={running || task.status === "blocked"}
            onClick={() => actions.startSession(task.id)}
          >
            <Play size={14} fill="currentColor" /> Focus
          </Button>
        )
      ) : null}
    </article>
  );
}
