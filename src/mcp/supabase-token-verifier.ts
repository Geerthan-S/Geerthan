import "server-only";

import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { createBearerSupabaseClient } from "@/data/supabase/request-auth";
import { mcpWritesAllowed } from "@/mcp/write-access";

function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

export const supabaseTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const client = createBearerSupabaseClient(token);
    if (!client) throw new OAuthError(OAuthErrorCode.InvalidToken, "Supabase is not configured.");
    const { data, error } = await client.auth.getUser(token);
    const expiresAt = tokenExpiry(token);
    if (error || !data.user || !expiresAt) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "The access token is invalid or expired.");
    }
    // A Supabase session token carries no scopes of its own, so write access is
    // granted only when the user has switched it on in Settings.
    const canWrite = await mcpWritesAllowed(client, data.user.id);
    return {
      token,
      clientId: data.user.id,
      scopes: canWrite ? ["personal-os:read", "personal-os:write"] : ["personal-os:read"],
      expiresAt,
      extra: { email: data.user.email ?? "" },
    };
  },
};
