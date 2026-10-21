/**
 * Response headers applied to every route. Pages are statically rendered, so
 * scripts can't carry a per-request nonce; 'unsafe-inline' stays in script-src
 * for Next.js' inline bootstrap, while every other directive is locked down.
 */
export function contentSecurityPolicy({
  supabaseUrl,
  development,
}: {
  supabaseUrl?: string;
  development: boolean;
}) {
  const connect = ["'self'"];
  if (supabaseUrl) {
    const origin = new URL(supabaseUrl).origin;
    connect.push(origin, origin.replace(/^http/, "ws"));
  }
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!development) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders(options: { supabaseUrl?: string; development: boolean }) {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (!options.development) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
  }
  return headers;
}
