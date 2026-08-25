export type ConnectorId =
  | "google_calendar"
  | "microsoft_teams"
  | "vtop"
  | "lms"
  | "github"
  | "gmail"
  | "leetcode";

export interface ConnectorHealth {
  connector: ConnectorId;
  status: "not_configured" | "disconnected" | "healthy" | "degraded" | "error";
  checkedAt: string;
  message?: string;
}

export interface ExternalRecord {
  externalId: string;
  connector: ConnectorId;
  kind: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface IntegrationAdapter {
  readonly id: ConnectorId;
  readonly capabilities: readonly ("read" | "write")[];
  healthCheck(): Promise<ConnectorHealth>;
  pull(cursor?: string): Promise<{ records: ExternalRecord[]; nextCursor?: string }>;
}

export interface WritableIntegrationAdapter extends IntegrationAdapter {
  push(records: ExternalRecord[], idempotencyKey: string): Promise<{ accepted: string[] }>;
}

export interface CalendarIntegrationAdapter extends WritableIntegrationAdapter {
  readonly id: "google_calendar";
  listCalendars(): Promise<Array<{ externalId: string; name: string; writable: boolean }>>;
}

export interface CourseworkIntegrationAdapter extends IntegrationAdapter {
  readonly id: "microsoft_teams" | "vtop" | "lms";
  pullCoursework(cursor?: string): Promise<{ records: ExternalRecord[]; nextCursor?: string }>;
}

export interface DeveloperActivityAdapter extends IntegrationAdapter {
  readonly id: "github";
  pullContributions(cursor?: string): Promise<{ records: ExternalRecord[]; nextCursor?: string }>;
}

export interface MailIntegrationAdapter extends IntegrationAdapter {
  readonly id: "gmail";
  pullActionableMail(cursor?: string): Promise<{ records: ExternalRecord[]; nextCursor?: string }>;
}

export interface PracticeIntegrationAdapter extends IntegrationAdapter {
  readonly id: "leetcode";
  pullSolvedProblems(cursor?: string): Promise<{ records: ExternalRecord[]; nextCursor?: string }>;
}

// Connector implementations intentionally live outside domain and data layers.
// Phase 0/1 defines this boundary only; no external service is contacted yet.
