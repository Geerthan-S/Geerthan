import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebPushDeliveryAdapter } from "@/integrations/web-push";

interface ClaimedPush {
  notification_id: string;
  user_id: string;
  title: string;
  body: string;
  action_url: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

export interface DispatchSummary {
  configured: boolean;
  claimed: number;
  delivered: number;
  expired: number;
  failed: number;
}

const SEND_CONCURRENCY = 10;

/**
 * Claims due notifications (each is claimed once, so overlapping runs never
 * double-send) and delivers them to every active subscription of their owner.
 * Delivery is at most once: a transient push-service failure is counted, not retried.
 */
export async function dispatchDuePushNotifications(
  serviceClient: SupabaseClient,
  adapter: WebPushDeliveryAdapter,
  batchSize = 100,
): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    configured: adapter.configured(),
    claimed: 0,
    delivered: 0,
    expired: 0,
    failed: 0,
  };
  if (!summary.configured) return summary;

  const { data, error } = await serviceClient.rpc("claim_due_push_notifications", { batch_size: batchSize });
  if (error) throw new Error(`claim_failed: ${error.code ?? error.message}`);
  const rows = (data ?? []) as ClaimedPush[];
  summary.claimed = new Set(rows.map((row) => row.notification_id)).size;

  for (let index = 0; index < rows.length; index += SEND_CONCURRENCY) {
    await Promise.all(
      rows.slice(index, index + SEND_CONCURRENCY).map(async (row) => {
        const result = await adapter.send(
          { endpoint: row.endpoint, p256dh: row.p256dh, authKey: row.auth_key },
          {
            title: row.title,
            body: row.body,
            url: row.action_url || "/notifications",
            tag: row.notification_id.slice(0, 32),
          },
        );
        if (result.delivered) summary.delivered += 1;
        else if (result.expired) {
          summary.expired += 1;
          await serviceClient.rpc("deactivate_push_subscription", {
            target_subscription: row.subscription_id,
          });
        } else summary.failed += 1;
      }),
    );
  }
  return summary;
}
