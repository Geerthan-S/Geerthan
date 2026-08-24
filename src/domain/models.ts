export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus =
  | "inbox"
  | "planned"
  | "in_progress"
  | "blocked"
  | "completed";
export type ProjectStatus = "active" | "paused" | "completed";
export type ProjectHealth = "on_track" | "at_risk" | "blocked";

export interface Project {
  id: string;
  name: string;
  code: string;
  description: string;
  client: string;
  status: ProjectStatus;
  health: ProjectHealth;
  progress: number;
  deadline: string;
  nextMilestone: string;
  accent: "blue" | "violet" | "amber" | "emerald";
}

export interface Task {
  id: string;
  title: string;
  projectId: string | null;
  status: TaskStatus;
  priority: Priority;
  dueAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimateMinutes: number;
  completedAt: string | null;
  tags: string[];
  createdAt: string;
  source: "manual" | "capture" | "plan" | "integration";
}

export interface WorkSession {
  id: string;
  taskId: string | null;
  projectId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  status: "running" | "completed";
  outcome: string | null;
}

export interface InboxItem {
  id: string;
  title: string;
  note: string;
  createdAt: string;
  triaged: boolean;
}

export interface ActivityEvent {
  id: string;
  type:
    | "task_created"
    | "task_completed"
    | "task_reopened"
    | "session_started"
    | "session_completed"
    | "capture_added"
    | "changeset_created"
    | "changeset_committed"
    | "changeset_discarded";
  summary: string;
  detail: string;
  occurredAt: string;
  actor: "You" | "Personal OS" | "ChatGPT";
  source: "web" | "api" | "mcp" | "system";
  undoable: boolean;
}

export type ChangeSetStatus = "draft" | "committed" | "discarded";

export interface ChangeOperation {
  id: string;
  entity: "task" | "project" | "calendar_block" | "work_session";
  action: "create" | "update" | "complete" | "reschedule";
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface ChangeSet {
  id: string;
  title: string;
  rationale: string;
  status: ChangeSetStatus;
  createdAt: string;
  committedAt: string | null;
  createdBy: "You" | "ChatGPT";
  operations: ChangeOperation[];
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  email: string;
  timezone: string;
  focusTargetMinutes: number;
}

export interface WorkspaceState {
  profile: WorkspaceProfile;
  projects: Project[];
  tasks: Task[];
  sessions: WorkSession[];
  inbox: InboxItem[];
  activity: ActivityEvent[];
  changeSets: ChangeSet[];
}
