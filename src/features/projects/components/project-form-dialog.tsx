"use client";

import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Project, ProjectHealth, ProjectStatus } from "@/domain/models";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog, Dialog } from "@/shared/components/ui/dialog";

const accents: Project["accent"][] = ["blue", "violet", "amber", "emerald"];
const statuses: ProjectStatus[] = ["active", "paused", "completed"];
const healths: ProjectHealth[] = ["on_track", "at_risk", "blocked"];

interface Draft {
  name: string;
  code: string;
  client: string;
  description: string;
  deadline: string;
  accent: Project["accent"];
  status: ProjectStatus;
  health: ProjectHealth;
  progress: number;
  nextMilestone: string;
}

function draftFrom(project?: Project): Draft {
  return {
    name: project?.name ?? "",
    code: project?.code ?? "",
    client: project?.client ?? "",
    description: project?.description ?? "",
    deadline: project?.deadline ? project.deadline.slice(0, 10) : "",
    accent: project?.accent ?? "blue",
    status: project?.status ?? "active",
    health: project?.health ?? "on_track",
    progress: project?.progress ?? 0,
    nextMilestone: project?.nextMilestone ?? "",
  };
}

/** A date-only deadline is stored as the end of that day in local time. */
function deadlineIso(date: string) {
  return date ? new Date(`${date}T18:00:00`).toISOString() : "";
}

export function ProjectFormDialog({
  open,
  project,
  onClose,
}: {
  open: boolean;
  project?: Project;
  onClose: () => void;
}) {
  return open ? <ProjectForm key={project?.id ?? "new"} project={project} onClose={onClose} /> : null;
}

function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { state, actions } = useWorkspace();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(project));
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const taskCount = project ? state.tasks.filter((task) => task.projectId === project.id).length : 0;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || draft.code.trim().length < 2) return;
    setSaving(true);
    const base = {
      name: draft.name.trim(),
      code: draft.code.trim().toUpperCase(),
      client: draft.client.trim(),
      description: draft.description.trim(),
      deadline: deadlineIso(draft.deadline),
      accent: draft.accent,
    };
    const saved = project
      ? await actions.updateProject(project.id, project.version ?? 1, {
          ...base,
          status: draft.status,
          health: draft.health,
          progress: Math.min(100, Math.max(0, Math.round(draft.progress))),
          nextMilestone: draft.nextMilestone.trim(),
        })
      : await actions.createProject(base);
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <>
      <Dialog
        open={!confirmingDelete}
        onClose={onClose}
        eyebrow={project ? "Edit project" : "New project"}
        title={project ? project.name : "What outcome are you working towards?"}
        className="project-dialog"
      >
        <form onSubmit={submit}>
          <div className="habit-form-grid">
            <label className="span-2">
              Name
              <input
                className="glass-input"
                value={draft.name}
                maxLength={140}
                required
                onChange={(event) => update("name", event.target.value)}
              />
            </label>
            <label>
              Code
              <input
                className="glass-input"
                value={draft.code}
                minLength={2}
                maxLength={8}
                required
                placeholder="ATL"
                onChange={(event) => update("code", event.target.value.toUpperCase())}
              />
            </label>
            <label>
              Client or area
              <input
                className="glass-input"
                value={draft.client}
                maxLength={140}
                onChange={(event) => update("client", event.target.value)}
              />
            </label>
            <label className="span-2">
              Description
              <input
                className="glass-input"
                value={draft.description}
                maxLength={500}
                onChange={(event) => update("description", event.target.value)}
              />
            </label>
            <label>
              Deadline
              <input
                className="glass-input"
                type="date"
                value={draft.deadline}
                onChange={(event) => update("deadline", event.target.value)}
              />
            </label>
            {project ? (
              <>
                <label>
                  Progress (%)
                  <input
                    className="glass-input"
                    type="number"
                    min={0}
                    max={100}
                    value={draft.progress}
                    onChange={(event) => update("progress", Number(event.target.value))}
                  />
                </label>
                <label>
                  Status
                  <select
                    className="glass-input"
                    value={draft.status}
                    onChange={(event) => update("status", event.target.value as ProjectStatus)}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Health
                  <select
                    className="glass-input"
                    value={draft.health}
                    onChange={(event) => update("health", event.target.value as ProjectHealth)}
                  >
                    {healths.map((health) => (
                      <option key={health} value={health}>
                        {health.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Next milestone
                  <input
                    className="glass-input"
                    value={draft.nextMilestone}
                    maxLength={240}
                    onChange={(event) => update("nextMilestone", event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
          <fieldset className="accent-picker">
            <legend className="field-label">Colour</legend>
            {accents.map((accent) => (
              <label key={accent} className={`accent-swatch accent-${accent}`}>
                <input
                  type="radio"
                  name="project-accent"
                  value={accent}
                  checked={draft.accent === accent}
                  onChange={() => update("accent", accent)}
                />
                <span className="sr-only">{accent}</span>
              </label>
            ))}
          </fieldset>
          <div className="dialog-actions">
            {project ? (
              <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={14} /> Delete
              </Button>
            ) : (
              <span>Tasks can be linked to it once it exists.</span>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : project ? "Save changes" : "Create project"}
            </Button>
          </div>
        </form>
      </Dialog>
      {project ? (
        <ConfirmDialog
          open={confirmingDelete}
          title={`Delete ${project.name}?`}
          body={
            taskCount
              ? `Its ${taskCount} ${taskCount === 1 ? "task stays" : "tasks stay"} in your list without a project.`
              : "This project has no tasks."
          }
          confirmLabel="Delete project"
          onConfirm={async () => {
            if (await actions.deleteProject(project.id)) onClose();
          }}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </>
  );
}
