import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));

vi.mock("@/data/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
    rpc: vi.fn(),
  }),
}));

const KEY = Buffer.alloc(32, 7).toString("base64");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllEnvs();
  auth.user = null;
});

describe("token encryption", () => {
  it("round-trips and never stores the token in plain text", async () => {
    const { decryptToken, encryptToken } = await import("@/integrations/google/token-crypto");
    const sealed = encryptToken("1//refresh-token", KEY);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("refresh-token");
    expect(decryptToken(sealed, KEY)).toBe("1//refresh-token");
    expect(encryptToken("same", KEY)).not.toBe(encryptToken("same", KEY));
  });

  it("rejects tampered values, the wrong key and malformed keys", async () => {
    const { decryptToken, encryptToken, encryptionConfigured } =
      await import("@/integrations/google/token-crypto");
    const sealed = encryptToken("secret", KEY);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."), KEY)).toThrow();
    expect(() => decryptToken(sealed, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    expect(encryptionConfigured("too-short")).toBe(false);
    expect(encryptionConfigured(KEY)).toBe(true);
  });
});

describe("Google OAuth", () => {
  it("asks for read-only offline access with PKCE", async () => {
    const { authorizationUrl, createAuthorizationSecrets, GOOGLE_CALENDAR_SCOPE } =
      await import("@/integrations/google/google-client");
    const secrets = createAuthorizationSecrets();
    const url = new URL(
      authorizationUrl(
        { clientId: "client", clientSecret: "secret" },
        "https://app.test/cb",
        secrets,
        "a@b.c",
      ),
    );
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(GOOGLE_CALENDAR_SCOPE).toContain("readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(secrets.verifier);
    expect(url.searchParams.get("state")).toBe(secrets.state);
    expect(url.toString()).not.toContain("secret");
  });
});

describe("event import", () => {
  it("keeps timed busy events and follows pages", async () => {
    const { listBusyEvents } = await import("@/integrations/google/google-client");
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (!url.searchParams.get("pageToken")) {
        return json({
          summary: "me@example.com",
          nextPageToken: "page-2",
          items: [
            {
              id: "a",
              summary: "Standup",
              start: { dateTime: "2026-10-26T09:00:00+05:30" },
              end: { dateTime: "2026-10-26T09:15:00+05:30" },
            },
            {
              id: "b",
              status: "cancelled",
              start: { dateTime: "2026-10-26T10:00:00Z" },
              end: { dateTime: "2026-10-26T11:00:00Z" },
            },
            { id: "c", summary: "Holiday", start: { date: "2026-10-27" }, end: { date: "2026-10-28" } },
            {
              id: "d",
              transparency: "transparent",
              start: { dateTime: "2026-10-26T12:00:00Z" },
              end: { dateTime: "2026-10-26T13:00:00Z" },
            },
          ],
        });
      }
      return json({
        items: [
          { id: "e", start: { dateTime: "2026-10-27T08:00:00Z" }, end: { dateTime: "2026-10-27T09:00:00Z" } },
        ],
      });
    });

    const { events, calendarName } = await listBusyEvents(
      "token",
      { start: new Date("2026-10-25T00:00:00Z"), end: new Date("2026-11-08T00:00:00Z") },
      fetcher as unknown as typeof fetch,
    );

    expect(events.map((event) => event.id)).toEqual(["a", "e"]);
    expect(events[0]).toMatchObject({ title: "Standup", starts_at: "2026-10-26T03:30:00.000Z" });
    expect(calendarName).toBe("me@example.com");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstCall = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect((firstCall[1].headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("imports through the service client and records revoked access", async () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    const { encryptToken } = await import("@/integrations/google/token-crypto");
    const { syncUserCalendar } = await import("@/integrations/google/calendar-sync");
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    const connection = { user_id: "user-a", encrypted_refresh_token: encryptToken("refresh") };
    const config = { clientId: "id", clientSecret: "secret" };

    const ok = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("oauth2.googleapis.com/token")
        ? json({ access_token: "access" })
        : json({
            items: [
              {
                id: "a",
                start: { dateTime: "2026-10-26T09:00:00Z" },
                end: { dateTime: "2026-10-26T10:00:00Z" },
              },
            ],
          }),
    );
    expect(await syncUserCalendar(client, config, connection, ok as unknown as typeof fetch)).toMatchObject({
      ok: true,
      imported: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      "apply_calendar_import",
      expect.objectContaining({ target_user: "user-a", events: [expect.objectContaining({ id: "a" })] }),
    );

    rpc.mockClear();
    const revoked = vi.fn(async () => json({ error: "invalid_grant" }, 400));
    expect(
      await syncUserCalendar(client, config, connection, revoked as unknown as typeof fetch),
    ).toMatchObject({
      ok: false,
      error: "revoked",
    });
    expect(rpc).toHaveBeenCalledWith(
      "record_integration_sync_failure",
      expect.objectContaining({ target_user: "user-a", revoked: true }),
    );
    expect(rpc).not.toHaveBeenCalledWith("apply_calendar_import", expect.anything());
  });
});

describe("OAuth routes", () => {
  it("sends users back to Settings when Google isn't configured", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    const { GET } = await import("@/app/api/integrations/google/connect/route");
    const response = await GET(new NextRequest("https://app.test/api/integrations/google/connect"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/settings?google=not_configured");
  });

  it("starts sign-in with an http-only state cookie for a signed-in user", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", KEY);
    auth.user = { id: "user-a", email: "a@example.com" };
    const { GET } = await import("@/app/api/integrations/google/connect/route");
    const response = await GET(new NextRequest("https://app.test/api/integrations/google/connect"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://app.test/api/integrations/google/callback",
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain(location.searchParams.get("state"));
  });

  it("rejects a callback whose state doesn't match the cookie", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    auth.user = { id: "user-a", email: "a@example.com" };
    const { GET } = await import("@/app/api/integrations/google/callback/route");
    const request = new NextRequest(
      "https://app.test/api/integrations/google/callback?code=abc&state=forged",
      {
        headers: { cookie: "pos_google_oauth=real-state.verifier.user-a" },
      },
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toBe("https://app.test/settings?google=invalid_state");
  });

  it("rejects a callback finished by a different signed-in user", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    auth.user = { id: "user-b", email: "b@example.com" };
    const { GET } = await import("@/app/api/integrations/google/callback/route");
    const request = new NextRequest("https://app.test/api/integrations/google/callback?code=abc&state=same", {
      headers: { cookie: "pos_google_oauth=same.verifier.user-a" },
    });
    expect((await GET(request)).headers.get("location")).toBe(
      "https://app.test/settings?google=invalid_state",
    );
  });
});
