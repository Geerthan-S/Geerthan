import { timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/data/supabase/service";
import { createWebPushAdapter } from "@/integrations/web-push";
import { dispatchDuePushNotifications } from "@/notifications/push-dispatch";
import { reportError } from "@/observability/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Sends due push notifications. Call it every 5–15 minutes from a scheduler
 * (Vercel Cron, the bundled GitHub Actions workflow, or any cron service) with
 * "Authorization: Bearer $CRON_SECRET".
 */
async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const serviceClient = createSupabaseServiceClient();
  if (!serviceClient) return Response.json({ error: "supabase_secret_key_missing" }, { status: 503 });

  try {
    const summary = await dispatchDuePushNotifications(serviceClient, createWebPushAdapter());
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await reportError({
      source: "server",
      message: error instanceof Error ? error.message : "push_dispatch_failed",
      path: "/api/cron/push-notifications",
      method: request.method,
    });
    return Response.json({ error: "dispatch_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
