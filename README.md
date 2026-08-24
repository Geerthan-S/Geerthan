# Personal OS

A calm, work-first operating system. Phase 0/1 covers the production foundation, authentication boundary, dashboard, Today, Projects, Tasks, Work Sessions, Inbox/Capture, Activity, and draft-to-commit change sets.

## Run locally

```powershell
npm install
npm run dev
```

The app starts with a complete local preview dataset and persists changes in browser storage. When valid Supabase variables are present, preview data is disabled, authentication is required, and the workspace reads and writes only through the Supabase repository.

## Connect Supabase

1. In the Supabase project Connect dialog, copy the Project URL and Publishable key.
2. Put them in the ignored `.env.local` file as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Apply both SQL files in `supabase/migrations` in filename order.
4. In Authentication URL Configuration, set the local Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` as a redirect URL.
5. Create a password user in Authentication, restart the dev server, and sign in at `/login`.

Do not add a Secret key or legacy `service_role` key. Phase 1 uses the publishable key plus the signed-in user's JWT, so every request remains subject to RLS.

The migrations include user-scoped row-level security, versioned work entities, an immutable activity log, draft change sets, ordered change operations, and transactional RPCs for Phase 1 mutations.

## Architecture

- `src/app` — thin routes, API handlers, auth callback, and request proxy
- `src/features` — Phase 1 UI and feature validation
- `src/domain` — framework-independent models, queries, and change application
- `src/data` — repository contracts, local preview repository, and Supabase access
- `src/integrations` — external connector interfaces only; no connector is implemented in Phase 1
- `src/mcp` — permissioned MCP tool contracts mapped to authenticated APIs
- `supabase` — schema migration and optional database seed

The browser preview repository and the Supabase repository implement separate storage concerns. UI components do not import Supabase. External providers cannot write domain state directly; future adapters must produce validated change sets.

## Safety boundary

- Read tools use `state:read`.
- Planning tools use `draft:write` and cannot apply changes.
- Commit tools use `commit:write` and operate only on reviewed change-set IDs.
- Supabase validates the authenticated user, entity ownership, expected record version, and supported Phase 1 entity type inside a transaction.

## Validation

```powershell
npm run validate
```
