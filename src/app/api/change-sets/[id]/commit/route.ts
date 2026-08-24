import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/data/supabase/server";
import { SupabaseChangeSetRepository } from "@/data/supabase/change-set-repository";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const repository = new SupabaseChangeSetRepository(client, data.user.id);
    return NextResponse.json({ data: await repository.commit(id) });
  } catch (commitError) {
    return NextResponse.json(
      { error: "commit_failed", detail: commitError instanceof Error ? commitError.message : "Unknown error" },
      { status: 409 },
    );
  }
}
