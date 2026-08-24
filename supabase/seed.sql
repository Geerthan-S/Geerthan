-- Runtime preview data lives in src/data/seed.ts so every screen is useful before
-- Supabase credentials exist. This file seeds any profile already present when
-- `supabase db reset` runs and intentionally never creates an auth user.
do $$
declare
  target_user uuid;
  atlas_id uuid := '10000000-0000-4000-8000-000000000001';
  internship_id uuid := '10000000-0000-4000-8000-000000000002';
begin
  select id into target_user from public.profiles order by created_at limit 1;
  if target_user is null then return; end if;
  if exists (select 1 from public.projects where user_id = target_user) then return; end if;

  insert into public.projects (id, user_id, name, code, description, client_name, health, progress, deadline, next_milestone, accent)
  values
    (atlas_id, target_user, 'Atlas client portal', 'ATL', 'Ship the reporting and approvals workspace.', 'Northstar Labs', 'on_track', 68, now() + interval '9 days', 'Stakeholder walkthrough', 'blue'),
    (internship_id, target_user, 'Internship platform refresh', 'IPR', 'Improve onboarding and the core task workflow.', 'Internship', 'at_risk', 42, now() + interval '4 days', 'Navigation handoff', 'violet');

  insert into public.tasks (user_id, project_id, title, priority, due_at, scheduled_start, scheduled_end, estimate_minutes, tags)
  values
    (target_user, atlas_id, 'Review Atlas approval flow with client notes', 'critical', date_trunc('day', now()) + interval '12 hours 30 minutes', date_trunc('day', now()) + interval '9 hours 30 minutes', date_trunc('day', now()) + interval '10 hours 45 minutes', 75, array['client','deep work']),
    (target_user, internship_id, 'Finish responsive navigation states', 'high', date_trunc('day', now()) + interval '18 hours', date_trunc('day', now()) + interval '11 hours 15 minutes', date_trunc('day', now()) + interval '12 hours 45 minutes', 90, array['internship','frontend']);
end $$;
