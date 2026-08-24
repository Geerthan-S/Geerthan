"use client";

import { ArrowUpRight, Calendar, CheckCircle2, CircleDot, FolderKanban } from "lucide-react";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { StatusPill } from "@/shared/components/ui/status-pill";
import { formatShortDate } from "@/shared/lib/utils";

const healthTone = { on_track: "green", at_risk: "amber", blocked: "red" } as const;

export function ProjectsView() {
  const { state } = useWorkspace();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Projects"
        title="Outcomes, not containers."
        description="Every active project has a next milestone, deadline, and honest health signal."
        actions={<Button><FolderKanban size={15} /> New project</Button>}
      />
      <div className="project-summary-row">
        <span><strong>{state.projects.filter((p) => p.status === "active").length}</strong> active</span>
        <span><strong>{state.projects.filter((p) => p.health === "at_risk").length}</strong> at risk</span>
        <span><strong>{state.tasks.filter((t) => t.status !== "completed").length}</strong> open tasks</span>
      </div>
      <section className="project-grid">
        {state.projects.map((project) => {
          const tasks = state.tasks.filter((task) => task.projectId === project.id);
          const complete = tasks.filter((task) => task.status === "completed").length;
          return (
            <GlassPanel className="project-card" key={project.id}>
              <div className="project-card-top">
                <span className={`project-monogram project-monogram-large accent-${project.accent}`}>{project.code}</span>
                <StatusPill tone={project.status === "paused" ? "neutral" : healthTone[project.health]}>
                  {project.status === "paused" ? "Paused" : project.health.replace("_", " ")}
                </StatusPill>
              </div>
              <div className="project-card-copy">
                <span>{project.client}</span>
                <h2>{project.name}</h2>
                <p>{project.description}</p>
              </div>
              <div className="project-progress-heading"><span>Progress</span><strong>{project.progress}%</strong></div>
              <div className="progress-track project-progress"><span style={{ width: `${project.progress}%` }} /></div>
              <div className="project-milestone">
                <CircleDot size={16} />
                <div><small>Next milestone</small><strong>{project.nextMilestone}</strong></div>
              </div>
              <div className="project-card-footer">
                <span><Calendar size={14} /> {formatShortDate(project.deadline)}</span>
                <span><CheckCircle2 size={14} /> {complete}/{tasks.length} tasks</span>
                <button aria-label={`Open ${project.name}`}><ArrowUpRight size={17} /></button>
              </div>
            </GlassPanel>
          );
        })}
      </section>
    </div>
  );
}
