import { z } from "zod";
import { reportError } from "@/observability/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
const WINDOW_MS = 60_000;
const MAX_REPORTS_PER_WINDOW = 20;
const recentReports = new Map<string, { count: number; resetAt: number }>();

const clientErrorSchema = z
  .object({
    message: z.string().trim().min(1).max(500),
    digest: z.string().max(100).optional(),
    path: z.string().max(300).optional(),
  })
  .strict();

// Unauthenticated (errors can happen on the sign-in page), so it is size-capped,
// same-origin only and throttled per client address.
function throttled(request: Request) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (recentReports.size > 5000) recentReports.clear();
  const current = recentReports.get(key);
  if (!current || current.resetAt <= now) {
    recentReports.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REPORTS_PER_WINDOW;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (throttled(request)) return new Response(null, { status: 429 });

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let input: z.infer<typeof clientErrorSchema>;
  try {
    input = clientErrorSchema.parse(JSON.parse(text));
  } catch {
    return new Response(null, { status: 400 });
  }

  await reportError({ source: "client", ...input });
  return new Response(null, { status: 204 });
}
