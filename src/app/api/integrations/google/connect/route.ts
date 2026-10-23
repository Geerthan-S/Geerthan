import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/data/supabase/server";
import {
  authorizationUrl,
  createAuthorizationSecrets,
  googleOAuthConfig,
  redirectUriFor,
} from "@/integrations/google/google-client";
import { backToSettings, COOKIE_PATH, STATE_COOKIE } from "@/integrations/google/route-helpers";
import { encryptionConfigured } from "@/integrations/google/token-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts Google sign-in for the signed-in user. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const config = googleOAuthConfig();
  if (!config || !encryptionConfigured()) return backToSettings(origin, "not_configured");

  const supabase = await createSupabaseServerClient();
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!data.user) return NextResponse.redirect(new URL("/login", origin), 303);

  const secrets = createAuthorizationSecrets();
  const response = NextResponse.redirect(
    authorizationUrl(config, redirectUriFor(origin), secrets, data.user.email ?? undefined),
    303,
  );
  // State and PKCE verifier live in a short-lived, http-only cookie tied to this browser.
  response.cookies.set(STATE_COOKIE, `${secrets.state}.${secrets.verifier}.${data.user.id}`, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 600,
  });
  return response;
}
