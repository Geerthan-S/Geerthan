import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/data/supabase/server";
import { getSupabaseConfig } from "@/data/supabase/config";

export interface AuthenticatedRequestContext {
  client: SupabaseClient;
  user: User;
  mode: "bearer" | "cookie";
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function createBearerSupabaseClient(token: string) {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function authenticateReadRequest(request: Request): Promise<AuthenticatedRequestContext | null> {
  const token = bearerToken(request);
  if (token) {
    const client = createBearerSupabaseClient(token);
    if (!client) return null;
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return { client, user: data.user, mode: "bearer" };
  }

  try {
    const client = await createSupabaseServerClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return { client, user: data.user, mode: "cookie" };
  } catch {
    return null;
  }
}
