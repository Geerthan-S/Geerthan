import type { WriteToolName } from "@/mcp/tools";

export interface DomainActionRepository {
  readonly userId: string;
  execute(action: WriteToolName, input: Record<string, unknown>): Promise<unknown>;
}
