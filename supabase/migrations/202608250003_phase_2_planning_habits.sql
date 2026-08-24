create type public.calendar_block_kind as enum ('meeting', 'focus', 'personal', 'break');
create type public.habit_metric as enum ('boolean', 'duration', 'count', 'numeric');

alter table public.change_sets
  add column kind text not null default 'general'
    check (kind in ('general', 'daily_plan', 'unfinished_reschedule')),
  add column plan_date date,
  add column metadata jsonb not null default '{}';

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  kind public.calendar_block_kind not null default 'focus',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text not null default '',
  source public.change_source not null default 'web',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  metric public.habit_metric not null,
  target_value numeric(10,2) not null default 1 check (target_value > 0),
  unit text not null default '',
  accent text not null default 'blue' check (accent in ('blue', 'violet', 'amber', 'emerald')),
  active boolean not null default true,
  sort_order integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  log_date date not null,
  value numeric(10,2) not null default 0 check (value >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create index calendar_blocks_user_time_idx on public.calendar_blocks (user_id, starts_at, ends_at);
create index habits_user_active_idx on public.habits (user_id, active, sort_order);
create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date desc);
create index change_sets_user_plan_idx on public.change_sets (user_id, plan_date, kind, status);

create trigger calendar_blocks_set_updated_at before update on public.calendar_blocks
  for each row execute function public.set_updated_at();
create trigger habits_set_updated_at before update on public.habits
  for each row execute function public.set_updated_at();
create trigger habit_logs_set_updated_at before update on public.habit_logs
  for each row execute function public.set_updated_at();

alter table public.calendar_blocks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy calendar_blocks_select_own on public.calendar_blocks for select using (user_id = auth.uid());
create policy calendar_blocks_insert_own on public.calendar_blocks for insert with check (user_id = auth.uid());
create policy calendar_blocks_update_own on public.calendar_blocks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_blocks_delete_own on public.calendar_blocks for delete using (user_id = auth.uid());

create policy habits_select_own on public.habits for select using (user_id = auth.uid());
create policy habits_insert_own on public.habits for insert with check (user_id = auth.uid());
create policy habits_update_own on public.habits for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habits_delete_own on public.habits for delete using (user_id = auth.uid());

create policy habit_logs_select_own on public.habit_logs for select using (user_id = auth.uid());
create policy habit_logs_insert_own on public.habit_logs for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.habits where habits.id = habit_id and habits.user_id = auth.uid()
  )
);
create policy habit_logs_update_own on public.habit_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy habit_logs_delete_own on public.habit_logs for delete using (user_id = auth.uid());

create or replace function public.initialize_phase_2_workspace()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  timezone_name text;
  today_date date;
  atlas_id uuid;
  internship_id uuid;
  ops_id uuid;
  workout_id uuid;
  dsa_id uuid;
  water_id uuid;
  sleep_id uuid;
  day_number integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select timezone into timezone_name from public.profiles where id = auth.uid();
  timezone_name := coalesce(timezone_name, 'Asia/Kolkata');
  today_date := (now() at time zone timezone_name)::date;

  if not exists (select 1 from public.projects where user_id = auth.uid()) then
    insert into public.projects (user_id, name, code, description, client_name, health, progress, deadline, next_milestone, accent)
    values (auth.uid(), 'Atlas client portal', 'ATL', 'Ship the reporting and approvals workspace.', 'Northstar Labs', 'on_track', 68, ((today_date + 9)::text || ' 17:00')::timestamp at time zone timezone_name, 'Stakeholder walkthrough', 'blue')
    returning id into atlas_id;

    insert into public.projects (user_id, name, code, description, client_name, health, progress, deadline, next_milestone, accent)
    values (auth.uid(), 'Internship platform refresh', 'IPR', 'Improve onboarding, navigation, and core task flow.', 'Internship', 'at_risk', 42, ((today_date + 4)::text || ' 18:00')::timestamp at time zone timezone_name, 'Navigation handoff', 'violet')
    returning id into internship_id;

    insert into public.projects (user_id, name, code, description, client_name, health, progress, deadline, next_milestone, accent)
    values (auth.uid(), 'Studio operations', 'OPS', 'Proposals, pipeline hygiene, and finance follow-through.', 'Personal business', 'on_track', 55, ((today_date + 18)::text || ' 18:00')::timestamp at time zone timezone_name, 'Monthly review', 'emerald')
    returning id into ops_id;

    insert into public.tasks (user_id, project_id, title, priority, due_at, scheduled_start, scheduled_end, estimate_minutes, tags, source)
    values
      (auth.uid(), atlas_id, 'Review Atlas approval flow with client notes', 'critical', ((today_date)::text || ' 12:30')::timestamp at time zone timezone_name, ((today_date)::text || ' 09:30')::timestamp at time zone timezone_name, ((today_date)::text || ' 10:45')::timestamp at time zone timezone_name, 75, array['client','deep work'], 'web'),
      (auth.uid(), internship_id, 'Finish responsive navigation states', 'high', ((today_date)::text || ' 18:00')::timestamp at time zone timezone_name, ((today_date)::text || ' 11:15')::timestamp at time zone timezone_name, ((today_date)::text || ' 12:45')::timestamp at time zone timezone_name, 90, array['internship','frontend'], 'web'),
      (auth.uid(), ops_id, 'Send revised proposal to Arjun', 'high', ((today_date)::text || ' 16:00')::timestamp at time zone timezone_name, ((today_date)::text || ' 14:00')::timestamp at time zone timezone_name, ((today_date)::text || ' 14:30')::timestamp at time zone timezone_name, 30, array['sales','follow-up'], 'web'),
      (auth.uid(), atlas_id, 'Follow up on Northstar milestone payment', 'medium', ((today_date)::text || ' 17:00')::timestamp at time zone timezone_name, null, null, 20, array['finance'], 'web'),
      (auth.uid(), internship_id, 'Document project update API contract', 'medium', ((today_date + 1)::text || ' 17:00')::timestamp at time zone timezone_name, null, null, 45, array['backend'], 'web'),
      (auth.uid(), null, 'Close the day and capture next actions', 'medium', ((today_date)::text || ' 19:15')::timestamp at time zone timezone_name, null, null, 20, array['review'], 'web'),
      (auth.uid(), null, 'Prepare tomorrow priorities', 'low', ((today_date + 1)::text || ' 10:00')::timestamp at time zone timezone_name, null, null, 30, array['planning'], 'web');

    insert into public.inbox_items (user_id, title, note) values
      (auth.uid(), 'Check whether the new client wants weekly reports', 'Ask during Thursday call.'),
      (auth.uid(), 'Idea: reusable project kickoff template', 'Include access checklist and reporting cadence.');
  end if;

  if not exists (select 1 from public.calendar_blocks where user_id = auth.uid()) then
    insert into public.calendar_blocks (user_id, title, kind, starts_at, ends_at, notes) values
      (auth.uid(), 'Internship stand-up', 'meeting', ((today_date)::text || ' 10:45')::timestamp at time zone timezone_name, ((today_date)::text || ' 11:15')::timestamp at time zone timezone_name, 'Daily delivery sync'),
      (auth.uid(), 'Lunch and reset', 'break', ((today_date)::text || ' 13:00')::timestamp at time zone timezone_name, ((today_date)::text || ' 13:45')::timestamp at time zone timezone_name, ''),
      (auth.uid(), 'Client review call', 'meeting', ((today_date + 1)::text || ' 16:00')::timestamp at time zone timezone_name, ((today_date + 1)::text || ' 16:45')::timestamp at time zone timezone_name, 'Atlas stakeholder review');
  end if;

  if not exists (select 1 from public.habits where user_id = auth.uid()) then
    insert into public.habits (user_id, name, description, metric, target_value, unit, accent, sort_order)
    values (auth.uid(), 'Workout', 'Move with intent', 'boolean', 1, '', 'emerald', 1) returning id into workout_id;
    insert into public.habits (user_id, name, description, metric, target_value, unit, accent, sort_order)
    values (auth.uid(), 'DSA practice', 'Focused learning and problem solving', 'duration', 60, 'min', 'blue', 2) returning id into dsa_id;
    insert into public.habits (user_id, name, description, metric, target_value, unit, accent, sort_order)
    values (auth.uid(), 'Water', 'Stay consistently hydrated', 'count', 8, 'glasses', 'violet', 3) returning id into water_id;
    insert into public.habits (user_id, name, description, metric, target_value, unit, accent, sort_order)
    values (auth.uid(), 'Sleep', 'Protect recovery quality', 'numeric', 7.5, 'hours', 'amber', 4) returning id into sleep_id;

    for day_number in 1..6 loop
      insert into public.habit_logs (user_id, habit_id, log_date, value) values
        (auth.uid(), workout_id, today_date - day_number, case when day_number = 3 then 0 else 1 end),
        (auth.uid(), dsa_id, today_date - day_number, case when day_number = 2 then 35 else 60 + (day_number % 2) * 15 end),
        (auth.uid(), water_id, today_date - day_number, 6 + (day_number % 3)),
        (auth.uid(), sleep_id, today_date - day_number, 6.5 + (day_number % 3) * 0.5);
    end loop;
  end if;
end;
$$;

create or replace function public.schedule_task(
  target_task uuid,
  task_start timestamptz,
  task_end timestamptz
)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_task public.tasks;
  updated_task public.tasks;
begin
  if task_end <= task_start then raise exception 'invalid_time_range'; end if;
  select * into current_task from public.tasks
    where id = target_task and user_id = auth.uid() and status not in ('completed', 'blocked') for update;
  if current_task.id is null then raise exception 'task_not_available'; end if;

  if exists (
    select 1 from public.tasks
    where user_id = auth.uid() and id <> target_task and status <> 'completed'
      and scheduled_start < task_end and scheduled_end > task_start
  ) or exists (
    select 1 from public.calendar_blocks
    where user_id = auth.uid() and starts_at < task_end and ends_at > task_start
  ) then raise exception 'schedule_conflict'; end if;

  update public.tasks set scheduled_start = task_start, scheduled_end = task_end, status = 'planned'
    where id = current_task.id returning * into updated_task;

  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'task_scheduled', 'task', updated_task.id, 'Scheduled ' || updated_task.title,
    to_char(task_start at time zone 'Asia/Kolkata', 'Mon DD, HH12:MI AM'), 'You', 'user', 'web', to_jsonb(current_task), to_jsonb(updated_task), true);
  return updated_task;
end;
$$;

create or replace function public.create_calendar_block_with_activity(
  block_title text,
  block_kind public.calendar_block_kind,
  block_start timestamptz,
  block_end timestamptz,
  block_notes text default ''
)
returns public.calendar_blocks
language plpgsql
security invoker
set search_path = public
as $$
declare created_block public.calendar_blocks;
begin
  if block_end <= block_start then raise exception 'invalid_time_range'; end if;
  if exists (
    select 1 from public.calendar_blocks where user_id = auth.uid() and starts_at < block_end and ends_at > block_start
  ) or exists (
    select 1 from public.tasks where user_id = auth.uid() and status <> 'completed'
      and scheduled_start < block_end and scheduled_end > block_start
  ) then raise exception 'schedule_conflict'; end if;

  insert into public.calendar_blocks (user_id, title, kind, starts_at, ends_at, notes)
  values (auth.uid(), trim(block_title), block_kind, block_start, block_end, coalesce(block_notes, ''))
  returning * into created_block;

  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, after_state, reversible)
  values (auth.uid(), 'calendar_block_created', 'calendar_block', created_block.id, 'Blocked ' || created_block.title,
    'Added to calendar', 'You', 'user', 'web', to_jsonb(created_block), true);
  return created_block;
end;
$$;

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
begin
  select * into selected_habit from public.habits where id = target_habit and user_id = auth.uid() and active;
  if selected_habit.id is null then raise exception 'habit_not_found'; end if;
  if checkin_value < 0 then raise exception 'invalid_habit_value'; end if;
  if selected_habit.metric = 'boolean' then checkin_value := case when checkin_value > 0 then 1 else 0 end; end if;
  select * into previous_log from public.habit_logs where habit_id = target_habit and log_date = target_date;

  insert into public.habit_logs (user_id, habit_id, log_date, value, note)
  values (auth.uid(), target_habit, target_date, checkin_value, coalesce(checkin_note, ''))
  on conflict (habit_id, log_date) do update set value = excluded.value, note = excluded.note
  returning * into saved_log;

  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'habit_checked_in', 'habit', selected_habit.id, 'Checked in ' || selected_habit.name,
    checkin_value || case when selected_habit.unit = '' then '' else ' ' || selected_habit.unit end,
    'You', 'user', 'web', case when previous_log.id is null then null else to_jsonb(previous_log) end, to_jsonb(saved_log), true);
  return saved_log;
end;
$$;

create or replace function public.generate_daily_plan_draft(
  target_date date,
  include_overdue boolean default true
)
returns public.change_sets
language plpgsql
security invoker
set search_path = public
as $$
declare
  timezone_name text;
  work_cursor timestamptz;
  work_end timestamptz;
  candidate public.tasks;
  candidate_end timestamptz;
  conflict_end timestamptz;
  draft public.change_sets;
  operation_count integer := 0;
begin
  select timezone into timezone_name from public.profiles where id = auth.uid();
  timezone_name := coalesce(timezone_name, 'Asia/Kolkata');
  work_cursor := (target_date::text || ' 09:00')::timestamp at time zone timezone_name;
  work_end := (target_date::text || ' 19:00')::timestamp at time zone timezone_name;

  insert into public.change_sets (user_id, title, rationale, status, created_by, source, kind, plan_date, metadata)
  values (auth.uid(), 'Plan ' || to_char(target_date, 'FMDay, Mon DD'),
    'Prioritizes urgent work, protects existing commitments, and leaves breathing room between tasks.',
    'draft', 'Personal OS', 'web', 'daily_plan', target_date, jsonb_build_object('workday_start', '09:00', 'workday_end', '19:00'))
  returning * into draft;

  for candidate in
    select * from public.tasks
    where user_id = auth.uid() and status not in ('completed', 'blocked')
      and (scheduled_start is null or (include_overdue and scheduled_end < now()))
    order by case priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
      due_at nulls last, created_at
    limit 8
  loop
    candidate_end := work_cursor + make_interval(mins => greatest(candidate.estimate_minutes, 15));
    loop
      select max(ends_at) into conflict_end from (
        select scheduled_end as ends_at from public.tasks
          where user_id = auth.uid() and id <> candidate.id and status <> 'completed'
            and scheduled_start < candidate_end and scheduled_end > work_cursor
        union all
        select ends_at from public.calendar_blocks
          where user_id = auth.uid() and starts_at < candidate_end and ends_at > work_cursor
      ) conflicts;
      exit when conflict_end is null;
      work_cursor := conflict_end + interval '10 minutes';
      candidate_end := work_cursor + make_interval(mins => greatest(candidate.estimate_minutes, 15));
    end loop;
    exit when candidate_end > work_end;

    insert into public.change_operations (change_set_id, sequence, entity_type, action, entity_id, expected_version, summary, before_state, after_state)
    values (draft.id, operation_count, 'task', 'reschedule', candidate.id, candidate.version,
      'Schedule ' || candidate.title || ' at ' || to_char(work_cursor at time zone timezone_name, 'HH12:MI AM'),
      jsonb_build_object('scheduled_start', candidate.scheduled_start, 'scheduled_end', candidate.scheduled_end),
      jsonb_build_object('scheduled_start', work_cursor, 'scheduled_end', candidate_end, 'status', 'planned'));
    operation_count := operation_count + 1;
    work_cursor := candidate_end + interval '10 minutes';
  end loop;

  if operation_count = 0 then
    delete from public.change_sets where id = draft.id;
    raise exception 'no_tasks_to_plan';
  end if;

  update public.change_sets set metadata = metadata || jsonb_build_object('operation_count', operation_count)
    where id = draft.id returning * into draft;
  insert into public.activity_log (user_id, change_set_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source)
  values (auth.uid(), draft.id, 'changeset_created', 'change_set', draft.id, 'Drafted a daily plan', operation_count || ' scheduling changes are ready for review', 'Personal OS', 'system', 'web');
  return draft;
end;
$$;

create or replace function public.draft_unfinished_reschedule(target_date date)
returns public.change_sets
language plpgsql
security invoker
set search_path = public
as $$
declare
  timezone_name text;
  work_cursor timestamptz;
  task_row public.tasks;
  task_end timestamptz;
  draft public.change_sets;
  operation_count integer := 0;
begin
  select timezone into timezone_name from public.profiles where id = auth.uid();
  timezone_name := coalesce(timezone_name, 'Asia/Kolkata');
  work_cursor := (target_date::text || ' 09:00')::timestamp at time zone timezone_name;
  insert into public.change_sets (user_id, title, rationale, status, created_by, source, kind, plan_date)
  values (auth.uid(), 'Carry unfinished work forward', 'Moves incomplete scheduled work into tomorrow for review.', 'draft', 'Personal OS', 'web', 'unfinished_reschedule', target_date)
  returning * into draft;

  for task_row in select * from public.tasks
    where user_id = auth.uid() and status not in ('completed', 'blocked') and scheduled_end < now()
    order by scheduled_start limit 6
  loop
    task_end := work_cursor + make_interval(mins => greatest(task_row.estimate_minutes, 15));
    insert into public.change_operations (change_set_id, sequence, entity_type, action, entity_id, expected_version, summary, before_state, after_state)
    values (draft.id, operation_count, 'task', 'reschedule', task_row.id, task_row.version,
      'Move ' || task_row.title || ' to ' || to_char(work_cursor at time zone timezone_name, 'Mon DD, HH12:MI AM'),
      jsonb_build_object('scheduled_start', task_row.scheduled_start, 'scheduled_end', task_row.scheduled_end),
      jsonb_build_object('scheduled_start', work_cursor, 'scheduled_end', task_end, 'status', 'planned'));
    operation_count := operation_count + 1;
    work_cursor := task_end + interval '10 minutes';
  end loop;
  if operation_count = 0 then
    delete from public.change_sets where id = draft.id;
    raise exception 'no_unfinished_tasks';
  end if;
  insert into public.activity_log (user_id, change_set_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source)
  values (auth.uid(), draft.id, 'changeset_created', 'change_set', draft.id, 'Drafted unfinished-task carryover', operation_count || ' tasks are ready to review', 'Personal OS', 'system', 'web');
  return draft;
end;
$$;

revoke all on function public.initialize_phase_2_workspace() from public;
revoke all on function public.schedule_task(uuid, timestamptz, timestamptz) from public;
revoke all on function public.create_calendar_block_with_activity(text, public.calendar_block_kind, timestamptz, timestamptz, text) from public;
revoke all on function public.upsert_habit_checkin(uuid, date, numeric, text) from public;
revoke all on function public.generate_daily_plan_draft(date, boolean) from public;
revoke all on function public.draft_unfinished_reschedule(date) from public;

grant execute on function public.initialize_phase_2_workspace() to authenticated;
grant execute on function public.schedule_task(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.create_calendar_block_with_activity(text, public.calendar_block_kind, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.upsert_habit_checkin(uuid, date, numeric, text) to authenticated;
grant execute on function public.generate_daily_plan_draft(date, boolean) to authenticated;
grant execute on function public.draft_unfinished_reschedule(date) to authenticated;
