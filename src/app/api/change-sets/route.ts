import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/data/supabase/server";
import { SupabaseChangeSetRepository } from "@/data/supabase/change-set-repository";
import { createChangeSetInput } from "@/features/changesets/schema";

async function repositoryForRequest() {
  const client = await createSupabaseServerClient();
  if (!client) return { error: "supabase_not_configured" as const };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { error: "unauthorized" as const };
  return { repository: new SupabaseChangeSetRepository(client, data.user.id) };
}

export async function GET() {
  const context = await repositoryForRequest();
  if ("error" in context) {
    return NextResponse.json(
      { error: context.error },
      { status: context.error === "unauthorized" ? 401 : 503 },
    );
  }
  return NextResponse.json({ data: await context.repository.list() });
}

export async function POST(request: Request) {
  const context = await repositoryForRequest();
  if ("error" in context) {
    return NextResponse.json(
      { error: context.error },
      { status: context.error === "unauthorized" ? 401 : 503 },
    );
  }

  const parsed = createChangeSetInput.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_change_set", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const draft = await context.repository.createDraft(parsed.data);
    return NextResponse.json({ data: draft }, { status: 201 });
  } catch (error) {
    console.error("Change-set draft creation failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { error: "draft_creation_failed" },
      { status: 409 },
    );
  }
}
