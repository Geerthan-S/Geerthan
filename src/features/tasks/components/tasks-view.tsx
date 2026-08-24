"use client";

import { Filter, ListFilter, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { Priority, TaskStatus } from "@/domain/models";
import { getActiveTasks } from "@/domain/queries";
import { TaskRow } from "@/features/tasks/components/task-row";
import { priorityOptions, useWorkspace } from "@/features/workspace/workspace-provider";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { cn } from "@/shared/lib/utils";

type FilterValue = "open" | TaskStatus;

export function TasksView() {
  const { state, actions } = useWorkspace();
  const [filter, setFilter] = useState<FilterValue>("open");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState("");

  const tasks = useMemo(() => {
    const base = filter === "open" ? getActiveTasks(state) : state.tasks.filter((task) => task.status === filter);
    return base.filter((task) => task.title.toLowerCase().includes(query.toLowerCase()));
  }, [filter, query, state]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    await actions.createTask({ title: title.trim(), priority, projectId: projectId || null, dueAt: null });
    setTitle("");
    setCreating(false);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Tasks"
        title="Every next action, visible."
        description="A focused list across active work, ordered by consequence rather than noise."
        actions={<Button onClick={() => setCreating(true)}><Plus size={15} /> Add task</Button>}
      />

      {creating ? (
        <GlassPanel className="create-task-card">
          <form onSubmit={createTask}>
            <div className="form-heading"><div><span className="eyebrow">New task</span><h2>Define the next action.</h2></div><Button type="button" variant="ghost" size="icon" onClick={() => setCreating(false)}><X size={18} /></Button></div>
            <input className="glass-input task-title-field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Use a clear action verb…" autoFocus />
            <div className="inline-fields">
              <label>Project<select className="glass-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label>Priority<select className="glass-input" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{priorityOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
              <Button type="submit">Create task</Button>
            </div>
          </form>
        </GlassPanel>
      ) : null}

      <GlassPanel className="task-workspace-card">
        <div className="task-toolbar">
          <div className="filter-tabs">
            {(["open", "in_progress", "blocked", "completed"] as FilterValue[]).map((value) => (
              <button key={value} className={cn(filter === value && "is-active")} onClick={() => setFilter(value)}>{value.replace("_", " ")}</button>
            ))}
          </div>
          <div className="task-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></div>
          <Button variant="ghost" size="icon" aria-label="More filters"><ListFilter size={17} /></Button>
        </div>
        <div className="task-table-heading"><span>Task</span><span><Filter size={13} /> {tasks.length} shown</span></div>
        <div className="task-list task-list-roomy">
          {tasks.length ? tasks.map((task) => <TaskRow task={task} key={task.id} />) : <div className="empty-state"><CheckCircle2Icon /><h3>Nothing here.</h3><p>This view is clear.</p></div>}
        </div>
      </GlassPanel>
    </div>
  );
}

function CheckCircle2Icon() {
  return <span className="empty-icon">✓</span>;
}
