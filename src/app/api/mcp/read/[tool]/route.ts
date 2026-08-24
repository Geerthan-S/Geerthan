import { ZodError } from "zod";
import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { SupabaseWorkspaceReadRepository } from "@/data/supabase/supabase-workspace-read-repository";
import { PersonalOsReadService } from "@/mcp/personal-os-read-service";
import { consumeReadQuota } from "@/mcp/read-rate-limit";
import { isReadToolName } from "@/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ tool: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Forbidden." }, 403);
  const auth = await authenticateReadRequest(request);
  if (!auth) return json({ error: "Authentication required." }, 401);

  const { tool } = await context.params;
  if (!isReadToolName(tool)) return json({ error: "Unknown read tool." }, 404);

  const quota = consumeReadQuota(auth.user.id);
  if (!quota.allowed) {
    return json(
      { error: "Read rate limit exceeded." },
      429,
      { "Retry-After": String(Math.ceil((quota.resetAt - Date.now()) / 1000)) },
    );
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return json({ error: "Request body is too large." }, 413);
    const input: unknown = text.trim() ? JSON.parse(text) : {};
    const repository = new SupabaseWorkspaceReadRepository(auth.client, auth.user);
    const data = await new PersonalOsReadService(repository).execute(tool, input);
    return json(
      { tool, source: "supabase", data },
      200,
      { "X-RateLimit-Remaining": String(quota.remaining) },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON." }, 400);
    if (error instanceof ZodError) {
      return json(
        { error: "Invalid tool input.", issues: error.issues.map(({ path, message }) => ({ path, message })) },
        400,
      );
    }
    console.error("MCP read tool failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Unable to read Personal OS state." }, 500);
  }
}
