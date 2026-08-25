import "server-only";

import { McpServer } from "@modelcontextprotocol/server";
import type { PersonalOsReadService } from "@/mcp/personal-os-read-service";
import type { PersonalOsWriteService } from "@/mcp/personal-os-write-service";
import { consumeWriteQuota } from "@/mcp/write-rate-limit";
import { personalOsTools, personalOsWriteTools, readToolNames, writeToolNames } from "@/mcp/tools";

export function createPersonalOsMcpServer(readService: PersonalOsReadService, writeService?: PersonalOsWriteService) {
  const server = new McpServer({ name: "personal-os-read", version: "1.0.0" });

  for (const name of readToolNames) {
    const definition = personalOsTools[name];
    server.registerTool(
      name,
      {
        description: definition.description,
        inputSchema: definition.input,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        const result = await readService.execute(name, input);
        const structuredContent = result as unknown as Record<string, unknown>;
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent,
        };
      },
    );
  }

  if (writeService) {
    for (const name of writeToolNames) {
      const definition = personalOsWriteTools[name];
      server.registerTool(
        name,
        {
          description: definition.description,
          inputSchema: definition.input,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (input) => {
          const quota = consumeWriteQuota(writeService.userId);
          if (!quota.allowed) throw new Error("Write rate limit exceeded.");
          const result = await writeService.execute(name, input);
          const structuredContent = result as Record<string, unknown>;
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent,
          };
        },
      );
    }
  }

  return server;
}
