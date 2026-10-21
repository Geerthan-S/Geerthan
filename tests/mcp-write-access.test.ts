import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: { data: null as Record<string, unknown> | null, error: null as unknown },
  user: { id: "11111111-1111-4111-8111-111111111111", email: "a@example.test" },
  rpc: vi.fn(),
}));

function fakeClient() {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => state.profile,
  };
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: () => query,
    rpc: state.rpc,
  } as unknown as SupabaseClient;
}

vi.mock("@/data/supabase/request-auth", () => ({
  createBearerSupabaseClient: () => fakeClient(),
  authenticateReadRequest: async (request: Request) =>
    request.headers.get("authorization")
      ? { client: fakeClient(), user: state.user, mode: "bearer" }
      : { client: fakeClient(), user: state.user, mode: "cookie" },
}));

// A structurally valid JWT whose payload only carries an expiry.
const token = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")}.sig`;

describe("MCP write access", () => {
  beforeEach(() => {
    state.profile = { data: null, error: null };
    state.rpc.mockReset();
  });

  it("grants read-only scope unless the user enabled writes", async () => {
    const { supabaseTokenVerifier } = await import("@/mcp/supabase-token-verifier");

    state.profile = { data: { mcp_write_enabled: false }, error: null };
    expect((await supabaseTokenVerifier.verifyAccessToken(token)).scopes).toEqual(["personal-os:read"]);

    state.profile = { data: null, error: { code: "42703", message: "column does not exist" } };
    expect((await supabaseTokenVerifier.verifyAccessToken(token)).scopes).toEqual(["personal-os:read"]);

    state.profile = { data: { mcp_write_enabled: true }, error: null };
    expect((await supabaseTokenVerifier.verifyAccessToken(token)).scopes).toEqual([
      "personal-os:read",
      "personal-os:write",
    ]);
  });

  it("refuses bearer-token domain actions while writes are disabled", async () => {
    state.profile = { data: { mcp_write_enabled: false }, error: null };
    const { POST } = await import("@/app/api/mcp/action/[tool]/route");
    const response = await POST(
      new Request("http://localhost/api/mcp/action/create_task", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      }),
      { params: Promise.resolve({ tool: "create_task" }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "write_access_disabled" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("returns 429 once the shared write limit is exhausted", async () => {
    state.profile = { data: { mcp_write_enabled: true }, error: null };
    state.rpc.mockResolvedValue({
      data: { allowed: false, remaining: 0, reset_at: new Date(Date.now() + 30_000).toISOString() },
      error: null,
    });
    const { POST } = await import("@/app/api/mcp/action/[tool]/route");
    const response = await POST(
      new Request("http://localhost/api/mcp/action/create_task", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      }),
      { params: Promise.resolve({ tool: "create_task" }) },
    );
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(state.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      bucket_name: "mcp_write",
      max_requests: 30,
      window_seconds: 60,
    });
  });
});

describe("rate limits", () => {
  it("uses the database counter when it is available", async () => {
    const { consumeQuota } = await import("@/mcp/rate-limit");
    const resetAt = "2026-10-21T10:01:00.000Z";
    const client = {
      rpc: vi.fn(async () => ({ data: { allowed: true, remaining: 7, reset_at: resetAt }, error: null })),
    } as unknown as SupabaseClient;
    expect(await consumeQuota(client, "user", "mcp_read")).toEqual({
      allowed: true,
      remaining: 7,
      resetAt: Date.parse(resetAt),
    });
  });

  it("falls back to a per-instance counter when the database limiter is missing", async () => {
    const { consumeQuota } = await import("@/mcp/rate-limit");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202" } })),
    } as unknown as SupabaseClient;
    const results = [];
    for (let index = 0; index < 31; index += 1)
      results.push(await consumeQuota(client, "fallback-user", "mcp_write"));
    expect(results[29].allowed).toBe(true);
    expect(results[30].allowed).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("resets the per-instance counter after the window", async () => {
    const { consumeMemoryQuota } = await import("@/mcp/rate-limit");
    const start = 1_000_000;
    for (let index = 0; index < 120; index += 1) consumeMemoryQuota("window-user", "mcp_read", start);
    expect(consumeMemoryQuota("window-user", "mcp_read", start).allowed).toBe(false);
    expect(consumeMemoryQuota("window-user", "mcp_read", start + 60_001).allowed).toBe(true);
  });
});
