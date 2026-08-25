import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { businessActionSchema } from "@/features/work/business-schema";
import { learningActionSchema } from "@/features/growth/learning-schema";

describe("product domain boundaries", () => {
  it("rejects unlisted business operations and unknown payload fields", () => {
    expect(() => businessActionSchema.parse({
      action: "execute_sql",
      payload: { sql: "select * from auth.users" },
      idempotency_key: "security.test.001",
    })).toThrow();
    expect(() => businessActionSchema.parse({
      action: "create_client",
      payload: { name: "Safe Client", sql: "drop table clients" },
      idempotency_key: "security.test.002",
    })).toThrow();
  });

  it("requires stale-write protection on mutable learning records", () => {
    expect(() => learningActionSchema.parse({
      action: "update_learning_topic",
      payload: { id: "11111111-1111-4111-8111-111111111111", mastery: 80 },
      idempotency_key: "security.test.003",
    })).toThrow();
  });

  it("keeps business and learning tables user scoped with RLS", async () => {
    for (const migration of ["202608250005_business_finance.sql", "202608250006_growth_academics.sql"]) {
      const sql = await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8");
      expect(sql).toContain("enable row level security");
      expect(sql).toContain("auth.uid()");
      expect(sql).toContain("private_cached_action");
      expect(sql).not.toContain("service_role");
    }
  });
});
