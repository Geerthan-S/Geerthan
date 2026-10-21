import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/data/supabase/config";

/**
 * A client with the project's secret key. It bypasses row-level security, so it
 * is used only by trusted scheduled jobs and must never reach browser code.
 */
export function createSupabaseServiceClient() {
  const config = getSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !secretKey) return null;
  return createClient(config.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
