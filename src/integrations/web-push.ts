import "server-only";

import webpush from "web-push";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}
export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  authKey: string;
}
export interface PushDeliveryResult {
  delivered: boolean;
  statusCode?: number;
  /** The push service no longer knows this subscription; stop sending to it. */
  expired: boolean;
}
export interface WebPushDeliveryAdapter {
  configured(): boolean;
  send(subscription: PushSubscriptionRecord, message: PushMessage): Promise<PushDeliveryResult>;
}

export class UnconfiguredWebPushAdapter implements WebPushDeliveryAdapter {
  configured() {
    return false;
  }
  async send(): Promise<PushDeliveryResult> {
    throw new Error("web_push_not_configured");
  }
}

const PUSH_TTL_SECONDS = 60 * 60 * 12;
// Push services only accept short URL-safe topics; anything else is sent without one.
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export class VapidWebPushAdapter implements WebPushDeliveryAdapter {
  constructor(
    private readonly vapid: { publicKey: string; privateKey: string; subject: string },
    private readonly sender: Pick<typeof webpush, "sendNotification"> = webpush,
  ) {}

  configured() {
    return true;
  }

  async send(subscription: PushSubscriptionRecord, message: PushMessage): Promise<PushDeliveryResult> {
    try {
      const response = await this.sender.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.authKey },
        },
        JSON.stringify(message),
        {
          vapidDetails: this.vapid,
          TTL: PUSH_TTL_SECONDS,
          urgency: "normal",
          topic: message.tag && TOPIC_PATTERN.test(message.tag) ? message.tag : undefined,
        },
      );
      return { delivered: true, statusCode: response.statusCode, expired: false };
    } catch (error) {
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : undefined;
      return { delivered: false, statusCode, expired: statusCode === 404 || statusCode === 410 };
    }
  }
}

/** Uses VAPID keys from the environment when all three are present. */
export function createWebPushAdapter(env: NodeJS.ProcessEnv = process.env): WebPushDeliveryAdapter {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return new UnconfiguredWebPushAdapter();
  return new VapidWebPushAdapter({ publicKey, privateKey, subject });
}
