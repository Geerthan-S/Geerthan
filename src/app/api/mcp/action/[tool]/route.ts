import { ZodError } from "zod";
import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { SupabaseDomainActionRepository } from "@/data/supabase/supabase-domain-action-repository";
import { PersonalOsWriteService } from "@/mcp/personal-os-write-service";
import { isWriteToolName } from "@/mcp/tools";
import { consumeWriteQuota } from "@/mcp/write-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

function safeDomainError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("not_found")) return { status: 404, code: "not_found" };
  if (message.includes("version_conflict")) return { status: 409, code: "stale_write" };
  if (message.includes("idempotency_conflict")) return { status: 409, code: "idempotency_conflict" };
  if (message.includes("schedule_conflict")) return { status: 409, code: "schedule_conflict" };
  if (message.includes("already") || message.includes("not_running") || message.includes("not_draft") || message.includes("not_committed")) return { status: 409, code: "state_conflict" };
  if (message.includes("invalid_") || message.includes("unsupported_")) return { status: 400, code: "invalid_action" };
  return { status: 500, code: "action_failed" };
}

export async function POST(request: Request, context: { params: Promise<{ tool: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Forbidden." }, 403);
  const auth = await authenticateReadRequest(request);
  if (!auth) return json({ error: "Authentication required." }, 401);
  const { tool } = await context.params;
  if (!isWriteToolName(tool)) return json({ error: "Unknown domain action." }, 404);

  const quota = consumeWriteQuota(auth.user.id);
  if (!quota.allowed) return json({ error: "Write rate limit exceeded." }, 429, { "Retry-After": String(Math.ceil((quota.resetAt - Date.now()) / 1000)) });

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return json({ error: "Request body is too large." }, 413);
    const input: unknown = text.trim() ? JSON.parse(text) : {};
    const repository = new SupabaseDomainActionRepository(auth.client, auth.user.id);
    const data = await new PersonalOsWriteService(repository).execute(tool, input);
    return json({ tool, source: "supabase-rpc", data }, 200, { "X-RateLimit-Remaining": String(quota.remaining) });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON." }, 400);
    if (error instanceof ZodError) return json({ error: "Invalid action input.", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
    const safe = safeDomainError(error);
    console.error("MCP domain action failed", tool, safe.code);
    return json({ error: safe.code }, safe.status);
  }
}
