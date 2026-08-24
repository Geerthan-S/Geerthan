# Personal OS

A calm, work-first operating system. Phase 0/1 covers the production foundation, authentication boundary, dashboard, Today, Projects, Tasks, Work Sessions, Inbox/Capture, Activity, and draft-to-commit change sets.

## Run locally

```powershell
npm install
npm run dev
```

The app starts with a complete local preview dataset and persists changes in browser storage. Open `/login` to see the authentication state. When Supabase keys are absent, the login screen offers preview access.

## Connect Supabase

1. Copy `.env.example` to `.env.local` and fill in the Supabase URL and keys.
2. Apply `supabase/migrations/202608250001_phase_0_1_foundation.sql`.
3. Configure the Supabase auth callback as `/auth/callback`.

The migration includes user-scoped row-level security, versioned work entities, an immutable activity log, draft change sets, ordered change operations, and a transactional Phase 1 commit function.

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
