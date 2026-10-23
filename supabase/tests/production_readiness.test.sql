-- Behavioural tests for 202610210001_production_readiness.sql.
-- Run against a disposable database after applying every migration:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/production_readiness.test.sql
-- Everything runs in one transaction that is rolled back at the end.

begin;

create function pg_temp.sign_in(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  -- Older auth.uid() definitions read the per-claim setting instead.
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute 'set local role authenticated';
end;
$$;

create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then
      raise exception 'expected error "%" but got "%" for: %', expected, sqlerrm, statement;
    end if;
    return;
  end;
  raise exception 'expected error "%" but the statement succeeded: %', expected, statement;
end;
$$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"display_name":"User A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"display_name":"User B"}');

-- Tasks and projects -------------------------------------------------------

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

insert into ids select 'project', (public.create_project('Thesis', 'ths', 'Write it', 'University', null, 'violet')).id;
insert into ids select 'task', (public.create_task_with_activity('Draft chapter 1', 'high', (select id from ids where name = 'project'), null)).id;

do $$
declare updated public.tasks; project public.projects;
begin
  select * into project from public.projects where id = (select id from ids where name = 'project');
  assert project.code = 'THS', 'project code is upper-cased';

  updated := public.update_task_details((select id from ids where name = 'task'), 1, '  Draft chapter one ', 'critical', null, '2026-11-01T10:00:00Z', 90);
  assert updated.title = 'Draft chapter one', 'title is trimmed';
  assert updated.project_id is null and updated.priority = 'critical' and updated.estimate_minutes = 90, 'fields updated';
  assert updated.version = 2, 'version increments';
end;
$$;

select pg_temp.expect_error(
  format('select public.update_task_details(%L, 1, %L, %L, null, null, 30)', (select id from ids where name = 'task'), 'Stale', 'low'),
  'version_conflict');

select pg_temp.expect_error(
  format('select public.update_project(%L, 1, %L::jsonb)', (select id from ids where name = 'project'), '{"owner":"x"}'),
  'unsupported_project_field');

select public.update_project((select id from ids where name = 'project'), 1, '{"progress": 40, "health": "at_risk"}');

-- User B cannot see or change user A's records.
select pg_temp.sign_out();
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select pg_temp.expect_error(format('select public.delete_task(%L)', (select id from ids where name = 'task')), 'task_not_found');
select pg_temp.expect_error(format('select public.delete_project(%L)', (select id from ids where name = 'project')), 'project_not_found');
select pg_temp.expect_error(
  format('select public.update_task_details(%L, 2, %L, %L, null, null, 30)', (select id from ids where name = 'task'), 'Hijack', 'low'),
  'task_not_found');

-- Habits -------------------------------------------------------------------

select pg_temp.sign_out();
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

insert into ids select 'habit_bool', (public.create_habit('Cold shower', '', 'boolean', 5, 'minutes', 'blue')).id;
insert into ids select 'habit_steps', (public.create_habit('Steps', 'Walk', 'count', 10000, 'steps', 'emerald')).id;

do $$
declare bool_habit public.habits; steps_habit public.habits; saved public.habit_logs;
begin
  select * into bool_habit from public.habits where id = (select id from ids where name = 'habit_bool');
  select * into steps_habit from public.habits where id = (select id from ids where name = 'habit_steps');
  assert bool_habit.target_value = 1 and bool_habit.unit = '', 'boolean habits always target 1 with no unit';
  assert steps_habit.sort_order > bool_habit.sort_order, 'new habits are appended';

  saved := public.upsert_habit_checkin(steps_habit.id, public.private_user_today() - 3, 12000, 'backfilled');
  assert saved.value = 12000, 'past check-ins are allowed';
  saved := public.upsert_habit_checkin(bool_habit.id, public.private_user_today(), 7, '');
  assert saved.value = 1, 'boolean check-ins are clamped to 1';
end;
$$;

select pg_temp.expect_error(
  format('select public.upsert_habit_checkin(%L, public.private_user_today() + 1, 1, %L)', (select id from ids where name = 'habit_bool'), ''),
  'invalid_habit_date_future');
select pg_temp.expect_error(
  format('select public.upsert_habit_checkin(%L, public.private_user_today() - 400, 1, %L)', (select id from ids where name = 'habit_bool'), ''),
  'invalid_habit_date_too_old');
select pg_temp.expect_error(
  format('select public.create_habit(%L, %L, %L, 0, %L, %L)', 'Bad', '', 'count', '', 'blue'),
  'invalid_habit_target');

select public.reorder_habits(array[(select id from ids where name = 'habit_steps'), (select id from ids where name = 'habit_bool')]);
do $$
begin
  assert (select sort_order from public.habits where id = (select id from ids where name = 'habit_steps')) = 1, 'reorder sets position 1';
  assert (select sort_order from public.habits where id = (select id from ids where name = 'habit_bool')) = 2, 'reorder sets position 2';
end;
$$;

select public.update_habit((select id from ids where name = 'habit_steps'), 2, 'Daily steps', 'Walk more', 8000, 'steps', 'amber');
select public.set_habit_active((select id from ids where name = 'habit_steps'), false);
select pg_temp.expect_error(
  format('select public.upsert_habit_checkin(%L, public.private_user_today(), 1, %L)', (select id from ids where name = 'habit_steps'), ''),
  'habit_not_found');
select public.set_habit_active((select id from ids where name = 'habit_steps'), true);

select pg_temp.sign_out();
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(
  format('select public.reorder_habits(array[%L]::uuid[])', (select id from ids where name = 'habit_bool')),
  'habit_not_found');
select pg_temp.expect_error(
  format('select public.set_habit_active(%L, false)', (select id from ids where name = 'habit_bool')),
  'habit_not_found');

-- Settings -----------------------------------------------------------------

select pg_temp.sign_out();
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select pg_temp.expect_error($$select public.update_profile_settings('A', 'Mars/Olympus', 300)$$, 'invalid_timezone');
select public.update_profile_settings('Alex', 'Europe/London', 240);
select pg_temp.expect_error(
  $$select public.update_planning_preferences('18:00', '09:00', 90, 15, '22:00', '07:00', true)$$,
  'invalid_workday_range');
select public.update_planning_preferences('08:30', '17:30', 60, 10, '23:00', '06:30', false);

do $$
begin
  assert (select mcp_write_enabled from public.profiles where id = auth.uid()) = false, 'MCP writes are off by default';
  perform public.set_mcp_write_access(true);
  assert (select mcp_write_enabled from public.profiles where id = auth.uid()) = true, 'MCP writes can be enabled';
  assert (select timezone from public.profiles where id = auth.uid()) = 'Europe/London', 'timezone saved';
  assert (select workday_start from public.planning_preferences where user_id = auth.uid()) = '08:30', 'planning saved';
end;
$$;

-- Export only contains the caller's rows.
do $$
declare exported jsonb;
begin
  exported := public.export_my_data();
  assert exported -> 'profile' ->> 'display_name' = 'Alex', 'export includes profile';
  assert jsonb_array_length(exported -> 'habits') = 2, 'export includes habits';
  assert jsonb_array_length(exported -> 'tasks') = 1, 'export includes tasks';
  assert not exported ? 'action_receipts', 'idempotency receipts are not exported';
  assert not exported ? 'api_rate_limits', 'rate limit counters are not exported';
end;
$$;

-- Rate limits --------------------------------------------------------------

do $$
declare result jsonb;
begin
  result := public.consume_rate_limit('mcp_write', 2, 60);
  assert (result ->> 'allowed')::boolean and (result ->> 'remaining')::int = 1, 'first request allowed';
  result := public.consume_rate_limit('mcp_write', 2, 60);
  assert (result ->> 'allowed')::boolean and (result ->> 'remaining')::int = 0, 'second request allowed';
  result := public.consume_rate_limit('mcp_write', 2, 60);
  assert not (result ->> 'allowed')::boolean, 'third request blocked';
end;
$$;

select pg_temp.expect_error($$select public.consume_rate_limit('anything', 2, 60)$$, 'invalid_rate_limit_bucket');
select pg_temp.expect_error($$select * from public.api_rate_limits$$, 'permission denied');
select pg_temp.expect_error($$delete from public.api_rate_limits$$, 'permission denied');

-- Push claiming is reserved for the trusted scheduler.
select pg_temp.expect_error($$select * from public.claim_due_push_notifications(10)$$, 'permission denied');
select pg_temp.expect_error($$select public.deactivate_push_subscription(gen_random_uuid())$$, 'permission denied');

select pg_temp.sign_out();
select pg_temp.expect_error($$set local role anon; select public.export_my_data()$$, 'permission denied');
select pg_temp.sign_out();

-- Push delivery ------------------------------------------------------------

insert into public.notification_preferences (user_id, push_enabled, task_reminders)
values ('00000000-0000-0000-0000-00000000000a', true, true),
       ('00000000-0000-0000-0000-00000000000b', true, false)
on conflict (user_id) do update set push_enabled = excluded.push_enabled, task_reminders = excluded.task_reminders;
insert into public.planning_preferences (user_id, quiet_hours_start, quiet_hours_end)
values ('00000000-0000-0000-0000-00000000000b', '00:00', '00:00')
on conflict (user_id) do update set quiet_hours_start = '00:00', quiet_hours_end = '00:00';
-- User A's quiet hours never cover "now" during the test.
update public.planning_preferences set quiet_hours_start = '00:00', quiet_hours_end = '00:00'
where user_id = '00000000-0000-0000-0000-00000000000a';

insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth_key) values
  ('00000000-0000-0000-0000-00000000000a', 'https://push.example/a', 'p256dh-key-a-0000000000', 'auth-a-00'),
  ('00000000-0000-0000-0000-00000000000b', 'https://push.example/b', 'p256dh-key-b-0000000000', 'auth-b-00');
insert into public.notifications (user_id, kind, title, scheduled_for) values
  ('00000000-0000-0000-0000-00000000000a', 'task', 'Due now', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-00000000000a', 'task', 'Later', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-00000000000a', 'task', 'Stale', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000b', 'task', 'B muted kind', now() - interval '1 minute');

set local role service_role;
do $$
declare claimed_titles text[];
begin
  select array_agg(title order by title) into claimed_titles
  from public.claim_due_push_notifications(50) where user_id = '00000000-0000-0000-0000-00000000000a' and title <> 'Daily habit check-in';
  assert claimed_titles = array['Due now'], format('only due, fresh notifications are claimed, got %s', claimed_titles);
  assert not exists (select 1 from public.claim_due_push_notifications(50) where title = 'Due now'), 'claimed notifications are not sent twice';
  assert not exists (
    select 1 from public.notifications where title = 'B muted kind' and pushed_at is not null
  ), 'disabled reminder kinds are not pushed';
end;
$$;
reset role;

-- Quiet hours.
do $$
begin
  assert public.private_in_quiet_hours('23:30', '22:00', '07:00'), 'overnight quiet hours include late evening';
  assert public.private_in_quiet_hours('06:00', '22:00', '07:00'), 'overnight quiet hours include early morning';
  assert not public.private_in_quiet_hours('12:00', '22:00', '07:00'), 'midday is outside overnight quiet hours';
  assert public.private_in_quiet_hours('13:30', '13:00', '14:00'), 'same-day quiet hours';
  assert not public.private_in_quiet_hours('13:30', '00:00', '00:00'), 'equal bounds disable quiet hours';
end;
$$;

-- Account deletion ---------------------------------------------------------

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.delete_my_account();
select pg_temp.sign_out();

do $$
begin
  assert not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a'), 'auth user removed';
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profile removed';
  assert not exists (select 1 from public.tasks where user_id = '00000000-0000-0000-0000-00000000000a'), 'tasks removed';
  assert not exists (select 1 from public.habit_logs where user_id = '00000000-0000-0000-0000-00000000000a'), 'habit logs removed';
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'other users are untouched';
end;
$$;

select 'production readiness tests passed' as result;

rollback;
