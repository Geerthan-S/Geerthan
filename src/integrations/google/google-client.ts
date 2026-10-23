import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const REQUEST_TIMEOUT_MS = 10_000;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export function googleOAuthConfig(env: NodeJS.ProcessEnv = process.env): GoogleOAuthConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function redirectUriFor(origin: string) {
  return `${origin}/api/integrations/google/callback`;
}

/** A random state value and a PKCE verifier/challenge pair for one sign-in attempt. */
export function createAuthorizationSecrets() {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function authorizationUrl(
  config: GoogleOAuthConfig,
  redirectUri: string,
  secrets: { state: string; challenge: string },
  loginHint?: string,
) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    // offline + consent makes Google return a refresh token every time.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: secrets.state,
    code_challenge: secrets.challenge,
    code_challenge_method: "S256",
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return url.toString();
}

export class GoogleApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`google_${code}`);
  }

  /** The user revoked access or the refresh token expired; reconnecting is the only fix. */
  get revoked() {
    return this.code === "invalid_grant";
  }
}

async function tokenRequest(body: Record<string, string>, fetcher: typeof fetch) {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new GoogleApiError(String(json.error ?? "token_request_failed"), response.status);
  return json;
}

export async function exchangeCode(
  config: GoogleOAuthConfig,
  input: { code: string; verifier: string; redirectUri: string },
  fetcher: typeof fetch = fetch,
) {
  const json = await tokenRequest(
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    },
    fetcher,
  );
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    scope: String(json.scope ?? ""),
  };
}

export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
  fetcher: typeof fetch = fetch,
) {
  const json = await tokenRequest(
    {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
    fetcher,
  );
  return String(json.access_token ?? "");
}

export async function revokeToken(token: string, fetcher: typeof fetch = fetch) {
  await fetcher(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => undefined);
}

interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  transparency?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface CalendarEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  url: string;
}

/**
 * Timed, busy events on the primary calendar between two instants. All-day
 * events and events marked "free" are skipped so they don't block planning.
 */
export async function listBusyEvents(
  accessToken: string,
  window: { start: Date; end: Date },
  fetcher: typeof fetch = fetch,
) {
  const events: CalendarEvent[] = [];
  let calendarName = "";
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(EVENTS_URL);
    url.search = new URLSearchParams({
      timeMin: window.start.toISOString(),
      timeMax: window.end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      ...(pageToken ? { pageToken } : {}),
    }).toString();
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => ({}))) as {
      summary?: string;
      items?: GoogleEvent[];
      nextPageToken?: string;
      error?: { status?: string };
    };
    if (!response.ok)
      throw new GoogleApiError(json.error?.status?.toLowerCase() ?? "events_request_failed", response.status);
    calendarName ||= json.summary ?? "";
    for (const item of json.items ?? []) {
      if (!item.id || item.status === "cancelled" || item.transparency === "transparent") continue;
      if (!item.start?.dateTime || !item.end?.dateTime) continue;
      events.push({
        id: item.id,
        title: item.summary ?? "",
        starts_at: new Date(item.start.dateTime).toISOString(),
        ends_at: new Date(item.end.dateTime).toISOString(),
        url: item.htmlLink ?? "",
      });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return { events, calendarName };
}
