import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { consumeReadQuota } from "@/mcp/read-rate-limit";
import { readToolManifest } from "@/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const auth = await authenticateReadRequest(request);
  if (!auth) return Response.json({ error: "Authentication required." }, { status: 401 });

  const quota = consumeReadQuota(auth.user.id);
  if (!quota.allowed) return Response.json({ error: "Read rate limit exceeded." }, { status: 429 });

  return Response.json(
    { mode: "read-only", source: "supabase", tools: readToolManifest },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-RateLimit-Remaining": String(quota.remaining),
      },
    },
  );
}
