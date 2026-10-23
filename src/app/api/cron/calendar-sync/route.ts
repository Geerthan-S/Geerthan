import { createSupabaseServiceClient } from "@/data/supabase/service";
import { syncDueCalendars } from "@/integrations/google/calendar-sync";
import { googleOAuthConfig } from "@/integrations/google/google-client";
import { cronAuthorized } from "@/notifications/cron-auth";
import { reportError } from "@/observability/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Imports Google Calendar events for connections not synced in the last 25 minutes. */
async function handle(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const config = googleOAuthConfig();
  if (!config)
    return Response.json({ configured: false, synced: 0 }, { headers: { "Cache-Control": "no-store" } });
  const serviceClient = createSupabaseServiceClient();
  if (!serviceClient) return Response.json({ error: "supabase_secret_key_missing" }, { status: 503 });

  try {
    const results = await syncDueCalendars(serviceClient, config);
    return Response.json(
      {
        configured: true,
        synced: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        imported: results.reduce((sum, result) => sum + result.imported, 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await reportError({
      source: "server",
      message: error instanceof Error ? error.message : "calendar_sync_failed",
      path: "/api/cron/calendar-sync",
      method: request.method,
    });
    return Response.json({ error: "sync_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
