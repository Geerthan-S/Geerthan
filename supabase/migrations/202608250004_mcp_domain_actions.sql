create table public.action_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 180),
  action_name text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index action_receipts_user_created_idx on public.action_receipts (user_id, created_at desc);
alter table public.action_receipts enable row level security;
create policy action_receipts_select_own on public.action_receipts for select using (user_id = auth.uid());
create policy action_receipts_insert_own on public.action_receipts for insert with check (user_id = auth.uid());

alter table public.habit_logs add column version integer not null default 1;

alter table public.change_operations drop constraint if exists change_operations_entity_type_check;
alter table public.change_operations add constraint change_operations_entity_type_check
  check (entity_type in ('task', 'project', 'calendar_block', 'work_session', 'habit'));
alter table public.change_operations drop constraint if exists change_operations_action_check;
alter table public.change_operations add constraint change_operations_action_check
  check (action in ('create', 'update', 'complete', 'reschedule', 'start', 'end', 'log'));

create or replace function public.private_cached_action(
  requested_action text,
  requested_key text,
  requested_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare cached public.action_receipts;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if char_length(requested_key) not between 8 and 180 then raise exception 'invalid_idempotency_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || requested_key, 0));
  select * into cached from public.action_receipts
    where user_id = auth.uid() and idempotency_key = requested_key;
  if cached.idempotency_key is null then return null; end if;
  if cached.action_name <> requested_action or cached.request_hash <> requested_hash then
    raise exception 'idempotency_conflict';
  end if;
  return cached.result;
end;
$$;

create or replace function public.private_save_action(
  requested_action text,
  requested_key text,
  requested_hash text,
  requested_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.action_receipts (user_id, idempotency_key, action_name, request_hash, result)
  values (auth.uid(), requested_key, requested_action, requested_hash, requested_result);
  return requested_result;
end;
$$;

create or replace function public.domain_create_task(
  task_title text,
  task_priority public.task_priority,
  task_project_id uuid,
  task_due_at timestamptz,
  task_estimate_minutes integer,
  task_tags text[],
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; created public.tasks; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('title', task_title, 'priority', task_priority, 'project_id', task_project_id, 'due_at', task_due_at, 'estimate', task_estimate_minutes, 'tags', task_tags)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('create_task', request_key, request_hash);
  if cached is not null then return cached; end if;
  if task_project_id is not null and not exists (select 1 from public.projects where id = task_project_id and user_id = auth.uid()) then raise exception 'project_not_found'; end if;
  insert into public.tasks (user_id, project_id, title, priority, due_at, estimate_minutes, tags, source)
  values (auth.uid(), task_project_id, trim(task_title), task_priority, task_due_at, task_estimate_minutes, coalesce(task_tags, '{}'), 'mcp')
  returning * into created;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, after_state, reversible)
  values (auth.uid(), 'task_created', 'task', created.id, 'Created ' || created.title, 'Created through an authenticated MCP domain action', 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(created), true);
  result := jsonb_build_object('task', to_jsonb(created), 'replayed', false);
  return public.private_save_action('create_task', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_update_task(
  target_task uuid,
  expected_version integer,
  task_patch jsonb,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; previous public.tasks; updated public.tasks; result jsonb; project_value uuid;
begin
  if task_patch - array['title','priority','project_id','due_at','estimate_minutes','tags'] <> '{}'::jsonb then raise exception 'unsupported_task_field'; end if;
  request_hash := encode(digest(jsonb_build_object('task', target_task, 'version', expected_version, 'patch', task_patch)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('update_task', request_key, request_hash);
  if cached is not null then return cached; end if;
  select * into previous from public.tasks where id = target_task and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'task_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;
  project_value := case when task_patch ? 'project_id' then (task_patch ->> 'project_id')::uuid else previous.project_id end;
  if project_value is not null and not exists (select 1 from public.projects where id = project_value and user_id = auth.uid()) then raise exception 'project_not_found'; end if;
  update public.tasks set
    title = case when task_patch ? 'title' then trim(task_patch ->> 'title') else title end,
    priority = case when task_patch ? 'priority' then (task_patch ->> 'priority')::public.task_priority else priority end,
    project_id = project_value,
    due_at = case when task_patch ? 'due_at' then (task_patch ->> 'due_at')::timestamptz else due_at end,
    estimate_minutes = case when task_patch ? 'estimate_minutes' then (task_patch ->> 'estimate_minutes')::integer else estimate_minutes end,
    tags = case when task_patch ? 'tags' then array(select jsonb_array_elements_text(task_patch -> 'tags')) else tags end,
    source = 'mcp'
  where id = previous.id returning * into updated;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'task_updated', 'task', updated.id, 'Updated ' || updated.title, 'Updated through an authenticated MCP domain action', 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(previous), to_jsonb(updated), true);
  result := jsonb_build_object('task', to_jsonb(updated), 'replayed', false);
  return public.private_save_action('update_task', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_complete_task(
  target_task uuid,
  expected_version integer,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; previous public.tasks; updated public.tasks; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('task', target_task, 'version', expected_version)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('complete_task', request_key, request_hash);
  if cached is not null then return cached; end if;
  select * into previous from public.tasks where id = target_task and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'task_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;
  if previous.status = 'completed' then raise exception 'task_already_completed'; end if;
  update public.tasks set status = 'completed', completed_at = now(), source = 'mcp' where id = previous.id returning * into updated;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'task_completed', 'task', updated.id, 'Completed ' || updated.title, 'Completed through an authenticated MCP domain action', 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(previous), to_jsonb(updated), true);
  result := jsonb_build_object('task', to_jsonb(updated), 'replayed', false);
  return public.private_save_action('complete_task', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_reschedule_task(
  target_task uuid,
  expected_version integer,
  task_start timestamptz,
  task_end timestamptz,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; previous public.tasks; updated public.tasks; result jsonb;
begin
  if task_end <= task_start then raise exception 'invalid_time_range'; end if;
  request_hash := encode(digest(jsonb_build_object('task', target_task, 'version', expected_version, 'start', task_start, 'end', task_end)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('reschedule_task', request_key, request_hash);
  if cached is not null then return cached; end if;
  select * into previous from public.tasks where id = target_task and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'task_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;
  if previous.status in ('completed', 'blocked') then raise exception 'task_not_schedulable'; end if;
  if exists (select 1 from public.tasks where user_id = auth.uid() and id <> target_task and status <> 'completed' and scheduled_start < task_end and scheduled_end > task_start)
    or exists (select 1 from public.calendar_blocks where user_id = auth.uid() and starts_at < task_end and ends_at > task_start)
  then raise exception 'schedule_conflict'; end if;
  update public.tasks set scheduled_start = task_start, scheduled_end = task_end, status = 'planned', source = 'mcp' where id = previous.id returning * into updated;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'task_scheduled', 'task', updated.id, 'Rescheduled ' || updated.title, 'Schedule updated through MCP', 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(previous), to_jsonb(updated), true);
  result := jsonb_build_object('task', to_jsonb(updated), 'replayed', false);
  return public.private_save_action('reschedule_task', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_start_work_session(
  target_task uuid,
  expected_task_version integer,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; selected public.tasks; created public.work_sessions; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('task', target_task, 'version', expected_task_version)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('start_work_session', request_key, request_hash);
  if cached is not null then return cached; end if;
  if exists (select 1 from public.work_sessions where user_id = auth.uid() and status = 'running') then raise exception 'session_already_running'; end if;
  select * into selected from public.tasks where id = target_task and user_id = auth.uid() for update;
  if selected.id is null then raise exception 'task_not_found'; end if;
  if selected.version <> expected_task_version then raise exception 'version_conflict'; end if;
  if selected.status in ('completed', 'blocked') then raise exception 'task_not_startable'; end if;
  insert into public.work_sessions (user_id, task_id, project_id, status) values (auth.uid(), selected.id, selected.project_id, 'running') returning * into created;
  update public.tasks set status = 'in_progress', source = 'mcp' where id = selected.id;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, after_state)
  values (auth.uid(), 'session_started', 'work_session', created.id, 'Started focus on ' || selected.title, 'Work session started through MCP', 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(created));
  result := jsonb_build_object('session', to_jsonb(created), 'replayed', false);
  return public.private_save_action('start_work_session', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_end_work_session(
  target_session uuid,
  expected_version integer,
  session_outcome text,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; previous public.work_sessions; updated public.work_sessions; result jsonb; elapsed integer;
begin
  request_hash := encode(digest(jsonb_build_object('session', target_session, 'version', expected_version, 'outcome', session_outcome)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('end_work_session', request_key, request_hash);
  if cached is not null then return cached; end if;
  select * into previous from public.work_sessions where id = target_session and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'session_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;
  if previous.status <> 'running' then raise exception 'session_not_running'; end if;
  elapsed := greatest(1, floor(extract(epoch from (now() - previous.started_at)) / 60)::integer);
  update public.work_sessions set ended_at = now(), duration_minutes = elapsed, status = 'completed', outcome = nullif(trim(session_outcome), '') where id = previous.id returning * into updated;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state)
  values (auth.uid(), 'session_completed', 'work_session', updated.id, 'Completed a ' || elapsed || '-minute focus session', coalesce(updated.outcome, 'Work session completed'), 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(previous), to_jsonb(updated));
  result := jsonb_build_object('session', to_jsonb(updated), 'replayed', false);
  return public.private_save_action('end_work_session', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_log_habit(
  target_habit uuid,
  target_date date,
  checkin_value numeric,
  checkin_note text,
  expected_log_version integer,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; selected public.habits; previous public.habit_logs; saved public.habit_logs; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('habit', target_habit, 'date', target_date, 'value', checkin_value, 'note', checkin_note, 'version', expected_log_version)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('log_habit', request_key, request_hash);
  if cached is not null then return cached; end if;
  select * into selected from public.habits where id = target_habit and user_id = auth.uid() and active for update;
  if selected.id is null then raise exception 'habit_not_found'; end if;
  if checkin_value < 0 then raise exception 'invalid_habit_value'; end if;
  if selected.metric = 'boolean' then checkin_value := case when checkin_value > 0 then 1 else 0 end; end if;
  select * into previous from public.habit_logs where user_id = auth.uid() and habit_id = target_habit and log_date = target_date for update;
  if previous.id is null and expected_log_version is not null then raise exception 'version_conflict'; end if;
  if previous.id is not null and (expected_log_version is null or previous.version <> expected_log_version) then raise exception 'version_conflict'; end if;
  if previous.id is null then
    insert into public.habit_logs (user_id, habit_id, log_date, value, note) values (auth.uid(), target_habit, target_date, checkin_value, coalesce(checkin_note, '')) returning * into saved;
  else
    update public.habit_logs set value = checkin_value, note = coalesce(checkin_note, '') where id = previous.id returning * into saved;
  end if;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'habit_checked_in', 'habit', selected.id, 'Logged ' || selected.name, checkin_value || case when selected.unit = '' then '' else ' ' || selected.unit end, 'ChatGPT', 'chatgpt', 'mcp', case when previous.id is null then null else to_jsonb(previous) end, to_jsonb(saved), true);
  result := jsonb_build_object('habit_log', to_jsonb(saved), 'replayed', false);
  return public.private_save_action('log_habit', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_create_time_block(
  block_title text,
  block_kind public.calendar_block_kind,
  block_start timestamptz,
  block_end timestamptz,
  block_notes text,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; created public.calendar_blocks; result jsonb;
begin
  if block_end <= block_start then raise exception 'invalid_time_range'; end if;
  request_hash := encode(digest(jsonb_build_object('title', block_title, 'kind', block_kind, 'start', block_start, 'end', block_end, 'notes', block_notes)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('create_time_block', request_key, request_hash);
  if cached is not null then return cached; end if;
  if exists (select 1 from public.calendar_blocks where user_id = auth.uid() and starts_at < block_end and ends_at > block_start)
    or exists (select 1 from public.tasks where user_id = auth.uid() and status <> 'completed' and scheduled_start < block_end and scheduled_end > block_start)
  then raise exception 'schedule_conflict'; end if;
  insert into public.calendar_blocks (user_id, title, kind, starts_at, ends_at, notes, source)
  values (auth.uid(), trim(block_title), block_kind, block_start, block_end, coalesce(block_notes, ''), 'mcp') returning * into created;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, after_state, reversible)
  values (auth.uid(), 'calendar_block_created', 'calendar_block', created.id, 'Blocked ' || created.title, 'Time block created through MCP', 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(created), true);
  result := jsonb_build_object('time_block', to_jsonb(created), 'replayed', false);
  return public.private_save_action('create_time_block', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_update_time_block(
  target_block uuid,
  expected_version integer,
  block_patch jsonb,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; previous public.calendar_blocks; updated public.calendar_blocks; result jsonb; next_start timestamptz; next_end timestamptz;
begin
  if block_patch - array['title','kind','starts_at','ends_at','notes'] <> '{}'::jsonb then raise exception 'unsupported_time_block_field'; end if;
  request_hash := encode(digest(jsonb_build_object('block', target_block, 'version', expected_version, 'patch', block_patch)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('update_time_block', request_key, request_hash);
  if cached is not null then return cached; end if;
  select * into previous from public.calendar_blocks where id = target_block and user_id = auth.uid() for update;
  if previous.id is null then raise exception 'time_block_not_found'; end if;
  if previous.version <> expected_version then raise exception 'version_conflict'; end if;
  next_start := case when block_patch ? 'starts_at' then (block_patch ->> 'starts_at')::timestamptz else previous.starts_at end;
  next_end := case when block_patch ? 'ends_at' then (block_patch ->> 'ends_at')::timestamptz else previous.ends_at end;
  if next_end <= next_start then raise exception 'invalid_time_range'; end if;
  if exists (select 1 from public.calendar_blocks where user_id = auth.uid() and id <> target_block and starts_at < next_end and ends_at > next_start)
    or exists (select 1 from public.tasks where user_id = auth.uid() and status <> 'completed' and scheduled_start < next_end and scheduled_end > next_start)
  then raise exception 'schedule_conflict'; end if;
  update public.calendar_blocks set
    title = case when block_patch ? 'title' then trim(block_patch ->> 'title') else title end,
    kind = case when block_patch ? 'kind' then (block_patch ->> 'kind')::public.calendar_block_kind else kind end,
    starts_at = next_start,
    ends_at = next_end,
    notes = case when block_patch ? 'notes' then block_patch ->> 'notes' else notes end,
    source = 'mcp'
  where id = previous.id returning * into updated;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'calendar_block_updated', 'calendar_block', updated.id, 'Updated ' || updated.title, 'Time block updated through MCP', 'ChatGPT', 'chatgpt', 'mcp', to_jsonb(previous), to_jsonb(updated), true);
  result := jsonb_build_object('time_block', to_jsonb(updated), 'replayed', false);
  return public.private_save_action('update_time_block', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_draft_day_plan(
  target_date date,
  include_overdue boolean,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; draft public.change_sets; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('date', target_date, 'include_overdue', include_overdue)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('draft_day_plan', request_key, request_hash);
  if cached is not null then return cached; end if;
  draft := public.generate_daily_plan_draft(target_date, include_overdue);
  update public.change_sets set source = 'mcp', created_by = 'ChatGPT', idempotency_key = request_key where id = draft.id returning * into draft;
  result := jsonb_build_object('change_set', to_jsonb(draft), 'replayed', false);
  return public.private_save_action('draft_day_plan', request_key, request_hash, result);
end;
$$;

create or replace function public.discard_change_set(target_change_set uuid)
returns public.change_sets
language plpgsql
security invoker
set search_path = public
as $$
declare selected public.change_sets; discarded public.change_sets;
begin
  select * into selected from public.change_sets where id = target_change_set and user_id = auth.uid() for update;
  if selected.id is null or selected.status <> 'draft' then raise exception 'draft_change_set_not_found'; end if;
  update public.change_sets set status = 'discarded', discarded_at = now() where id = selected.id returning * into discarded;
  insert into public.activity_log (user_id, change_set_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source)
  values (auth.uid(), discarded.id, 'changeset_discarded', 'change_set', discarded.id, 'Discarded ' || discarded.title, 'No proposed changes were applied', case when discarded.source = 'mcp' then 'ChatGPT' else 'You' end, case when discarded.source = 'mcp' then 'chatgpt' else 'user' end, discarded.source);
  return discarded;
end;
$$;

create or replace function public.domain_commit_change_set(target_change_set uuid, request_key text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; committed public.change_sets; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('change_set', target_change_set)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('commit_change_set', request_key, request_hash);
  if cached is not null then return cached; end if;
  committed := public.commit_task_change_set(target_change_set);
  result := jsonb_build_object('change_set', to_jsonb(committed), 'replayed', false);
  return public.private_save_action('commit_change_set', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_discard_change_set(target_change_set uuid, request_key text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; discarded public.change_sets; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('change_set', target_change_set)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('discard_change_set', request_key, request_hash);
  if cached is not null then return cached; end if;
  discarded := public.discard_change_set(target_change_set);
  result := jsonb_build_object('change_set', to_jsonb(discarded), 'replayed', false);
  return public.private_save_action('discard_change_set', request_key, request_hash, result);
end;
$$;

create or replace function public.domain_undo_change_set(target_change_set uuid, request_key text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; selected public.change_sets; operation public.change_operations; current_task public.tasks; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('change_set', target_change_set)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('undo_change_set', request_key, request_hash);
  if cached is not null then return cached; end if;
  select * into selected from public.change_sets where id = target_change_set and user_id = auth.uid() for update;
  if selected.id is null then raise exception 'change_set_not_found'; end if;
  if selected.status <> 'committed' then raise exception 'change_set_not_committed'; end if;
  for operation in select * from public.change_operations where change_set_id = selected.id order by sequence desc loop
    if operation.entity_type <> 'task' then raise exception 'undo_entity_not_supported'; end if;
    if operation.action = 'create' then
      if operation.entity_id is null then raise exception 'undo_missing_entity_id'; end if;
      delete from public.tasks where id = operation.entity_id and user_id = auth.uid();
      if not found then raise exception 'undo_target_changed'; end if;
    else
      select * into current_task from public.tasks where id = operation.entity_id and user_id = auth.uid() for update;
      if current_task.id is null then raise exception 'task_not_found'; end if;
      if operation.expected_version is not null and current_task.version <> operation.expected_version + 1 then raise exception 'version_conflict'; end if;
      update public.tasks set
        title = case when operation.before_state ? 'title' then operation.before_state ->> 'title' else title end,
        status = case when operation.before_state ? 'status' then (operation.before_state ->> 'status')::public.task_status else status end,
        priority = case when operation.before_state ? 'priority' then (operation.before_state ->> 'priority')::public.task_priority else priority end,
        project_id = case when operation.before_state ? 'project_id' then (operation.before_state ->> 'project_id')::uuid else project_id end,
        due_at = case when operation.before_state ? 'due_at' then (operation.before_state ->> 'due_at')::timestamptz else due_at end,
        scheduled_start = case when operation.before_state ? 'scheduled_start' then (operation.before_state ->> 'scheduled_start')::timestamptz else scheduled_start end,
        scheduled_end = case when operation.before_state ? 'scheduled_end' then (operation.before_state ->> 'scheduled_end')::timestamptz else scheduled_end end,
        completed_at = case when operation.before_state ? 'completed_at' then (operation.before_state ->> 'completed_at')::timestamptz else completed_at end,
        estimate_minutes = case when operation.before_state ? 'estimate_minutes' then (operation.before_state ->> 'estimate_minutes')::integer else estimate_minutes end,
        tags = case when operation.before_state ? 'tags' then array(select jsonb_array_elements_text(operation.before_state -> 'tags')) else tags end,
        source = 'mcp'
      where id = current_task.id;
    end if;
  end loop;
  update public.change_sets set status = 'reversed', reversed_at = now() where id = selected.id returning * into selected;
  update public.activity_log set reversed_at = now() where change_set_id = selected.id and reversible and reversed_at is null;
  insert into public.activity_log (user_id, change_set_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, reversible)
  values (auth.uid(), selected.id, 'changeset_reversed', 'change_set', selected.id, 'Undid ' || selected.title, 'Reversed the supported committed operations after version checks', 'ChatGPT', 'chatgpt', 'mcp', false);
  result := jsonb_build_object('change_set', to_jsonb(selected), 'replayed', false);
  return public.private_save_action('undo_change_set', request_key, request_hash, result);
end;
$$;

revoke all on function public.private_cached_action(text, text, text) from public;
revoke all on function public.private_save_action(text, text, text, jsonb) from public;
revoke all on function public.domain_create_task(text, public.task_priority, uuid, timestamptz, integer, text[], text) from public;
revoke all on function public.domain_update_task(uuid, integer, jsonb, text) from public;
revoke all on function public.domain_complete_task(uuid, integer, text) from public;
revoke all on function public.domain_reschedule_task(uuid, integer, timestamptz, timestamptz, text) from public;
revoke all on function public.domain_start_work_session(uuid, integer, text) from public;
revoke all on function public.domain_end_work_session(uuid, integer, text, text) from public;
revoke all on function public.domain_log_habit(uuid, date, numeric, text, integer, text) from public;
revoke all on function public.domain_create_time_block(text, public.calendar_block_kind, timestamptz, timestamptz, text, text) from public;
revoke all on function public.domain_update_time_block(uuid, integer, jsonb, text) from public;
revoke all on function public.domain_draft_day_plan(date, boolean, text) from public;
revoke all on function public.domain_commit_change_set(uuid, text) from public;
revoke all on function public.domain_discard_change_set(uuid, text) from public;
revoke all on function public.domain_undo_change_set(uuid, text) from public;

grant execute on function public.private_cached_action(text, text, text) to authenticated;
grant execute on function public.private_save_action(text, text, text, jsonb) to authenticated;
grant execute on function public.domain_create_task(text, public.task_priority, uuid, timestamptz, integer, text[], text) to authenticated;
grant execute on function public.domain_update_task(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.domain_complete_task(uuid, integer, text) to authenticated;
grant execute on function public.domain_reschedule_task(uuid, integer, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.domain_start_work_session(uuid, integer, text) to authenticated;
grant execute on function public.domain_end_work_session(uuid, integer, text, text) to authenticated;
grant execute on function public.domain_log_habit(uuid, date, numeric, text, integer, text) to authenticated;
grant execute on function public.domain_create_time_block(text, public.calendar_block_kind, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.domain_update_time_block(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.domain_draft_day_plan(date, boolean, text) to authenticated;
grant execute on function public.domain_commit_change_set(uuid, text) to authenticated;
grant execute on function public.domain_discard_change_set(uuid, text) to authenticated;
grant execute on function public.domain_undo_change_set(uuid, text) to authenticated;
