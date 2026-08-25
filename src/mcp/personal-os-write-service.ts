import type { DomainActionRepository } from "@/data/repositories/domain-action-repository";
import { writeToolSchemas, type WriteToolName } from "@/mcp/tools";

export class PersonalOsWriteService {
  constructor(private readonly repository: DomainActionRepository) {}

  get userId() {
    return this.repository.userId;
  }

  async execute(action: WriteToolName, rawInput: unknown) {
    const input = writeToolSchemas[action].parse(rawInput) as Record<string, unknown>;
    return this.repository.execute(action, input);
  }
}
