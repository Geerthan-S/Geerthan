import { z } from "zod";
import { createChangeSetInput } from "@/features/changesets/schema";

export type McpPermission = "state:read" | "draft:write" | "commit:write";

export interface McpToolDefinition<TInput extends z.ZodType> {
  name: string;
  description: string;
  permission: McpPermission;
  input: TInput;
  endpoint: string;
  method: "GET" | "POST";
}

export const personalOsTools = {
  readWorkState: {
    name: "personal_os_read_work_state",
    description: "Read the authenticated user's Phase 1 work state without mutating it.",
    permission: "state:read",
    input: z.object({ includeCompleted: z.boolean().default(false) }),
    endpoint: "/api/work-state",
    method: "GET",
  },
  draftChanges: {
    name: "personal_os_draft_changes",
    description: "Create a reviewable change set. This never applies its operations.",
    permission: "draft:write",
    input: createChangeSetInput,
    endpoint: "/api/change-sets",
    method: "POST",
  },
  commitChanges: {
    name: "personal_os_commit_changes",
    description: "Commit an already-reviewed change set by id.",
    permission: "commit:write",
    input: z.object({ changeSetId: z.uuid() }),
    endpoint: "/api/change-sets/{changeSetId}/commit",
    method: "POST",
  },
} satisfies Record<string, McpToolDefinition<z.ZodType>>;
