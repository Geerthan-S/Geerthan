import { createMcpHandler, requireBearerAuth } from "@modelcontextprotocol/server";
import { createBearerSupabaseClient } from "@/data/supabase/request-auth";
import { SupabaseWorkspaceReadRepository } from "@/data/supabase/supabase-workspace-read-repository";
import { SupabaseDomainActionRepository } from "@/data/supabase/supabase-domain-action-repository";
import { PersonalOsReadService } from "@/mcp/personal-os-read-service";
import { PersonalOsWriteService } from "@/mcp/personal-os-write-service";
import { consumeReadQuota } from "@/mcp/read-rate-limit";
import { createPersonalOsMcpServer } from "@/mcp/server";
import { supabaseTokenVerifier } from "@/mcp/supabase-token-verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authenticate = requireBearerAuth({
  verifier: supabaseTokenVerifier,
  requiredScopes: ["personal-os:read"],
});

const handler = createMcpHandler(
  ({ authInfo }) => {
    if (!authInfo) throw new Error("Authenticated MCP context required.");
    const client = createBearerSupabaseClient(authInfo.token);
    if (!client) throw new Error("Supabase is not configured.");
    const repository = new SupabaseWorkspaceReadRepository(client, {
      id: authInfo.clientId,
      email: typeof authInfo.extra?.email === "string" ? authInfo.extra.email : undefined,
    });
    const writeRepository = new SupabaseDomainActionRepository(client, authInfo.clientId);
    return createPersonalOsMcpServer(
      new PersonalOsReadService(repository),
      authInfo.scopes.includes("personal-os:write") ? new PersonalOsWriteService(writeRepository) : undefined,
    );
  },
  {
    legacy: "stateless",
    onerror: (error) => console.error("MCP request failed", error.name),
  },
);

function securityHeaders(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function handle(request: Request) {
  if (!validOrigin(request)) return securityHeaders(new Response("Forbidden", { status: 403 }));

  const auth = await authenticate(request);
  if (auth instanceof Response) return securityHeaders(auth);

  const quota = consumeReadQuota(auth.clientId);
  if (!quota.allowed) {
    return securityHeaders(
      Response.json(
        { error: "Read rate limit exceeded." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((quota.resetAt - Date.now()) / 1000)) } },
      ),
    );
  }

  const response = await handler.fetch(request, { authInfo: auth });
  response.headers.set("X-RateLimit-Remaining", String(quota.remaining));
  return securityHeaders(response);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
