import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitBucket = "mcp_read" | "mcp_write";

export interface Quota {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export const rateLimits: Record<RateLimitBucket, { max: number; windowSeconds: number }> = {
  mcp_read: { max: 120, windowSeconds: 60 },
  mcp_write: { max: 30, windowSeconds: 60 },
};

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_MEMORY_BUCKETS = 10_000;
let warnedAboutFallback = false;

/**
 * Per-process counter. It only applies to one server instance, so it is the
 * fallback for when the database limiter is unavailable, not the main limit.
 */
export function consumeMemoryQuota(userId: string, bucket: RateLimitBucket, now = Date.now()): Quota {
  const { max, windowSeconds } = rateLimits[bucket];
  if (memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
    for (const [key, value] of memoryBuckets) if (value.resetAt <= now) memoryBuckets.delete(key);
  }
  const key = `${bucket}:${userId}`;
  const current = memoryBuckets.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }
  current.count += 1;
  return {
    allowed: current.count <= max,
    remaining: Math.max(0, max - current.count),
    resetAt: current.resetAt,
  };
}

/** Counts a request against the caller's limit in Postgres, shared by every server instance. */
export async function consumeQuota(
  client: SupabaseClient,
  userId: string,
  bucket: RateLimitBucket,
): Promise<Quota> {
  const { max, windowSeconds } = rateLimits[bucket];
  const { data, error } = await client.rpc("consume_rate_limit", {
    bucket_name: bucket,
    max_requests: max,
    window_seconds: windowSeconds,
  });
  if (error || !data) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn("Database rate limiter unavailable; using per-instance limits.", error?.code ?? "no_data");
    }
    return consumeMemoryQuota(userId, bucket);
  }
  const result = data as { allowed: boolean; remaining: number; reset_at: string };
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt: new Date(result.reset_at).getTime(),
  };
}

export function retryAfterSeconds(quota: Quota, now = Date.now()) {
  return String(Math.max(1, Math.ceil((quota.resetAt - now) / 1000)));
}
