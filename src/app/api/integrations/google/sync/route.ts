import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { createSupabaseServiceClient } from "@/data/supabase/service";
import { syncUserCalendar } from "@/integrations/google/calendar-sync";
import { googleOAuthConfig } from "@/integrations/google/google-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Sync now" for the signed-in user's own calendar. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Forbidden." }, { status: 403 });
  const auth = await authenticateReadRequest(request);
  if (!auth || auth.mode !== "cookie")
    return Response.json({ error: "Authentication required." }, { status: 401 });

  const config = googleOAuthConfig();
  const serviceClient = createSupabaseServiceClient();
  if (!config || !serviceClient) return Response.json({ error: "not_configured" }, { status: 503 });

  const { data, error } = await serviceClient
    .from("integration_credentials")
    .select("user_id, encrypted_refresh_token")
    .eq("user_id", auth.user.id)
    .eq("connector", "google_calendar")
    .maybeSingle();
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  if (!data) return Response.json({ error: "not_connected" }, { status: 404 });

  const result = await syncUserCalendar(serviceClient, config, data);
  return Response.json(
    { ok: result.ok, imported: result.imported, error: result.error },
    { status: result.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } },
  );
}
