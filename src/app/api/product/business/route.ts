import { ZodError } from "zod";
import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { SupabaseBusinessRepository } from "@/data/supabase/supabase-business-repository";
import { businessActionSchema } from "@/features/work/business-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function context(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { response: json({ error: "Forbidden." }, 403) };
  const auth = await authenticateReadRequest(request);
  if (!auth) return { response: json({ error: "Authentication required." }, 401) };
  return { repository: new SupabaseBusinessRepository(auth.client, auth.user.id) };
}

export async function GET(request: Request) {
  const value = await context(request);
  if ("response" in value) return value.response;
  try { return json({ data: await value.repository.load() }); }
  catch (error) { console.error("Business workspace read failed", error instanceof Error ? error.name : "UnknownError"); return json({ error: "business_read_failed" }, 500); }
}

export async function POST(request: Request) {
  const value = await context(request);
  if ("response" in value) return value.response;
  try {
    const parsed = businessActionSchema.parse(await request.json());
    const expectedVersion = "expected_version" in parsed ? parsed.expected_version : null;
    const data = await value.repository.action(parsed.action, parsed.payload, expectedVersion, parsed.idempotency_key);
    return json({ data });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: "invalid_business_action", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("version_conflict") || message.includes("idempotency_conflict") ? 409 : message.includes("not_found") ? 404 : 500;
    console.error("Business action failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: status === 409 ? "state_conflict" : status === 404 ? "not_found" : "business_action_failed" }, status);
  }
}
