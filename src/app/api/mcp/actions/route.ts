import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { writeToolManifest } from "@/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const auth = await authenticateReadRequest(request);
  if (!auth) return Response.json({ error: "Authentication required." }, { status: 401 });
  return Response.json(
    { mode: "domain-actions-only", source: "supabase-rpc", tools: writeToolManifest },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
