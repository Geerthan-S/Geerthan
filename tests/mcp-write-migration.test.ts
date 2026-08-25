import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { writeToolNames } from "@/mcp/tools";

describe("MCP domain-action migration", () => {
  it("defines one explicit RPC per approved write tool with user scope and retry receipts", async () => {
    const path = fileURLToPath(new URL("../supabase/migrations/202608250004_mcp_domain_actions.sql", import.meta.url));
    const sql = await readFile(path, "utf8");

    for (const name of writeToolNames) {
      expect(sql).toContain(`public.domain_${name}`);
    }
    expect(sql).toContain("alter table public.action_receipts enable row level security");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("idempotency_conflict");
    expect(sql).toContain("version_conflict");
    expect(sql).not.toContain("execute immediate");
  });
});
