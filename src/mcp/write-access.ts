import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether the user has allowed AI assistants (MCP clients) to change their data.
 * Writes stay off unless the setting exists and is explicitly on.
 */
export async function mcpWritesAllowed(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("mcp_write_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.mcp_write_enabled === true;
}
