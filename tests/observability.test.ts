import { afterEach, describe, expect, it, vi } from "vitest";
import { redactPath, reportError } from "@/observability/report-error";

describe("error reporting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("strips query strings and fragments that can carry auth codes", () => {
    expect(redactPath("/auth/callback?code=secret-code")).toBe("/auth/callback");
    expect(redactPath("/habits#month")).toBe("/habits");
    expect(redactPath(undefined)).toBeUndefined();
  });

  it("logs one structured line and forwards it when a webhook is configured", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://logs.example/ingest");

    await reportError({ source: "server", message: "boom", path: "/today?token=abc", method: "GET" });

    const logged = JSON.parse(String(log.mock.calls[0][0]));
    expect(logged).toMatchObject({ level: "error", source: "server", message: "boom", path: "/today" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://logs.example/ingest",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("token=abc");
  });

  it("never throws when forwarding fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://logs.example/ingest");
    await expect(reportError({ source: "client", message: "boom" })).resolves.toBeUndefined();
  });
});

describe("client error endpoint", () => {
  it("accepts a small same-origin report and rejects malformed or cross-origin ones", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/telemetry/client-error/route");
    const send = (body: string, origin = "http://localhost") =>
      POST(
        new Request("http://localhost/api/telemetry/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin, "x-forwarded-for": "10.0.0.1" },
          body,
        }),
      );

    expect((await send(JSON.stringify({ message: "x", path: "/habits" }))).status).toBe(204);
    expect((await send(JSON.stringify({ message: "x", extra: "nope" }))).status).toBe(400);
    expect((await send("not json")).status).toBe(400);
    expect((await send(JSON.stringify({ message: "x".repeat(5000) }))).status).toBe(413);
    expect((await send(JSON.stringify({ message: "x" }), "https://evil.example")).status).toBe(403);
  });
});
