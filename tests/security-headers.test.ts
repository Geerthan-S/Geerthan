import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/shared/lib/security-headers";

describe("security headers", () => {
  it("only allows connections to this origin and the configured Supabase project", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co/", development: false });
    expect(policy).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("relaxes only what local development needs", () => {
    const policy = contentSecurityPolicy({ development: true });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(securityHeaders({ development: true }).map((header) => header.key)).not.toContain(
      "Strict-Transport-Security",
    );
  });

  it("sends HSTS and clickjacking protection in production", () => {
    const keys = securityHeaders({ development: false }).map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining(["Strict-Transport-Security", "X-Frame-Options", "Content-Security-Policy"]),
    );
  });
});
