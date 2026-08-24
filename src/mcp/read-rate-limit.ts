import "server-only";

const WINDOW_MS = 60_000;
const MAX_READS = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function consumeReadQuota(userId: string) {
  const now = Date.now();
  const current = buckets.get(userId);
  if (!current || current.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_READS - 1, resetAt: now + WINDOW_MS };
  }
  current.count += 1;
  return { allowed: current.count <= MAX_READS, remaining: Math.max(0, MAX_READS - current.count), resetAt: current.resetAt };
}
