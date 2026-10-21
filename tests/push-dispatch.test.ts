import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UnconfiguredWebPushAdapter,
  VapidWebPushAdapter,
  type WebPushDeliveryAdapter,
} from "@/integrations/web-push";
import { dispatchDuePushNotifications } from "@/notifications/push-dispatch";

function claimed(notification: string, subscription: string, endpoint: string) {
  return {
    notification_id: notification,
    user_id: "user-a",
    title: "Due now",
    body: "",
    action_url: "/today",
    subscription_id: subscription,
    endpoint,
    p256dh: "key",
    auth_key: "auth",
  };
}

describe("push dispatch", () => {
  it("does not claim anything when push isn't configured", async () => {
    const rpc = vi.fn();
    const summary = await dispatchDuePushNotifications(
      { rpc } as unknown as SupabaseClient,
      new UnconfiguredWebPushAdapter(),
    );
    expect(summary).toMatchObject({ configured: false, claimed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("delivers to every device and deactivates subscriptions the push service has dropped", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "claim_due_push_notifications"
        ? {
            data: [
              claimed("n1", "s1", "https://push.example/ok"),
              claimed("n1", "s2", "https://push.example/gone"),
              claimed("n2", "s1", "https://push.example/ok"),
              claimed("n3", "s3", "https://push.example/flaky"),
            ],
            error: null,
          }
        : { data: null, error: null },
    );
    const adapter: WebPushDeliveryAdapter = {
      configured: () => true,
      send: vi.fn(async (subscription) => {
        if (subscription.endpoint.endsWith("gone"))
          return { delivered: false, statusCode: 410, expired: true };
        if (subscription.endpoint.endsWith("flaky"))
          return { delivered: false, statusCode: 503, expired: false };
        return { delivered: true, statusCode: 201, expired: false };
      }),
    };

    const summary = await dispatchDuePushNotifications({ rpc } as unknown as SupabaseClient, adapter, 50);

    expect(summary).toEqual({ configured: true, claimed: 3, delivered: 2, expired: 1, failed: 1 });
    expect(rpc).toHaveBeenCalledWith("claim_due_push_notifications", { batch_size: 50 });
    expect(rpc).toHaveBeenCalledWith("deactivate_push_subscription", { target_subscription: "s2" });
    expect(adapter.send).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/ok" }),
      expect.objectContaining({ title: "Due now", url: "/today" }),
    );
  });

  it("surfaces a failed claim instead of silently sending nothing", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "42501", message: "permission denied" } }));
    await expect(
      dispatchDuePushNotifications({ rpc } as unknown as SupabaseClient, {
        configured: () => true,
        send: vi.fn(),
      }),
    ).rejects.toThrow("claim_failed: 42501");
  });
});

describe("VAPID adapter", () => {
  const vapid = { publicKey: "public", privateKey: "private", subject: "mailto:me@example.com" };
  const subscription = { endpoint: "https://push.example/1", p256dh: "key", authKey: "auth" };

  it("marks 404 and 410 responses as expired subscriptions", async () => {
    for (const statusCode of [404, 410]) {
      const sender = {
        sendNotification: vi.fn(async () => Promise.reject(Object.assign(new Error("gone"), { statusCode }))),
      };
      const adapter = new VapidWebPushAdapter(vapid, sender as never);
      expect(await adapter.send(subscription, { title: "t", body: "b", url: "/" })).toEqual({
        delivered: false,
        statusCode,
        expired: true,
      });
    }
  });

  it("only sends URL-safe topics", async () => {
    const sender = {
      sendNotification: vi.fn(async (..._args: unknown[]) => ({ statusCode: 201, body: "", headers: {} })),
    };
    const adapter = new VapidWebPushAdapter(vapid, sender as never);
    await adapter.send(subscription, { title: "t", body: "b", url: "/", tag: "habit_daily" });
    await adapter.send(subscription, { title: "t", body: "b", url: "/", tag: "has spaces!" });
    expect(sender.sendNotification.mock.calls[0][2]).toMatchObject({ topic: "habit_daily" });
    expect(sender.sendNotification.mock.calls[1][2]).toMatchObject({ topic: undefined });
  });
});

describe("push cron endpoint", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function call(authorization?: string) {
    const { GET } = await import("@/app/api/cron/push-notifications/route");
    return GET(
      new Request("http://localhost/api/cron/push-notifications", {
        headers: authorization ? { Authorization: authorization } : {},
      }),
    );
  }

  it("refuses requests without the right secret, and refuses to run with a weak one", async () => {
    vi.stubEnv("CRON_SECRET", "short");
    expect((await call("Bearer short")).status).toBe(401);

    const secret = "a".repeat(40);
    vi.stubEnv("CRON_SECRET", secret);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"b".repeat(40)}`)).status).toBe(401);
  });

  it("reports a missing secret key instead of running without one", async () => {
    const secret = "a".repeat(40);
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = await call(`Bearer ${secret}`);
    expect(response.status).toBe(503);
  });
});
