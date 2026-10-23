-- Behavioural tests for 202610230001_reminders_calendar_review.sql.
-- Everything runs in one transaction that is rolled back at the end.

begin;

create function pg_temp.sign_in(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
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
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com', '{"display_name":"User A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.com', '{"display_name":"User B"}');
update public.profiles set timezone = 'UTC';

create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

-- Habit reminders -----------------------------------------------------------

select pg_temp.sign_in('00000000-0000-0000-0000-0000000000a1');
insert into ids select 'gym', (public.create_habit('Gym', 'Train', 'boolean', 1, '', 'emerald')).id;
insert into ids select 'read', (public.create_habit('Read', '', 'boolean', 1, '', 'blue')).id;
insert into ids select 'done', (public.create_habit('Water', '', 'count', 8, 'glasses', 'violet')).id;

-- 00:00 has always passed, so these reminders are due whenever the test runs.
select public.set_habit_reminder((select id from ids where name = 'gym'), '00:00');
select public.set_habit_reminder((select id from ids where name = 'done'), '00:00');
select public.upsert_habit_checkin((select id from ids where name = 'done'), public.private_user_today(), 8, '');

do $$
begin
  assert (select reminder_time from public.habits where id = (select id from ids where name = 'gym')) = '00:00',
    'reminder saved';
end;
$$;

select pg_temp.sign_out();
select pg_temp.sign_in('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error(
  format('select public.set_habit_reminder(%L, %L)', (select id from ids where name = 'gym'), '07:00'),
  'habit_not_found');

-- Browser roles cannot touch credentials or the service-only functions.
select pg_temp.expect_error($$select * from public.integration_credentials$$, 'permission denied');
select pg_temp.expect_error($$select * from public.list_due_integration_syncs('google_calendar')$$, 'permission denied');
select pg_temp.expect_error(
  $$select public.apply_calendar_import(auth.uid(), now(), now() + interval '1 day', '[]')$$, 'permission denied');
select pg_temp.expect_error(
  $$select public.record_integration_sync_failure(auth.uid(), 'google_calendar', 'x', false)$$, 'permission denied');
select pg_temp.sign_out();

-- Push scheduling ----------------------------------------------------------

insert into public.notification_preferences (user_id, push_enabled, habit_reminders)
values ('00000000-0000-0000-0000-0000000000a1', true, true)
on conflict (user_id) do update set push_enabled = true, habit_reminders = true;
insert into public.planning_preferences (user_id, quiet_hours_start, quiet_hours_end)
values ('00000000-0000-0000-0000-0000000000a1', '00:00', '00:00')
on conflict (user_id) do update set quiet_hours_start = '00:00', quiet_hours_end = '00:00';
insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth_key)
values ('00000000-0000-0000-0000-0000000000a1', 'https://push.example/a', 'p256dh-key-a-0000000000', 'auth-a-00');

set local role service_role;
create temp table claimed on commit drop as select * from public.claim_due_push_notifications(100);
reset role;

do $$
declare is_sunday boolean := extract(isodow from (now() at time zone 'UTC')) = 7;
begin
  assert exists (select 1 from claimed where title = 'Time for Gym'), 'open habit with a passed reminder time is pushed';
  assert not exists (select 1 from claimed where title = 'Time for Water'), 'completed habits are not reminded';
  assert not exists (select 1 from claimed where title = 'Time for Read'), 'habits without a reminder time get no own push';
  assert exists (select 1 from claimed where title = 'Daily habit check-in') =
    ((now() at time zone 'UTC')::time >= '20:00'), 'catch-all covers the habit without a reminder, at 20:00';
  assert exists (select 1 from claimed where title = 'Your weekly review is ready') =
    (is_sunday and (now() at time zone 'UTC')::time >= '18:00'), 'weekly review is pushed on Sunday evening only';
  assert (select count(*) from public.notifications where title = 'Time for Gym') = 1, 'one reminder notification';
end;
$$;

set local role service_role;
do $$
begin
  assert not exists (select 1 from public.claim_due_push_notifications(100) where title = 'Time for Gym'),
    'a habit reminder is generated and sent once per day';
end;
$$;
reset role;

-- Google Calendar import -----------------------------------------------------

select pg_temp.sign_in('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$select public.store_integration_credentials('google_calendar', 'short', '', '')$$, 'invalid_credentials');
select pg_temp.expect_error($$select public.store_integration_credentials('github', repeat('x', 40), '', '')$$, 'unsupported_connector');
select public.store_integration_credentials('google_calendar', repeat('x', 40), 'calendar.readonly', 'a@example.com');
insert into ids select 'manual', (public.create_calendar_block_with_activity(
  'Deep work', 'focus', now() + interval '3 hours', now() + interval '4 hours', '')).id;
select pg_temp.sign_out();

do $$
begin
  assert (select status from public.integration_connections
          where user_id = '00000000-0000-0000-0000-0000000000a1' and connector = 'google_calendar') = 'healthy',
    'connection marked healthy';
  assert exists (select 1 from public.integration_credentials where user_id = '00000000-0000-0000-0000-0000000000a1'),
    'credentials stored';
end;
$$;

set local role service_role;
do $$
declare imported integer;
begin
  assert exists (select 1 from public.list_due_integration_syncs('google_calendar') where user_id = '00000000-0000-0000-0000-0000000000a1'),
    'a never-synced connection is due';

  imported := public.apply_calendar_import('00000000-0000-0000-0000-0000000000a1', now() - interval '1 day', now() + interval '14 days',
    jsonb_build_array(
      jsonb_build_object('id', 'evt-1', 'title', 'Standup', 'starts_at', now() + interval '1 day', 'ends_at', now() + interval '1 day 30 minutes'),
      jsonb_build_object('id', 'evt-1', 'title', 'Standup', 'starts_at', now() + interval '1 day', 'ends_at', now() + interval '1 day 30 minutes'),
      jsonb_build_object('id', 'evt-2', 'title', '', 'starts_at', now() + interval '2 days', 'ends_at', now() + interval '2 days 1 hour'),
      jsonb_build_object('id', 'evt-bad', 'title', 'Backwards', 'starts_at', now() + interval '3 days', 'ends_at', now() + interval '2 days')
    ));
  assert imported = 2, format('duplicates and invalid events are skipped, got %s', imported);
  assert (select title from public.calendar_blocks where external_id = 'evt-2') = 'Busy', 'untitled events become Busy';
  assert (select kind from public.calendar_blocks where external_id = 'evt-1') = 'meeting', 'imported as meetings';

  assert not exists (select 1 from public.list_due_integration_syncs('google_calendar') where user_id = '00000000-0000-0000-0000-0000000000a1'),
    'a just-synced connection is not due';

  -- evt-2 was deleted in Google; evt-1 moved.
  imported := public.apply_calendar_import('00000000-0000-0000-0000-0000000000a1', now() - interval '1 day', now() + interval '14 days',
    jsonb_build_array(jsonb_build_object('id', 'evt-1', 'title', 'Standup (moved)', 'starts_at', now() + interval '5 days', 'ends_at', now() + interval '5 days 30 minutes')));
  assert imported = 1, 'update counted';
  assert not exists (select 1 from public.calendar_blocks where external_id = 'evt-2'), 'removed events are deleted';
  assert (select title from public.calendar_blocks where external_id = 'evt-1') = 'Standup (moved)', 'moved events are updated';
  assert (select count(*) from public.calendar_blocks where external_id = 'evt-1') = 1, 'no duplicates after re-import';
  assert exists (select 1 from public.calendar_blocks where id = (select id from ids where name = 'manual')),
    'blocks created in the app are never touched';
end;
$$;
reset role;

-- Other users cannot see imported events.
select pg_temp.sign_in('00000000-0000-0000-0000-0000000000b1');
do $$
begin
  assert not exists (select 1 from public.calendar_blocks where external_provider = 'google_calendar'), 'imports are private';
end;
$$;
select pg_temp.sign_out();

-- A revoked grant stops syncing and drops the stored token.
set local role service_role;
select public.record_integration_sync_failure('00000000-0000-0000-0000-0000000000a1', 'google_calendar', 'invalid_grant', true);
reset role;
do $$
begin
  assert (select status from public.integration_connections
          where user_id = '00000000-0000-0000-0000-0000000000a1' and connector = 'google_calendar') = 'error', 'marked as error';
  assert not exists (select 1 from public.integration_credentials where user_id = '00000000-0000-0000-0000-0000000000a1'),
    'revoked token removed';
end;
$$;

-- Disconnecting removes imported events but keeps the user's own blocks.
select pg_temp.sign_in('00000000-0000-0000-0000-0000000000a1');
select public.store_integration_credentials('google_calendar', repeat('y', 40), 'calendar.readonly', 'a@example.com');
select public.disconnect_integration('google_calendar');
select pg_temp.sign_out();
do $$
begin
  assert not exists (select 1 from public.calendar_blocks
                     where user_id = '00000000-0000-0000-0000-0000000000a1' and external_provider = 'google_calendar'),
    'imported events removed on disconnect';
  assert exists (select 1 from public.calendar_blocks where id = (select id from ids where name = 'manual')), 'own blocks kept';
  assert (select status from public.integration_connections
          where user_id = '00000000-0000-0000-0000-0000000000a1' and connector = 'google_calendar') = 'disconnected',
    'marked disconnected';
end;
$$;

select 'reminders, calendar and review tests passed' as result;

rollback;
