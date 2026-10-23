import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { createSupabaseServiceClient } from "@/data/supabase/service";
import { revokeToken } from "@/integrations/google/google-client";
import { decryptToken } from "@/integrations/google/token-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revokes the Google grant (best effort), then removes the token and imported events. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Forbidden." }, { status: 403 });
  const auth = await authenticateReadRequest(request);
  if (!auth || auth.mode !== "cookie")
    return Response.json({ error: "Authentication required." }, { status: 401 });

  const serviceClient = createSupabaseServiceClient();
  if (serviceClient) {
    const { data } = await serviceClient
      .from("integration_credentials")
      .select("encrypted_refresh_token")
      .eq("user_id", auth.user.id)
      .eq("connector", "google_calendar")
      .maybeSingle();
    if (data) {
      try {
        await revokeToken(decryptToken(data.encrypted_refresh_token));
      } catch {
        // The local token is removed below either way.
      }
    }
  }

  const { error } = await auth.client.rpc("disconnect_integration", { target_connector: "google_calendar" });
  if (error) return Response.json({ error: "disconnect_failed" }, { status: 500 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
