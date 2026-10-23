import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/integrations/google/token-crypto";
import {
  GoogleApiError,
  listBusyEvents,
  refreshAccessToken,
  type GoogleOAuthConfig,
} from "@/integrations/google/google-client";

const PAST_DAYS = 1;
const FUTURE_DAYS = 14;
const DAY_MS = 86_400_000;

export interface SyncResult {
  userId: string;
  ok: boolean;
  imported: number;
  error?: string;
}

export function syncWindow(now = new Date()) {
  return {
    start: new Date(now.getTime() - PAST_DAYS * DAY_MS),
    end: new Date(now.getTime() + FUTURE_DAYS * DAY_MS),
  };
}

/** Imports one user's busy events with an access token, through the service-role client. */
export async function importEvents(
  serviceClient: SupabaseClient,
  userId: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const window = syncWindow(now);
  const { events } = await listBusyEvents(accessToken, window, fetcher);
  const { data, error } = await serviceClient.rpc("apply_calendar_import", {
    target_user: userId,
    window_start: window.start.toISOString(),
    window_end: window.end.toISOString(),
    events,
  });
  if (error) throw new Error(`apply_failed: ${error.code ?? error.message}`);
  return Number(data ?? 0);
}

/** Refreshes the stored grant and imports; failures are recorded on the connection. */
export async function syncUserCalendar(
  serviceClient: SupabaseClient,
  config: GoogleOAuthConfig,
  connection: { user_id: string; encrypted_refresh_token: string },
  fetcher: typeof fetch = fetch,
): Promise<SyncResult> {
  try {
    const accessToken = await refreshAccessToken(
      config,
      decryptToken(connection.encrypted_refresh_token),
      fetcher,
    );
    const imported = await importEvents(serviceClient, connection.user_id, accessToken, fetcher);
    return { userId: connection.user_id, ok: true, imported };
  } catch (error) {
    const revoked = error instanceof GoogleApiError && error.revoked;
    const message = error instanceof Error ? error.message : "sync_failed";
    await serviceClient.rpc("record_integration_sync_failure", {
      target_user: connection.user_id,
      target_connector: "google_calendar",
      failure_message: revoked ? "Access was revoked." : `Sync failed (${message}). It will retry.`,
      revoked,
    });
    return { userId: connection.user_id, ok: false, imported: 0, error: revoked ? "revoked" : message };
  }
}

/** Syncs every connection whose last sync is older than the interval. */
export async function syncDueCalendars(
  serviceClient: SupabaseClient,
  config: GoogleOAuthConfig,
  fetcher: typeof fetch = fetch,
) {
  const { data, error } = await serviceClient.rpc("list_due_integration_syncs", {
    target_connector: "google_calendar",
    min_interval_minutes: 25,
    batch_size: 50,
  });
  if (error) throw new Error(`list_failed: ${error.code ?? error.message}`);
  const results: SyncResult[] = [];
  for (const connection of (data ?? []) as { user_id: string; encrypted_refresh_token: string }[]) {
    results.push(await syncUserCalendar(serviceClient, config, connection, fetcher));
  }
  return results;
}
