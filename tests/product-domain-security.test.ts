import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { businessActionSchema } from "@/features/work/business-schema";
import { learningActionSchema } from "@/features/growth/learning-schema";
import { systemActionSchema } from "@/features/system/system-schema";
import { PersonalOsReadService } from "@/mcp/personal-os-read-service";
import { createSeedWorkspace } from "@/data/seed";
import { connectorDefinitions, integrationAdapters } from "@/integrations/catalog";

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

  it("keeps system intelligence scoped and rejects connector impersonation", async () => {
    const sql = await readFile(new URL("../supabase/migrations/202608250007_system_intelligence.sql", import.meta.url), "utf8");
    expect(sql).toContain("alter table public.%I enable row level security");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("security_invoker = true");
    expect(sql).not.toContain("service_role");
    expect(() => systemActionSchema.parse({action:"mark_connector_healthy",payload:{connector:"gmail"},idempotency_key:"security.test.004"})).toThrow();
  });

  it("aggregates product domains into the primary MCP planning context", async () => {
    const workspace={userId:"seed-user",load:async()=>createSeedWorkspace()};
    const products={loadProducts:async()=>({
      business:{summary:{activeClients:2,openDeliverables:3,outstanding:40800,netCashFlow:25701,weightedPipeline:96000},deliverables:[],invoices:[]},
      learning:{growthSummary:{averageMastery:44,revisionsDue:2,learningMinutes:180},dsaSummary:{solved:187,remaining:113,dailyPace:1},topics:[],academicSummary:{lowAttendance:[],dueAssignments:1,upcomingExams:1},assignments:[],exams:[]},
      system:{summary:{averageGoalProgress:55,unreadNotifications:2},goals:[],notifications:[],integrations:[]},
    })};
    const result=await new PersonalOsReadService(workspace,products as never).execute("get_planning_context",{}) as Record<string,unknown>;
    expect(result).toMatchObject({work:{active_clients:2,outstanding_amount:40800},growth:{average_mastery:44},academics:{low_attendance:[]},goals:{average_progress:55},notifications:{unread:2},integrations:[]});
  });

  it("reports every external adapter as not configured until authorization exists", async () => {
    expect(connectorDefinitions).toHaveLength(7);
    for(const definition of connectorDefinitions){const adapter=integrationAdapters.get(definition.id);expect(adapter).toBeDefined();await expect(adapter!.healthCheck()).resolves.toMatchObject({connector:definition.id,status:"not_configured"});await expect(adapter!.pull()).rejects.toThrow("not_configured");}
  });
});
