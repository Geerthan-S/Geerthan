import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/data/supabase/server";
import { createSupabaseServiceClient } from "@/data/supabase/service";
import { importEvents } from "@/integrations/google/calendar-sync";
import { exchangeCode, googleOAuthConfig, redirectUriFor } from "@/integrations/google/google-client";
import { backToSettings, STATE_COOKIE } from "@/integrations/google/route-helpers";
import { encryptToken } from "@/integrations/google/token-crypto";
import { reportError } from "@/observability/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return backToSettings(origin, "denied");

  const [state, verifier, cookieUser] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split(".");
  const returnedState = params.get("state") ?? "";
  const code = params.get("code");
  if (!state || !verifier || !code || !sameValue(state, returnedState))
    return backToSettings(origin, "invalid_state");

  const config = googleOAuthConfig();
  if (!config) return backToSettings(origin, "not_configured");
  const supabase = await createSupabaseServerClient();
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  // The sign-in must finish in the same account that started it.
  if (!supabase || !data.user || data.user.id !== cookieUser) return backToSettings(origin, "invalid_state");

  try {
    const tokens = await exchangeCode(config, { code, verifier, redirectUri: redirectUriFor(origin) });
    if (!tokens.refreshToken) return backToSettings(origin, "no_refresh_token");
    const { error } = await supabase.rpc("store_integration_credentials", {
      target_connector: "google_calendar",
      encrypted_token: encryptToken(tokens.refreshToken),
      granted_scope: tokens.scope,
      account_label: data.user.email ?? "",
    });
    if (error) throw new Error(`store_failed: ${error.code ?? error.message}`);

    // Import straight away so the calendar is filled when the user lands back.
    const serviceClient = createSupabaseServiceClient();
    if (serviceClient)
      await importEvents(serviceClient, data.user.id, tokens.accessToken).catch(() => undefined);
    return backToSettings(origin, "connected");
  } catch (error) {
    await reportError({
      source: "server",
      message: error instanceof Error ? error.message : "google_callback_failed",
      path: "/api/integrations/google/callback",
      method: "GET",
    });
    return backToSettings(origin, "failed");
  }
}
