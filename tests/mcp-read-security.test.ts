import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { WorkspaceReadRepository } from "@/data/repositories/workspace-read-repository";
import { createSeedWorkspace } from "@/data/seed";
import { PersonalOsReadService } from "@/mcp/personal-os-read-service";
import { createPersonalOsMcpServer } from "@/mcp/server";
import { readToolNames } from "@/mcp/tools";

describe("Phase 3 MCP read security", () => {
  it("exposes exactly the approved read-only tools", () => {
    expect(readToolNames).toEqual([
      "get_planning_context",
      "get_today",
      "get_calendar_range",
      "get_open_tasks",
      "get_projects",
      "get_work_sessions",
      "get_habits",
      "get_activity_history",
      "get_week_summary",
    ]);
    expect(readToolNames.some((name) => name.includes("write") || name.includes("commit"))).toBe(false);
  });

  it("rejects an oversized date range before accessing Supabase", async () => {
    const load = vi.fn();
    const repository: WorkspaceReadRepository = { userId: "user-a", load };
    const service = new PersonalOsReadService(repository);

    await expect(
      service.execute("get_calendar_range", { start: "2026-01-01", end: "2026-03-01" }),
    ).rejects.toThrow("calendar ranges are limited to 31 days");
    expect(load).not.toHaveBeenCalled();
  });

  it("returns 401 for an MCP protocol request without a bearer token", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const response = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 401 for a diagnostics read request without a user session", async () => {
    const { POST } = await import("@/app/api/mcp/read/[tool]/route");
    const response = await POST(
      new Request("http://localhost/api/mcp/read/get_today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ tool: "get_today" }) },
    );
    expect(response.status).toBe(401);
  });

  it("lists and calls the compact read tools over the MCP protocol", async () => {
    const repository: WorkspaceReadRepository = {
      userId: "seed-user",
      load: vi.fn(async () => createSeedWorkspace()),
    };
    const server = createPersonalOsMcpServer(new PersonalOsReadService(repository));
    const client = new Client({ name: "phase-3-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(readToolNames);
    expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

    const result = await client.callTool({ name: "get_planning_context", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      schedule: expect.any(Array),
      free_time: expect.any(Object),
      tasks: expect.any(Object),
      projects: expect.any(Array),
      habits: expect.any(Object),
      tomorrow_preview: expect.any(Object),
    });

    await client.close();
    await server.close();
  });
});
