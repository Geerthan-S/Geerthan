import "server-only";

export interface ErrorReport {
  source: "server" | "client";
  message: string;
  digest?: string;
  path?: string;
  method?: string;
  routeType?: string;
}

const FORWARD_TIMEOUT_MS = 2000;

/** Drops query strings and fragments, which can carry auth codes or tokens. */
export function redactPath(path: string | undefined) {
  if (!path) return undefined;
  return path.split(/[?#]/)[0].slice(0, 300);
}

/**
 * Writes one structured log line per error, and forwards it to ERROR_WEBHOOK_URL
 * (any JSON ingest endpoint, such as a Sentry, Better Stack or Axiom HTTP source)
 * when that variable is set. Request headers and bodies are never included.
 */
export async function reportError(report: ErrorReport) {
  const event = {
    level: "error",
    time: new Date().toISOString(),
    source: report.source,
    message: report.message.slice(0, 500),
    digest: report.digest,
    path: redactPath(report.path),
    method: report.method,
    routeType: report.routeType,
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_RELEASE,
  };
  console.error(JSON.stringify(event));

  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
  } catch {
    // Reporting must never turn one failure into two.
  }
}
