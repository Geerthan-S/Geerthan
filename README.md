# Personal OS

A calm, work-first operating system built with Next.js, TypeScript, Tailwind and Supabase. Supabase is the canonical record for work, planning, habits, business, finance, growth, DSA, academics, goals, analytics, notifications, activity and connector state.

## Local setup

```powershell
npm install
npm run dev
```

Copy `.env.example` to the ignored `.env.local` file and provide:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase Project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser-safe publishable key.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — optional browser-push public key.
- `VAPID_PRIVATE_KEY` — optional server-only push key; never expose it to the browser.
- `VAPID_SUBJECT` — optional push contact URI such as `mailto:you@example.com`.
- `CRON_SECRET` and `SUPABASE_SECRET_KEY` — optional, server-only; needed for scheduled push delivery.
- `ERROR_WEBHOOK_URL` — optional JSON endpoint that receives server and browser errors.

Apply every migration in `supabase/migrations` in filename order. In Supabase Auth, set the local Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback`.

Never add a Supabase secret or `service_role` key to browser code. Signed-in requests use the publishable key plus the user's JWT and remain subject to RLS.

## Product surfaces

- Work-first dashboard, Today, calendar planning, projects, tasks, sessions and Inbox/Capture.
- Habit tracking, draft/review/commit plans, rescheduling and reversible change sets.
- Clients, contacts, notes, delivery, proposals, invoices, partial payments, pipeline and finance.
- Skills, roadmaps, learning evidence, DSA tracking, courses and revision scheduling.
- Semesters, subjects, faculty, timetable, attendance, coursework, exams and syllabus progress.
- Goals, areas, contribution links, priority scoring, analytics, notification center and PWA shell.
- Secure MCP read tools and explicit idempotent domain-write actions.
- Typed, unconfigured adapter boundaries for Google Calendar, Teams, LMS, VTOP MCP, GitHub, Gmail and LeetCode.

## Architecture

- `src/app` — thin pages, authenticated API handlers and auth boundary.
- `src/features` — product UI and input validation.
- `src/domain` — normalized records, planning and read-model logic.
- `src/data` — repository contracts and Supabase implementations.
- `src/integrations` — typed provider boundaries and truthful connection status.
- `src/mcp` — authenticated, user-scoped MCP tools.
- `supabase/migrations` — versioned schema, RLS, audit and domain RPCs.

External providers never receive arbitrary database access. Their adapters normalize external records before domain actions or reviewed change sets are used.

## Validation

```powershell
npm run validate       # formatting, unit tests, types, lint, production build
npm run test:e2e       # Playwright, desktop and mobile, against the production build
npm run test:db        # migrations + SQL tests; needs DATABASE_URL (see below)
```

`test:db` needs a disposable Supabase Postgres database:

```bash
docker run -d --name personal-os-db -e POSTGRES_PASSWORD=postgres -p 54329:5432 supabase/postgres:17.11.0.004
DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres npm run test:db
```

CI (`.github/workflows/ci.yml`) runs all three on every pull request.

## Production checklist

1. **Database** — apply every file in `supabase/migrations` in order (`supabase db push`, or the SQL editor). Turn on daily backups and point-in-time recovery in the Supabase dashboard, and test a restore once.
2. **Auth** — set the Site URL and redirect URLs to the production domain, enable email confirmation, and keep Supabase's sign-in rate limits on.
3. **Environment** — set the variables above in your host. Secrets stay server-only.
4. **Push and sync** — generate VAPID keys, set `CRON_SECRET` and `SUPABASE_SECRET_KEY`, then call `GET /api/cron/push-notifications` with `Authorization: Bearer $CRON_SECRET` every 5–15 minutes (and `GET /api/cron/calendar-sync` if Google Calendar is set up). Use your host's scheduler, or set the `APP_URL` repository variable and `CRON_SECRET` secret to enable `.github/workflows/push-notifications.yml`.
5. **Errors** — server and browser errors are logged as one JSON line each (query strings removed). Set `ERROR_WEBHOOK_URL` to forward them to your log or error service.
6. **AI assistants (MCP)** — connected assistants are read-only until you choose **Settings → AI assistants → Allow changes**. MCP clients authenticate with a Supabase session token, so anyone holding that token has your full access through the Supabase API as well; sign out everywhere if one leaks. Per-client OAuth scopes need Supabase's OAuth server and are not set up yet.

## Google Calendar

Read-only import of the next 14 days of timed, busy events into Calendar and Today. The day planner schedules around them, and nothing is written back to Google.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Under **Google Auth Platform → Branding**, fill in the app name and your email. Under **Audience**, choose **External**, then **Publish app** (while it stays in _Testing_, Google expires access every 7 days). Under **Data access**, add the scope `.../auth/calendar.events.readonly`.
3. Under **Clients → Create client**, choose **Web application**, and add the authorized redirect URI `https://<your-domain>/api/integrations/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `INTEGRATION_ENCRYPTION_KEY` (`openssl rand -base64 32`) in Vercel, and redeploy.
5. In the app, open **Settings → Google Calendar → Connect**. Google shows an "unverified app" warning for personal projects; choose **Advanced → Go to …** to continue.

Refresh tokens are encrypted with AES-256-GCM before storage, and only server-side jobs can read them. The scheduled workflow syncs every connection every ~30 minutes. Changing `INTEGRATION_ENCRYPTION_KEY` later disconnects everyone, who then has to connect again.

## Security notes

- Every table uses row-level security; browser code only ever holds the publishable key.
- Security headers (CSP, HSTS, frame and referrer policy) are set in `next.config.ts`. Pages are statically rendered, so `script-src` allows inline scripts for the Next.js bootstrap; every other directive is strict.
- MCP and domain-action rate limits are counted in Postgres (`consume_rate_limit`), so they hold across server instances.
- Account deletion (`delete_my_account`) removes the auth user, which cascades to every user-owned row. Export first from Settings if needed.
