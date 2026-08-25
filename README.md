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
npm run validate
```

This runs automated tests, TypeScript, ESLint and the production build.
