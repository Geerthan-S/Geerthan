-- Per-habit reminder times, read-only Google Calendar import and the Sunday
-- weekly-review reminder.

-- ---------------------------------------------------------------------------
-- Habit reminders
-- ---------------------------------------------------------------------------

alter table public.habits add column if not exists reminder_time time;

create or replace function public.set_habit_reminder(target_habit uuid, habit_reminder time)
returns public.habits
language plpgsql
security invoker
set search_path = public
as $$
declare previous public.habits; updated public.habits;
begin
  select * into previous from public.habits where id = target_habit and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'habit_not_found'; end if;
  update public.habits set reminder_time = habit_reminder where id = previous.id returning * into updated;
  perform public.private_log_activity('habit_updated', 'habit', updated.id,
    case when habit_reminder is null then 'Turned off the reminder for ' else 'Set a reminder for ' end || updated.name,
    case when habit_reminder is null then 'No push reminder' else 'Reminds at ' || to_char(habit_reminder, 'HH24:MI') end,
    to_jsonb(previous), to_jsonb(updated), true);
  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Calendar import
-- ---------------------------------------------------------------------------

alter table public.calendar_blocks add column if not exists external_provider text
  check (external_provider in ('google_calendar'));
alter table public.calendar_blocks add column if not exists external_id text;
alter table public.calendar_blocks add column if not exists external_url text;
-- NULLs are distinct, so blocks created in the app never collide here.
alter table public.calendar_blocks drop constraint if exists calendar_blocks_external_key;
alter table public.calendar_blocks add constraint calendar_blocks_external_key
  unique (user_id, external_provider, external_id);

-- Encrypted OAuth refresh tokens. No policies: browser roles can neither read
-- nor write them; only the functions below and the service role can.
create table if not exists public.integration_credentials (
  user_id uuid not null references public.profiles(id) on delete cascade,
  connector public.connector_kind not null,
  encrypted_refresh_token text not null,
  granted_scope text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, connector)
);
alter table public.integration_credentials enable row level security;
revoke all on table public.integration_credentials from anon, authenticated;

-- Called from the OAuth callback with the signed-in user's session.
create or replace function public.store_integration_credentials(
  target_connector public.connector_kind,
  encrypted_token text,
  granted_scope text,
  account_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication_required'; end if;
  if target_connector <> 'google_calendar' then raise exception 'unsupported_connector'; end if;
  if char_length(coalesce(encrypted_token, '')) < 20 then raise exception 'invalid_credentials'; end if;

  insert into public.integration_credentials (user_id, connector, encrypted_refresh_token, granted_scope)
  values (caller, target_connector, encrypted_token, coalesce(granted_scope, ''))
  on conflict (user_id, connector) do update set
    encrypted_refresh_token = excluded.encrypted_refresh_token,
    granted_scope = excluded.granted_scope,
    updated_at = now();

  insert into public.integration_connections (user_id, connector, capabilities, status, account_label, status_message, last_checked_at)
  values (caller, target_connector, array['read'], 'healthy', left(coalesce(account_label, ''), 200),
    'Connected. Events sync every 30 minutes.', now())
  on conflict (user_id, connector) do update set
    status = 'healthy',
    capabilities = array['read'],
    account_label = excluded.account_label,
    status_message = excluded.status_message,
    last_checked_at = now(),
    last_synced_at = null;
end;
$$;

create or replace function public.disconnect_integration(target_connector public.connector_kind)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication_required'; end if;
  delete from public.integration_credentials where user_id = caller and connector = target_connector;
  if target_connector = 'google_calendar' then
    delete from public.calendar_blocks where user_id = caller and external_provider = 'google_calendar';
  end if;
  update public.integration_connections set
    status = 'disconnected',
    account_label = '',
    status_message = 'Disconnected. Imported events were removed.',
    last_checked_at = now()
  where user_id = caller and connector = target_connector;
end;
$$;

-- Service role: connections whose last sync is older than the interval.
create or replace function public.list_due_integration_syncs(
  target_connector public.connector_kind,
  min_interval_minutes integer default 25,
  batch_size integer default 50
)
returns table (user_id uuid, encrypted_refresh_token text, timezone text)
language sql
security definer
set search_path = ''
as $$
  select c.user_id, c.encrypted_refresh_token, p.timezone
  from public.integration_credentials c
  join public.profiles p on p.id = c.user_id
  join public.integration_connections ic on ic.user_id = c.user_id and ic.connector = c.connector
  where c.connector = target_connector
    and ic.status in ('healthy', 'degraded')
    and (ic.last_synced_at is null or ic.last_synced_at < now() - make_interval(mins => min_interval_minutes))
  order by ic.last_synced_at nulls first
  limit greatest(1, least(batch_size, 500));
$$;

-- Service role: replaces one user's imported events inside a time window.
-- events: [{ "id", "title", "starts_at", "ends_at", "url" }]
create or replace function public.apply_calendar_import(
  target_user uuid,
  window_start timestamptz,
  window_end timestamptz,
  events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  imported integer := 0;
  connection_id uuid;
begin
  if jsonb_typeof(events) <> 'array' then raise exception 'invalid_events'; end if;
  if window_end <= window_start or window_end - window_start > interval '62 days' then
    raise exception 'invalid_window';
  end if;

  with incoming as (
    select
      left(e ->> 'id', 300) as external_id,
      left(coalesce(nullif(trim(e ->> 'title'), ''), 'Busy'), 180) as title,
      (e ->> 'starts_at')::timestamptz as starts_at,
      (e ->> 'ends_at')::timestamptz as ends_at,
      left(coalesce(e ->> 'url', ''), 500) as external_url
    from jsonb_array_elements(events) as e
  ),
  valid as (
    select distinct on (external_id) * from incoming
    where external_id is not null and ends_at > starts_at
    order by external_id
  ),
  upserted as (
    insert into public.calendar_blocks (user_id, title, kind, starts_at, ends_at, notes, source, external_provider, external_id, external_url)
    select target_user, title, 'meeting', starts_at, ends_at, 'Imported from Google Calendar', 'system', 'google_calendar', external_id, external_url
    from valid
    on conflict (user_id, external_provider, external_id) do update set
      title = excluded.title,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      external_url = excluded.external_url
    returning 1
  )
  select count(*) into imported from upserted;

  -- Events removed from Google inside the window are removed here too.
  delete from public.calendar_blocks b
  where b.user_id = target_user and b.external_provider = 'google_calendar'
    and b.starts_at < window_end and b.ends_at > window_start
    and not exists (
      select 1 from jsonb_array_elements(events) e where e ->> 'id' = b.external_id
    );

  update public.integration_connections set
    status = 'healthy',
    last_synced_at = now(),
    last_checked_at = now(),
    status_message = 'Synced ' || imported || ' event' || case when imported = 1 then '' else 's' end || '.'
  where user_id = target_user and connector = 'google_calendar'
  returning id into connection_id;

  if connection_id is not null then
    insert into public.integration_sync_logs (user_id, connection_id, direction, status, records_processed, message, completed_at)
    values (target_user, connection_id, 'pull', 'completed', imported, 'Imported events for the next two weeks.', now());
  end if;
  return imported;
end;
$$;

-- Service role: records a failed sync. A revoked grant stops future attempts.
create or replace function public.record_integration_sync_failure(
  target_user uuid,
  target_connector public.connector_kind,
  failure_message text,
  revoked boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare connection_id uuid;
begin
  update public.integration_connections set
    status = case when revoked then 'error'::public.integration_status else 'degraded'::public.integration_status end,
    last_checked_at = now(),
    last_synced_at = now(),
    status_message = left(case when revoked then 'Access was revoked. Connect again from Settings.' else failure_message end, 300)
  where user_id = target_user and connector = target_connector
  returning id into connection_id;
  if revoked then
    delete from public.integration_credentials where user_id = target_user and connector = target_connector;
  end if;
  if connection_id is not null then
    insert into public.integration_sync_logs (user_id, connection_id, direction, status, message, completed_at)
    values (target_user, connection_id, 'pull', 'failed', left(failure_message, 300), now());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Push scheduling: per-habit reminders and the weekly review
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_push_notifications(batch_size integer default 100)
returns table (
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  action_url text,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if batch_size not between 1 and 500 then raise exception 'invalid_batch_size'; end if;

  -- A habit with its own reminder time, once that time has passed today and
  -- the habit is still open.
  insert into public.notifications (user_id, kind, title, body, action_url, scheduled_for, source_type, source_id)
  select h.user_id, 'habit', 'Time for ' || h.name,
    case when h.description = '' then 'Tap to check in.' else h.description end, '/habits',
    ((now() at time zone p.timezone)::date + h.reminder_time) at time zone p.timezone,
    'habit_reminder_' || (now() at time zone p.timezone)::date, h.id
  from public.habits h
  join public.profiles p on p.id = h.user_id
  join public.notification_preferences np on np.user_id = h.user_id and np.push_enabled and np.habit_reminders
  where h.active and h.reminder_time is not null
    and (now() at time zone p.timezone)::time >= h.reminder_time
    and not exists (
      select 1 from public.habit_logs l
      where l.habit_id = h.id and l.log_date = (now() at time zone p.timezone)::date and l.value >= h.target_value
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = h.user_id and n.source_id = h.id
        and n.source_type = 'habit_reminder_' || (now() at time zone p.timezone)::date
    );

  -- Evening catch-all at 20:00 local for open habits that have no reminder of their own.
  insert into public.notifications (user_id, kind, title, body, action_url, scheduled_for, source_type)
  select p.id, 'habit', 'Daily habit check-in', 'Some habits are still open today.', '/habits',
    ((now() at time zone p.timezone)::date + time '20:00') at time zone p.timezone,
    'habit_daily_' || (now() at time zone p.timezone)::date
  from public.profiles p
  join public.notification_preferences np on np.user_id = p.id and np.push_enabled and np.habit_reminders
  where exists (
      select 1 from public.habits h
      where h.user_id = p.id and h.active and h.reminder_time is null
        and not exists (
          select 1 from public.habit_logs l
          where l.habit_id = h.id and l.log_date = (now() at time zone p.timezone)::date and l.value >= h.target_value
        )
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id and n.source_type = 'habit_daily_' || (now() at time zone p.timezone)::date
    );

  -- Weekly review, Sunday 18:00 local.
  insert into public.notifications (user_id, kind, title, body, action_url, scheduled_for, source_type)
  select p.id, 'system', 'Your weekly review is ready', 'See how the week went and pick one thing to change.', '/review',
    ((now() at time zone p.timezone)::date + time '18:00') at time zone p.timezone,
    'weekly_review_' || (now() at time zone p.timezone)::date
  from public.profiles p
  join public.notification_preferences np on np.user_id = p.id and np.push_enabled
  where extract(isodow from (now() at time zone p.timezone)) = 7
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id and n.source_type = 'weekly_review_' || (now() at time zone p.timezone)::date
    );

  return query
  with due as (
    select n.id
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    join public.notification_preferences np on np.user_id = n.user_id and np.push_enabled
    left join public.planning_preferences pp on pp.user_id = n.user_id
    where n.pushed_at is null and n.dismissed_at is null and n.read_at is null
      and coalesce(n.scheduled_for, n.created_at) <= now()
      and coalesce(n.scheduled_for, n.created_at) > now() - interval '1 day'
      and not public.private_in_quiet_hours((now() at time zone p.timezone)::time, pp.quiet_hours_start, pp.quiet_hours_end)
      and case n.kind
        when 'task' then np.task_reminders
        when 'calendar' then np.calendar_reminders
        when 'habit' then np.habit_reminders
        when 'finance' then np.finance_reminders
        when 'academic' then np.academic_reminders
        when 'learning' then np.learning_reminders
        else true
      end
    order by coalesce(n.scheduled_for, n.created_at)
    limit batch_size
    for update of n skip locked
  ),
  claimed as (
    update public.notifications n set pushed_at = now()
    from due where n.id = due.id
    returning n.id, n.user_id, n.title, n.body, n.action_url
  )
  select c.id, c.user_id, c.title, c.body, c.action_url, s.id, s.endpoint, s.p256dh, s.auth_key
  from claimed c
  join public.web_push_subscriptions s on s.user_id = c.user_id and s.active;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.set_habit_reminder(uuid, time) from public, anon;
revoke all on function public.store_integration_credentials(public.connector_kind, text, text, text) from public, anon;
revoke all on function public.disconnect_integration(public.connector_kind) from public, anon;
revoke all on function public.list_due_integration_syncs(public.connector_kind, integer, integer) from public, anon, authenticated;
revoke all on function public.apply_calendar_import(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.record_integration_sync_failure(uuid, public.connector_kind, text, boolean) from public, anon, authenticated;
revoke all on function public.claim_due_push_notifications(integer) from public, anon, authenticated;

grant execute on function public.set_habit_reminder(uuid, time) to authenticated;
grant execute on function public.store_integration_credentials(public.connector_kind, text, text, text) to authenticated;
grant execute on function public.disconnect_integration(public.connector_kind) to authenticated;
grant execute on function public.list_due_integration_syncs(public.connector_kind, integer, integer) to service_role;
grant execute on function public.apply_calendar_import(uuid, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.record_integration_sync_failure(uuid, public.connector_kind, text, boolean) to service_role;
grant execute on function public.claim_due_push_notifications(integer) to service_role;
