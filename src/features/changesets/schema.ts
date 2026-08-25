import { z } from "zod";

export const changeOperationInput = z.object({
  entity: z.enum(["task", "project", "calendar_block", "work_session", "habit"]),
  action: z.enum(["create", "update", "complete", "reschedule", "start", "end", "log"]),
  entityId: z.uuid().nullable().default(null),
  expectedVersion: z.number().int().positive().optional(),
  summary: z.string().trim().min(1).max(240),
  before: z.record(z.string(), z.unknown()).nullable().default(null),
  after: z.record(z.string(), z.unknown()),
});

export const createChangeSetInput = z.object({
  title: z.string().trim().min(1).max(180),
  rationale: z.string().trim().max(1200).default(""),
  source: z.enum(["web", "api", "mcp"]).default("api"),
  createdBy: z.string().trim().min(1).max(80).default("You"),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
  operations: z.array(changeOperationInput).min(1).max(50),
});

export type CreateChangeSetInput = z.infer<typeof createChangeSetInput>;
