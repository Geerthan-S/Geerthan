create or replace function public.toggle_task(target_task uuid)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_task public.tasks;
  updated_task public.tasks;
  completing boolean;
begin
  select * into current_task
  from public.tasks
  where id = target_task and user_id = auth.uid()
  for update;

  if current_task.id is null then raise exception 'task_not_found'; end if;
  completing := current_task.status <> 'completed';

  update public.tasks
  set
    status = case when completing then 'completed'::public.task_status else 'planned'::public.task_status end,
    completed_at = case when completing then now() else null end
  where id = current_task.id
  returning * into updated_task;

  insert into public.activity_log (
    user_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source, before_state, after_state, reversible
  ) values (
    auth.uid(),
    case when completing then 'task_completed' else 'task_reopened' end,
    'task', current_task.id,
    case when completing then 'Completed ' else 'Reopened ' end || current_task.title,
    'Task status changed from the authenticated workspace',
    'You', 'user', 'web', to_jsonb(current_task), to_jsonb(updated_task), true
  );

  return updated_task;
end;
$$;

create or replace function public.create_task_with_activity(
  task_title text,
  task_priority public.task_priority default 'medium',
  task_project_id uuid default null,
  task_due_at timestamptz default null
)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_task public.tasks;
begin
  if task_project_id is not null and not exists (
    select 1 from public.projects where id = task_project_id and user_id = auth.uid()
  ) then
    raise exception 'project_not_found';
  end if;

  insert into public.tasks (user_id, project_id, title, priority, due_at, source)
  values (auth.uid(), task_project_id, trim(task_title), task_priority, task_due_at, 'web')
  returning * into created_task;

  insert into public.activity_log (
    user_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source, after_state, reversible
  ) values (
    auth.uid(), 'task_created', 'task', created_task.id,
    'Created ' || created_task.title, 'New task added from Tasks',
    'You', 'user', 'web', to_jsonb(created_task), true
  );

  return created_task;
end;
$$;

create or replace function public.add_inbox_item_with_activity(
  item_title text,
  item_note text default ''
)
returns public.inbox_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_item public.inbox_items;
begin
  insert into public.inbox_items (user_id, title, note)
  values (auth.uid(), trim(item_title), coalesce(item_note, ''))
  returning * into created_item;

  insert into public.activity_log (
    user_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source, after_state, reversible
  ) values (
    auth.uid(), 'capture_added', 'inbox_item', created_item.id,
    'Captured ' || created_item.title,
    case when created_item.note = '' then 'Added to Inbox' else created_item.note end,
    'You', 'user', 'web', to_jsonb(created_item), true
  );

  return created_item;
end;
$$;

create or replace function public.promote_inbox_item(target_item uuid)
returns public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_item public.inbox_items;
  created_task public.tasks;
begin
  select * into current_item
  from public.inbox_items
  where id = target_item and user_id = auth.uid() and triaged = false
  for update;

  if current_item.id is null then raise exception 'inbox_item_not_found'; end if;

  insert into public.tasks (user_id, title, priority, tags, source)
  values (auth.uid(), current_item.title, 'medium', array['inbox'], 'web')
  returning * into created_task;

  update public.inbox_items
  set triaged = true, promoted_task_id = created_task.id
  where id = current_item.id;

  insert into public.activity_log (
    user_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source, before_state, after_state, reversible
  ) values (
    auth.uid(), 'task_created', 'task', created_task.id,
    'Promoted ' || current_item.title, 'Inbox item converted to a task',
    'You', 'user', 'web', to_jsonb(current_item), to_jsonb(created_task), true
  );

  return created_task;
end;
$$;

create or replace function public.start_work_session(target_task uuid)
returns public.work_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected_task public.tasks;
  created_session public.work_sessions;
begin
  if exists (
    select 1 from public.work_sessions where user_id = auth.uid() and status = 'running'
  ) then
    raise exception 'session_already_running';
  end if;

  select * into selected_task
  from public.tasks
  where id = target_task and user_id = auth.uid() and status not in ('blocked', 'completed')
  for update;

  if selected_task.id is null then raise exception 'task_not_available'; end if;

  insert into public.work_sessions (user_id, task_id, project_id)
  values (auth.uid(), selected_task.id, selected_task.project_id)
  returning * into created_session;

  update public.tasks set status = 'in_progress' where id = selected_task.id;

  insert into public.activity_log (
    user_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source, after_state
  ) values (
    auth.uid(), 'session_started', 'work_session', created_session.id,
    'Started focus on ' || selected_task.title, 'Work timer is running',
    'You', 'user', 'web', to_jsonb(created_session)
  );

  return created_session;
end;
$$;

create or replace function public.stop_work_session(session_outcome text default '')
returns public.work_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  running_session public.work_sessions;
  completed_session public.work_sessions;
  elapsed_minutes integer;
begin
  select * into running_session
  from public.work_sessions
  where user_id = auth.uid() and status = 'running'
  for update;

  if running_session.id is null then raise exception 'running_session_not_found'; end if;
  elapsed_minutes := greatest(1, round(extract(epoch from (now() - running_session.started_at)) / 60));

  update public.work_sessions
  set
    status = 'completed',
    ended_at = now(),
    duration_minutes = elapsed_minutes,
    outcome = nullif(trim(session_outcome), '')
  where id = running_session.id
  returning * into completed_session;

  insert into public.activity_log (
    user_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source, before_state, after_state
  ) values (
    auth.uid(), 'session_completed', 'work_session', completed_session.id,
    'Focused for ' || elapsed_minutes || case when elapsed_minutes = 1 then ' minute' else ' minutes' end,
    coalesce(completed_session.outcome, 'Work session completed'),
    'You', 'user', 'web', to_jsonb(running_session), to_jsonb(completed_session)
  );

  return completed_session;
end;
$$;

create or replace function public.discard_change_set(target_change_set uuid)
returns public.change_sets
language plpgsql
security invoker
set search_path = public
as $$
declare
  discarded public.change_sets;
begin
  update public.change_sets
  set status = 'discarded', discarded_at = now()
  where id = target_change_set and user_id = auth.uid() and status = 'draft'
  returning * into discarded;

  if discarded.id is null then raise exception 'draft_change_set_not_found'; end if;

  insert into public.activity_log (
    user_id, change_set_id, event_type, entity_type, entity_id, summary, detail,
    actor_label, actor_type, source
  ) values (
    auth.uid(), discarded.id, 'changeset_discarded', 'change_set', discarded.id,
    'Discarded ' || discarded.title, 'No proposed changes were applied',
    'You', 'user', 'web'
  );

  return discarded;
end;
$$;

revoke all on function public.toggle_task(uuid) from public;
revoke all on function public.create_task_with_activity(text, public.task_priority, uuid, timestamptz) from public;
revoke all on function public.add_inbox_item_with_activity(text, text) from public;
revoke all on function public.promote_inbox_item(uuid) from public;
revoke all on function public.start_work_session(uuid) from public;
revoke all on function public.stop_work_session(text) from public;
revoke all on function public.discard_change_set(uuid) from public;

grant execute on function public.toggle_task(uuid) to authenticated;
grant execute on function public.create_task_with_activity(text, public.task_priority, uuid, timestamptz) to authenticated;
grant execute on function public.add_inbox_item_with_activity(text, text) to authenticated;
grant execute on function public.promote_inbox_item(uuid) to authenticated;
grant execute on function public.start_work_session(uuid) to authenticated;
grant execute on function public.stop_work_session(text) to authenticated;
grant execute on function public.discard_change_set(uuid) to authenticated;
