import "server-only";

import { timingSafeEqual } from "node:crypto";

/** True when the request carries "Authorization: Bearer $CRON_SECRET" and the secret is long enough. */
export function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
