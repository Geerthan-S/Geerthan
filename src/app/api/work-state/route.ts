import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/data/supabase/server";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const includeCompleted = new URL(request.url).searchParams.get("includeCompleted") === "true";
  const taskQuery = client.from("tasks").select("*").eq("user_id", data.user.id).order("due_at");
  if (!includeCompleted) taskQuery.neq("status", "completed");

  const [projects, tasks, sessions, inbox, drafts] = await Promise.all([
    client.from("projects").select("*").eq("user_id", data.user.id).order("updated_at", { ascending: false }),
    taskQuery,
    client.from("work_sessions").select("*").eq("user_id", data.user.id).order("started_at", { ascending: false }).limit(50),
    client.from("inbox_items").select("*").eq("user_id", data.user.id).eq("triaged", false).order("created_at", { ascending: false }),
    client.from("change_sets").select("*, change_operations(*)").eq("user_id", data.user.id).eq("status", "draft").order("created_at", { ascending: false }),
  ]);

  const failure = [projects, tasks, sessions, inbox, drafts].find((result) => result.error)?.error;
  if (failure) return NextResponse.json({ error: "state_read_failed", detail: failure.message }, { status: 500 });

  return NextResponse.json({
    data: {
      projects: projects.data,
      tasks: tasks.data,
      sessions: sessions.data,
      inbox: inbox.data,
      draftChangeSets: drafts.data,
      readAt: new Date().toISOString(),
    },
  });
}
