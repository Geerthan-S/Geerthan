# Personal OS MCP read layer

Phase 3 exposes nine read-only tools over a web-standard MCP endpoint and a cookie-authenticated diagnostics API.

## Boundaries

- Supabase tables and RLS remain the source of truth.
- Every production read starts from the authenticated Supabase user and explicitly filters all user-owned tables by that user ID.
- The MCP endpoint accepts a valid Supabase access token with the `Bearer` scheme. It does not accept credentials in query strings or request bodies.
- Tool inputs are strict and bounded before repository access.
- MCP exposes no write, draft, commit, connector, or external-integration tools in Phase 3.
- Responses disable caching and return compact normalized JSON.

## Endpoints

- MCP protocol: `POST /api/mcp`
- Authenticated tool manifest: `GET /api/mcp/tools`
- Developer diagnostics adapter: `POST /api/mcp/read/{tool_name}`
- UI inspector: `/mcp-diagnostics`

The UI inspector uses the same read service as MCP. It uses the current web session only to authenticate; it does not read the workspace provider or browser state.

## Read tools

1. `get_planning_context`
2. `get_today`
3. `get_calendar_range`
4. `get_open_tasks`
5. `get_projects`
6. `get_work_sessions`
7. `get_habits`
8. `get_activity_history`
9. `get_week_summary`

## Local protocol request

Use a short-lived Supabase access token obtained through the normal login flow. Never save it in the repository, scripts, shell history, fixtures, or environment files.

```text
Authorization: Bearer <short-lived-user-access-token>
Content-Type: application/json
```

The diagnostics page is the preferred local test harness because it uses the signed-in browser session without copying or persisting access tokens.
