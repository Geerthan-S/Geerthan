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
  status: "disconnected" | "healthy" | "degraded";
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

// Connector implementations intentionally live outside domain and data layers.
// Phase 0/1 defines this boundary only; no external service is contacted yet.
