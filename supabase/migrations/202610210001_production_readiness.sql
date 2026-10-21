-- Production readiness: editing and deletion for core records, habit
-- management, editable preferences, account export and deletion, durable
-- rate limits, opt-in MCP writes and scheduled web-push delivery.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.private_user_timezone()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select timezone from public.profiles where id = auth.uid()), 'Asia/Kolkata');
$$;

create or replace function public.private_user_today()
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select (now() at time zone public.private_user_timezone())::date;
$$;

create or replace function public.private_log_activity(
  event_type text,
  entity_type text,
  entity_id uuid,
  summary text,
  detail text,
  before_state jsonb,
  after_state jsonb,
  reversible boolean default false
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.activity_log (
    user_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source, before_state, after_state, reversible
  ) values (
    auth.uid(), event_type, entity_type, entity_id, summary, detail,
    'You', 'user', 'web', before_state, after_state, reversible
  );
$$;

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create or replace function public.update_task_details(
  target_task uuid,
  expected_version integer,
  task_title text,
  task_priority public.task_priority,
  task_project_id uuid,
  task_due_at timestamptz,
  task_estimate_minutes integer
)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare previous public.tasks; updated public.tasks;
begin
  select * into previous from public.tasks where id = target_task and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'task_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;
  if task_project_id is not null and not exists (
    select 1 from public.projects where id = task_project_id and user_id = auth.uid()
  ) then raise exception 'project_not_found'; end if;

  update public.tasks set
    title = trim(task_title),
    priority = task_priority,
    project_id = task_project_id,
    due_at = task_due_at,
    estimate_minutes = task_estimate_minutes
  where id = previous.id
  returning * into updated;

  perform public.private_log_activity('task_updated', 'task', updated.id, 'Updated ' || updated.title,
    'Task details edited from the workspace', to_jsonb(previous), to_jsonb(updated), true);
  return updated;
end;
$$;

create or replace function public.delete_task(target_task uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare previous public.tasks;
begin
  select * into previous from public.tasks where id = target_task and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'task_not_found'; end if;
  delete from public.tasks where id = previous.id;
  perform public.private_log_activity('task_deleted', 'task', previous.id, 'Deleted ' || previous.title,
    'Task removed from the workspace', to_jsonb(previous), null, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create or replace function public.create_project(
  project_name text,
  project_code text,
  project_description text default '',
  project_client text default '',
  project_deadline timestamptz default null,
  project_accent text default 'blue'
)
returns public.projects
language plpgsql
security invoker
set search_path = public
as $$
declare created public.projects;
begin
  insert into public.projects (user_id, name, code, description, client_name, deadline, accent)
  values (auth.uid(), trim(project_name), upper(trim(project_code)), coalesce(project_description, ''),
    coalesce(project_client, ''), project_deadline, coalesce(project_accent, 'blue'))
  returning * into created;
  perform public.private_log_activity('project_created', 'project', created.id, 'Created ' || created.name,
    'New project added from Projects', null, to_jsonb(created), false);
  return created;
end;
$$;

create or replace function public.update_project(
  target_project uuid,
  expected_version integer,
  project_patch jsonb
)
returns public.projects
language plpgsql
security invoker
set search_path = public
as $$
declare previous public.projects; updated public.projects;
begin
  if project_patch - array['name','code','description','client_name','status','health','progress','deadline','next_milestone','accent'] <> '{}'::jsonb then
    raise exception 'unsupported_project_field';
  end if;
  select * into previous from public.projects where id = target_project and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'project_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;

  update public.projects set
    name = case when project_patch ? 'name' then trim(project_patch ->> 'name') else name end,
    code = case when project_patch ? 'code' then upper(trim(project_patch ->> 'code')) else code end,
    description = case when project_patch ? 'description' then coalesce(project_patch ->> 'description', '') else description end,
    client_name = case when project_patch ? 'client_name' then coalesce(project_patch ->> 'client_name', '') else client_name end,
    status = case when project_patch ? 'status' then (project_patch ->> 'status')::public.project_status else status end,
    health = case when project_patch ? 'health' then (project_patch ->> 'health')::public.project_health else health end,
    progress = case when project_patch ? 'progress' then (project_patch ->> 'progress')::smallint else progress end,
    deadline = case when project_patch ? 'deadline' then (project_patch ->> 'deadline')::timestamptz else deadline end,
    next_milestone = case when project_patch ? 'next_milestone' then coalesce(project_patch ->> 'next_milestone', '') else next_milestone end,
    accent = case when project_patch ? 'accent' then project_patch ->> 'accent' else accent end
  where id = previous.id
  returning * into updated;

  perform public.private_log_activity('project_updated', 'project', updated.id, 'Updated ' || updated.name,
    'Project details edited from the workspace', to_jsonb(previous), to_jsonb(updated), true);
  return updated;
end;
$$;

create or replace function public.delete_project(target_project uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare previous public.projects;
begin
  select * into previous from public.projects where id = target_project and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'project_not_found'; end if;
  -- Tasks and sessions keep their history; their project link is cleared by the foreign key.
  delete from public.projects where id = previous.id;
  perform public.private_log_activity('project_deleted', 'project', previous.id, 'Deleted ' || previous.name,
    'Project removed; its tasks were kept without a project', to_jsonb(previous), null, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Habits
-- ---------------------------------------------------------------------------

create or replace function public.create_habit(
  habit_name text,
  habit_description text,
  habit_metric public.habit_metric,
  habit_target numeric,
  habit_unit text,
  habit_accent text
)
returns public.habits
language plpgsql
security invoker
set search_path = public
as $$
declare created public.habits; next_order integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if habit_metric = 'boolean' then habit_target := 1; end if;
  if habit_target is null or habit_target <= 0 then raise exception 'invalid_habit_target'; end if;
  select coalesce(max(sort_order), 0) + 1 into next_order from public.habits where user_id = auth.uid();

  insert into public.habits (user_id, name, description, metric, target_value, unit, accent, sort_order)
  values (auth.uid(), trim(habit_name), coalesce(habit_description, ''), habit_metric, habit_target,
    case when habit_metric = 'boolean' then '' else coalesce(trim(habit_unit), '') end,
    coalesce(habit_accent, 'blue'), next_order)
  returning * into created;

  perform public.private_log_activity('habit_created', 'habit', created.id, 'Started tracking ' || created.name,
    'New habit added from Habits', null, to_jsonb(created), false);
  return created;
end;
$$;

-- The metric is fixed after creation so existing logs keep their meaning.
create or replace function public.update_habit(
  target_habit uuid,
  expected_version integer,
  habit_name text,
  habit_description text,
  habit_target numeric,
  habit_unit text,
  habit_accent text
)
returns public.habits
language plpgsql
security invoker
set search_path = public
as $$
declare previous public.habits; updated public.habits;
begin
  select * into previous from public.habits where id = target_habit and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'habit_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;
  if previous.metric = 'boolean' then habit_target := 1; habit_unit := ''; end if;
  if habit_target is null or habit_target <= 0 then raise exception 'invalid_habit_target'; end if;

  update public.habits set
    name = trim(habit_name),
    description = coalesce(habit_description, ''),
    target_value = habit_target,
    unit = coalesce(trim(habit_unit), ''),
    accent = coalesce(habit_accent, accent)
  where id = previous.id
  returning * into updated;

  perform public.private_log_activity('habit_updated', 'habit', updated.id, 'Updated ' || updated.name,
    'Habit settings edited from Habits', to_jsonb(previous), to_jsonb(updated), true);
  return updated;
end;
$$;

create or replace function public.set_habit_active(target_habit uuid, habit_active boolean)
returns public.habits
language plpgsql
security invoker
set search_path = public
as $$
declare previous public.habits; updated public.habits;
begin
  select * into previous from public.habits where id = target_habit and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'habit_not_found'; end if;
  update public.habits set active = habit_active where id = previous.id returning * into updated;
  perform public.private_log_activity(
    case when habit_active then 'habit_restored' else 'habit_archived' end, 'habit', updated.id,
    case when habit_active then 'Restored ' else 'Archived ' end || updated.name,
    case when habit_active then 'Habit is tracked again' else 'Habit hidden; its history is kept' end,
    to_jsonb(previous), to_jsonb(updated), true);
  return updated;
end;
$$;

create or replace function public.reorder_habits(ordered_habits uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from unnest(ordered_habits) as requested(id)
    where not exists (select 1 from public.habits h where h.id = requested.id and h.user_id = auth.uid())
  ) then raise exception 'habit_not_found'; end if;

  update public.habits h set sort_order = ordered.position
  from unnest(ordered_habits) with ordinality as ordered(id, position)
  where h.id = ordered.id and h.user_id = auth.uid() and h.sort_order <> ordered.position;
end;
$$;

-- Check-ins may be backfilled for past days but never logged for the future
-- or for dates older than a year, in the user's own timezone.
create or replace function public.upsert_habit_checkin(
  target_habit uuid,
  target_date date,
  checkin_value numeric,
  checkin_note text default ''
)
returns public.habit_logs
language plpgsql
security invoker
set search_path = public
as $$
declare selected_habit public.habits;
declare previous_log public.habit_logs;
declare saved_log public.habit_logs;
declare today_date date := public.private_user_today();
begin
  select * into selected_habit from public.habits where id = target_habit and user_id = auth.uid() and active;
  if selected_habit.id is null then raise exception 'habit_not_found'; end if;
  if checkin_value is null or checkin_value < 0 then raise exception 'invalid_habit_value'; end if;
  if target_date > today_date then raise exception 'invalid_habit_date_future'; end if;
  if target_date < today_date - 366 then raise exception 'invalid_habit_date_too_old'; end if;
  if selected_habit.metric = 'boolean' then checkin_value := case when checkin_value > 0 then 1 else 0 end; end if;
  select * into previous_log from public.habit_logs where habit_id = target_habit and log_date = target_date;

  insert into public.habit_logs (user_id, habit_id, log_date, value, note)
  values (auth.uid(), target_habit, target_date, checkin_value, coalesce(checkin_note, ''))
  on conflict (habit_id, log_date) do update set value = excluded.value, note = excluded.note
  returning * into saved_log;

  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'habit_checked_in', 'habit', selected_habit.id,
    'Checked in ' || selected_habit.name || case when target_date = today_date then '' else ' for ' || to_char(target_date, 'Mon DD') end,
    checkin_value || case when selected_habit.unit = '' then '' else ' ' || selected_habit.unit end,
    'You', 'user', 'web', case when previous_log.id is null then null else to_jsonb(previous_log) end, to_jsonb(saved_log), true);
  return saved_log;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile and planning preferences
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists mcp_write_enabled boolean not null default false;

create or replace function public.update_profile_settings(
  profile_display_name text,
  profile_timezone text,
  profile_focus_target_minutes integer
)
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare updated public.profiles;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = profile_timezone) then
    raise exception 'invalid_timezone';
  end if;
  update public.profiles set
    display_name = trim(profile_display_name),
    timezone = profile_timezone,
    focus_target_minutes = profile_focus_target_minutes
  where id = auth.uid()
  returning * into updated;
  if updated.id is null then raise exception 'profile_not_found'; end if;
  return updated;
end;
$$;

create or replace function public.update_planning_preferences(
  pref_workday_start time,
  pref_workday_end time,
  pref_deep_work_minutes integer,
  pref_break_minutes integer,
  pref_quiet_hours_start time,
  pref_quiet_hours_end time,
  pref_weekend_planning boolean
)
returns public.planning_preferences
language plpgsql
security invoker
set search_path = public
as $$
declare saved public.planning_preferences;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if pref_workday_end <= pref_workday_start then raise exception 'invalid_workday_range'; end if;
  insert into public.planning_preferences (
    user_id, workday_start, workday_end, deep_work_minutes, break_minutes,
    quiet_hours_start, quiet_hours_end, weekend_planning
  ) values (
    auth.uid(), pref_workday_start, pref_workday_end, pref_deep_work_minutes, pref_break_minutes,
    pref_quiet_hours_start, pref_quiet_hours_end, pref_weekend_planning
  )
  on conflict (user_id) do update set
    workday_start = excluded.workday_start,
    workday_end = excluded.workday_end,
    deep_work_minutes = excluded.deep_work_minutes,
    break_minutes = excluded.break_minutes,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end,
    weekend_planning = excluded.weekend_planning
  returning * into saved;
  return saved;
end;
$$;

create or replace function public.set_mcp_write_access(write_enabled boolean)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.profiles set mcp_write_enabled = write_enabled where id = auth.uid();
  if not found then raise exception 'profile_not_found'; end if;
  perform public.private_log_activity('mcp_access_changed', 'profile', auth.uid(),
    case when write_enabled then 'Allowed AI assistants to make changes' else 'Made AI assistant access read-only' end,
    'MCP write access changed from Settings', null, jsonb_build_object('mcp_write_enabled', write_enabled), false);
  return write_enabled;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account export and deletion
-- ---------------------------------------------------------------------------

-- Runs as the caller, so row-level security limits the export to their rows.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  table_row record;
  table_rows jsonb;
  exported jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'exported_at', now(),
    'format_version', 1,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid())
  ) into exported;

  for table_row in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in ('action_receipts', 'api_rate_limits')
    order by c.table_name
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r where r.user_id = auth.uid()',
      table_row.table_name
    ) into table_rows;
    exported := exported || jsonb_build_object(table_row.table_name, table_rows);
  end loop;

  exported := exported || jsonb_build_object('change_operations', (
    select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
    from public.change_operations o
    join public.change_sets s on s.id = o.change_set_id
    where s.user_id = auth.uid()
  ));
  return exported;
end;
$$;

-- Deleting the auth user cascades to the profile and every user-owned row.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication_required'; end if;
  delete from auth.users where id = caller;
end;
$$;

-- ---------------------------------------------------------------------------
-- Durable rate limits
-- ---------------------------------------------------------------------------

create table if not exists public.api_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null check (bucket in ('mcp_read', 'mcp_write')),
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (user_id, bucket)
);

-- No policies: the table is only reachable through consume_rate_limit, so a
-- user cannot reset their own counters through the Data API.
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(
  bucket_name text,
  max_requests integer,
  window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  saved public.api_rate_limits;
  window_length interval;
begin
  if caller is null then raise exception 'authentication_required'; end if;
  if bucket_name not in ('mcp_read', 'mcp_write') then raise exception 'invalid_rate_limit_bucket'; end if;
  if max_requests not between 1 and 10000 or window_seconds not between 1 and 3600 then
    raise exception 'invalid_rate_limit_window';
  end if;
  window_length := make_interval(secs => window_seconds);

  insert into public.api_rate_limits as existing (user_id, bucket, window_start, request_count)
  values (caller, bucket_name, now(), 1)
  on conflict (user_id, bucket) do update set
    request_count = case when existing.window_start + window_length <= now() then 1 else existing.request_count + 1 end,
    window_start = case when existing.window_start + window_length <= now() then now() else existing.window_start end
  returning * into saved;

  return jsonb_build_object(
    'allowed', saved.request_count <= max_requests,
    'remaining', greatest(0, max_requests - saved.request_count),
    'reset_at', saved.window_start + window_length
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled web-push delivery (called by a trusted scheduler with the
-- Supabase secret key; never exposed to browser roles)
-- ---------------------------------------------------------------------------

alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_push_queue_idx
  on public.notifications (scheduled_for) where pushed_at is null and dismissed_at is null and read_at is null;

create or replace function public.private_in_quiet_hours(local_time time, quiet_start time, quiet_end time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when quiet_start is null or quiet_end is null or quiet_start = quiet_end then false
    when quiet_start < quiet_end then local_time >= quiet_start and local_time < quiet_end
    else local_time >= quiet_start or local_time < quiet_end
  end;
$$;

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

  -- Evening habit reminder at 20:00 local time when a habit is still open today.
  insert into public.notifications (user_id, kind, title, body, action_url, scheduled_for, source_type)
  select p.id, 'habit', 'Daily habit check-in', 'Some habits are still open today.', '/habits',
    ((now() at time zone p.timezone)::date + time '20:00') at time zone p.timezone,
    'habit_daily_' || (now() at time zone p.timezone)::date
  from public.profiles p
  join public.notification_preferences np on np.user_id = p.id and np.push_enabled and np.habit_reminders
  where exists (
      select 1 from public.habits h
      where h.user_id = p.id and h.active
        and not exists (
          select 1 from public.habit_logs l
          where l.habit_id = h.id and l.log_date = (now() at time zone p.timezone)::date and l.value >= h.target_value
        )
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.id and n.source_type = 'habit_daily_' || (now() at time zone p.timezone)::date
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

create or replace function public.deactivate_push_subscription(target_subscription uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.web_push_subscriptions set active = false where id = target_subscription;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.private_user_timezone() from public, anon;
revoke all on function public.private_user_today() from public, anon;
revoke all on function public.private_log_activity(text, text, uuid, text, text, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.update_task_details(uuid, integer, text, public.task_priority, uuid, timestamptz, integer) from public, anon;
revoke all on function public.delete_task(uuid) from public, anon;
revoke all on function public.create_project(text, text, text, text, timestamptz, text) from public, anon;
revoke all on function public.update_project(uuid, integer, jsonb) from public, anon;
revoke all on function public.delete_project(uuid) from public, anon;
revoke all on function public.create_habit(text, text, public.habit_metric, numeric, text, text) from public, anon;
revoke all on function public.update_habit(uuid, integer, text, text, numeric, text, text) from public, anon;
revoke all on function public.set_habit_active(uuid, boolean) from public, anon;
revoke all on function public.reorder_habits(uuid[]) from public, anon;
revoke all on function public.upsert_habit_checkin(uuid, date, numeric, text) from public, anon;
revoke all on function public.update_profile_settings(text, text, integer) from public, anon;
revoke all on function public.update_planning_preferences(time, time, integer, integer, time, time, boolean) from public, anon;
revoke all on function public.set_mcp_write_access(boolean) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
revoke all on function public.private_in_quiet_hours(time, time, time) from public, anon, authenticated;
revoke all on function public.claim_due_push_notifications(integer) from public, anon, authenticated;
revoke all on function public.deactivate_push_subscription(uuid) from public, anon, authenticated;

grant execute on function public.private_user_timezone() to authenticated;
grant execute on function public.private_user_today() to authenticated;
grant execute on function public.private_log_activity(text, text, uuid, text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.update_task_details(uuid, integer, text, public.task_priority, uuid, timestamptz, integer) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.create_project(text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.update_project(uuid, integer, jsonb) to authenticated;
grant execute on function public.delete_project(uuid) to authenticated;
grant execute on function public.create_habit(text, text, public.habit_metric, numeric, text, text) to authenticated;
grant execute on function public.update_habit(uuid, integer, text, text, numeric, text, text) to authenticated;
grant execute on function public.set_habit_active(uuid, boolean) to authenticated;
grant execute on function public.reorder_habits(uuid[]) to authenticated;
grant execute on function public.upsert_habit_checkin(uuid, date, numeric, text) to authenticated;
grant execute on function public.update_profile_settings(text, text, integer) to authenticated;
grant execute on function public.update_planning_preferences(time, time, integer, integer, time, time, boolean) to authenticated;
grant execute on function public.set_mcp_write_access(boolean) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;
grant execute on function public.private_in_quiet_hours(time, time, time) to service_role;
grant execute on function public.claim_due_push_notifications(integer) to service_role;
grant execute on function public.deactivate_push_subscription(uuid) to service_role;
