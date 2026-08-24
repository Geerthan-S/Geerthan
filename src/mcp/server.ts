import "server-only";

import { McpServer } from "@modelcontextprotocol/server";
import type { PersonalOsReadService } from "@/mcp/personal-os-read-service";
import { personalOsTools, readToolNames } from "@/mcp/tools";

export function createPersonalOsMcpServer(service: PersonalOsReadService) {
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
        const result = await service.execute(name, input);
        const structuredContent = result as unknown as Record<string, unknown>;
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent,
        };
      },
    );
  }

  return server;
}
