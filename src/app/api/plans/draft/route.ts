import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/data/supabase/server";

const inputSchema = z.object({ date: z.iso.date(), includeOverdue: z.boolean().default(true) });

export async function POST(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_plan_request", issues: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await client.rpc("generate_daily_plan_draft", { target_date: parsed.data.date, include_overdue: parsed.data.includeOverdue });
  if (error) return NextResponse.json({ error: "plan_generation_failed", detail: error.message }, { status: 409 });
  return NextResponse.json({ data }, { status: 201 });
}
