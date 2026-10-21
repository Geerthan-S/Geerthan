import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { createWebPushAdapter } from "@/integrations/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends a test notification to the signed-in user's own devices. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Forbidden." }, { status: 403 });
  const auth = await authenticateReadRequest(request);
  if (!auth || auth.mode !== "cookie")
    return Response.json({ error: "Authentication required." }, { status: 401 });

  const adapter = createWebPushAdapter();
  if (!adapter.configured()) return Response.json({ error: "push_not_configured" }, { status: 503 });

  const { data, error } = await auth.client
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", auth.user.id)
    .eq("active", true);
  if (error) return Response.json({ error: "subscriptions_unavailable" }, { status: 503 });
  if (!data?.length) return Response.json({ error: "no_subscriptions" }, { status: 404 });

  let delivered = 0;
  for (const subscription of data) {
    const result = await adapter.send(
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh, authKey: subscription.auth_key },
      { title: "Personal OS", body: "Push notifications are working on this device.", url: "/notifications" },
    );
    if (result.delivered) delivered += 1;
    else if (result.expired) {
      await auth.client.from("web_push_subscriptions").update({ active: false }).eq("id", subscription.id);
    }
  }
  return Response.json({ devices: data.length, delivered }, { headers: { "Cache-Control": "no-store" } });
}
