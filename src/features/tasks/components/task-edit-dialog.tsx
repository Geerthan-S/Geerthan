"use client";

import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Priority, Task } from "@/domain/models";
import { priorityOptions, useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog, Dialog } from "@/shared/components/ui/dialog";

/** Converts an ISO timestamp to the value a datetime-local input expects, in local time. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function TaskEditDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  return task ? <TaskEditForm key={task.id} task={task} onClose={onClose} /> : null;
}

function TaskEditForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const { state, actions } = useWorkspace();
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [dueAt, setDueAt] = useState(toLocalInput(task.dueAt));
  const [estimate, setEstimate] = useState(task.estimateMinutes);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const saved = await actions.updateTask(task.id, task.version ?? 1, {
      title: title.trim(),
      priority,
      projectId: projectId || null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      estimateMinutes: Math.max(0, Math.round(estimate)),
    });
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <>
      <Dialog open={!confirmingDelete} onClose={onClose} eyebrow="Edit task" title={task.title}>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="task-edit-title">
            Title
          </label>
          <input
            id="task-edit-title"
            className="glass-input"
            value={title}
            maxLength={240}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="habit-form-grid">
            <label>
              Project
              <select
                className="glass-input"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">No project</option>
                {state.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                className="glass-input"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
              >
                {priorityOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due
              <input
                className="glass-input"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
            <label>
              Estimate (min)
              <input
                className="glass-input"
                type="number"
                min={0}
                max={10080}
                step={5}
                value={estimate}
                onChange={(event) => setEstimate(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={14} /> Delete
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete "${task.title}"?`}
        body="The task is removed for good. Focus sessions you logged against it are kept."
        confirmLabel="Delete task"
        onConfirm={async () => {
          if (await actions.deleteTask(task.id)) onClose();
        }}
        onClose={() => setConfirmingDelete(false)}
      />
    </>
  );
}
