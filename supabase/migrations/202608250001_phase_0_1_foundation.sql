create extension if not exists pgcrypto;

create type public.project_status as enum ('active', 'paused', 'completed');
create type public.project_health as enum ('on_track', 'at_risk', 'blocked');
create type public.task_status as enum ('inbox', 'planned', 'in_progress', 'blocked', 'completed');
create type public.task_priority as enum ('critical', 'high', 'medium', 'low');
create type public.work_session_status as enum ('running', 'completed');
create type public.change_set_status as enum ('draft', 'committed', 'discarded', 'reversed');
create type public.change_source as enum ('web', 'api', 'mcp', 'system');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  timezone text not null default 'Asia/Kolkata',
  focus_target_minutes integer not null default 300 check (focus_target_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 140),
  code text not null check (char_length(code) between 2 and 8),
  description text not null default '',
  client_name text not null default '',
  status public.project_status not null default 'active',
  health public.project_health not null default 'on_track',
  progress smallint not null default 0 check (progress between 0 and 100),
  deadline timestamptz,
  next_milestone text not null default '',
  accent text not null default 'blue' check (accent in ('blue', 'violet', 'amber', 'emerald')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  status public.task_status not null default 'planned',
  priority public.task_priority not null default 'medium',
  due_at timestamptz,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  estimate_minutes integer not null default 30 check (estimate_minutes between 0 and 10080),
  completed_at timestamptz,
  tags text[] not null default '{}',
  source public.change_source not null default 'web',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  status public.work_session_status not null default 'running',
  outcome text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check ((status = 'completed' and ended_at is not null) or status = 'running')
);

create unique index one_running_session_per_user
  on public.work_sessions (user_id) where status = 'running';

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  note text not null default '',
  triaged boolean not null default false,
  promoted_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.change_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  rationale text not null default '',
  status public.change_set_status not null default 'draft',
  created_by text not null default 'You',
  source public.change_source not null default 'web',
  idempotency_key text,
  committed_at timestamptz,
  discarded_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, idempotency_key)
);

create table public.change_operations (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.change_sets(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  entity_type text not null check (entity_type in ('task', 'project', 'calendar_block', 'work_session')),
  action text not null check (action in ('create', 'update', 'complete', 'reschedule')),
  entity_id uuid,
  expected_version integer,
  summary text not null,
  before_state jsonb,
  after_state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (change_set_id, sequence)
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  change_set_id uuid references public.change_sets(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  detail text not null default '',
  actor_label text not null,
  actor_type text not null check (actor_type in ('user', 'chatgpt', 'system')),
  source public.change_source not null,
  before_state jsonb,
  after_state jsonb,
  reversible boolean not null default false,
  reversed_at timestamptz,
  occurred_at timestamptz not null default now()
);

create index projects_user_status_idx on public.projects (user_id, status);
create index tasks_user_status_due_idx on public.tasks (user_id, status, due_at);
create index tasks_user_schedule_idx on public.tasks (user_id, scheduled_start);
create index sessions_user_started_idx on public.work_sessions (user_id, started_at desc);
create index inbox_user_triaged_idx on public.inbox_items (user_id, triaged, created_at desc);
create index change_sets_user_status_idx on public.change_sets (user_id, status, created_at desc);
create index activity_user_occurred_idx on public.activity_log (user_id, occurred_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if to_jsonb(new) ? 'version' then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger work_sessions_set_updated_at before update on public.work_sessions for each row execute function public.set_updated_at();
create trigger inbox_items_set_updated_at before update on public.inbox_items for each row execute function public.set_updated_at();
create trigger change_sets_set_updated_at before update on public.change_sets for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.work_sessions enable row level security;
alter table public.inbox_items enable row level security;
alter table public.change_sets enable row level security;
alter table public.change_operations enable row level security;
alter table public.activity_log enable row level security;

create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy projects_select_own on public.projects for select using (user_id = auth.uid());
create policy projects_insert_own on public.projects for insert with check (user_id = auth.uid());
create policy projects_update_own on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy projects_delete_own on public.projects for delete using (user_id = auth.uid());

create policy tasks_select_own on public.tasks for select using (user_id = auth.uid());
create policy tasks_insert_own on public.tasks for insert with check (user_id = auth.uid());
create policy tasks_update_own on public.tasks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_delete_own on public.tasks for delete using (user_id = auth.uid());

create policy sessions_select_own on public.work_sessions for select using (user_id = auth.uid());
create policy sessions_insert_own on public.work_sessions for insert with check (user_id = auth.uid());
create policy sessions_update_own on public.work_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_delete_own on public.work_sessions for delete using (user_id = auth.uid());

create policy inbox_select_own on public.inbox_items for select using (user_id = auth.uid());
create policy inbox_insert_own on public.inbox_items for insert with check (user_id = auth.uid());
create policy inbox_update_own on public.inbox_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy inbox_delete_own on public.inbox_items for delete using (user_id = auth.uid());

create policy change_sets_select_own on public.change_sets for select using (user_id = auth.uid());
create policy change_sets_insert_own on public.change_sets for insert with check (user_id = auth.uid());
create policy change_sets_update_own on public.change_sets for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy change_operations_select_own on public.change_operations for select using (
  exists (select 1 from public.change_sets cs where cs.id = change_set_id and cs.user_id = auth.uid())
);
create policy change_operations_insert_own on public.change_operations for insert with check (
  exists (select 1 from public.change_sets cs where cs.id = change_set_id and cs.user_id = auth.uid() and cs.status = 'draft')
);

create policy activity_select_own on public.activity_log for select using (user_id = auth.uid());
create policy activity_insert_own on public.activity_log for insert with check (user_id = auth.uid());

create or replace function public.commit_task_change_set(target_change_set uuid)
returns public.change_sets
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected public.change_sets;
  operation public.change_operations;
  current_task public.tasks;
begin
  select * into selected from public.change_sets
    where id = target_change_set and user_id = auth.uid()
    for update;
  if selected.id is null then raise exception 'change_set_not_found'; end if;
  if selected.status <> 'draft' then raise exception 'change_set_not_draft'; end if;

  for operation in
    select * from public.change_operations where change_set_id = target_change_set order by sequence
  loop
    if operation.entity_type <> 'task' then raise exception 'unsupported_phase_1_entity'; end if;
    if operation.action = 'create' then
      insert into public.tasks (id, user_id, project_id, title, status, priority, due_at, scheduled_start, scheduled_end, estimate_minutes, tags, source)
      values (
        coalesce(operation.entity_id, gen_random_uuid()), auth.uid(), (operation.after_state ->> 'project_id')::uuid,
        operation.after_state ->> 'title', coalesce((operation.after_state ->> 'status')::public.task_status, 'planned'),
        coalesce((operation.after_state ->> 'priority')::public.task_priority, 'medium'),
        (operation.after_state ->> 'due_at')::timestamptz, (operation.after_state ->> 'scheduled_start')::timestamptz,
        (operation.after_state ->> 'scheduled_end')::timestamptz, coalesce((operation.after_state ->> 'estimate_minutes')::integer, 30),
        coalesce(array(select jsonb_array_elements_text(operation.after_state -> 'tags')), '{}'), selected.source
      );
    else
      select * into current_task from public.tasks where id = operation.entity_id and user_id = auth.uid() for update;
      if current_task.id is null then raise exception 'task_not_found'; end if;
      if operation.expected_version is not null and current_task.version <> operation.expected_version then raise exception 'version_conflict'; end if;
      update public.tasks set
        title = coalesce(operation.after_state ->> 'title', title),
        status = coalesce((operation.after_state ->> 'status')::public.task_status, status),
        priority = coalesce((operation.after_state ->> 'priority')::public.task_priority, priority),
        due_at = case when operation.after_state ? 'due_at' then (operation.after_state ->> 'due_at')::timestamptz else due_at end,
        scheduled_start = case when operation.after_state ? 'scheduled_start' then (operation.after_state ->> 'scheduled_start')::timestamptz else scheduled_start end,
        scheduled_end = case when operation.after_state ? 'scheduled_end' then (operation.after_state ->> 'scheduled_end')::timestamptz else scheduled_end end,
        completed_at = case when operation.after_state ? 'completed_at' then (operation.after_state ->> 'completed_at')::timestamptz else completed_at end
      where id = current_task.id;
    end if;

    insert into public.activity_log (user_id, change_set_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
    values (auth.uid(), selected.id, 'change_committed', operation.entity_type, operation.entity_id, operation.summary, selected.rationale, selected.created_by, case when selected.source = 'mcp' then 'chatgpt' else 'user' end, selected.source, operation.before_state, operation.after_state, operation.before_state is not null);
  end loop;

  update public.change_sets set status = 'committed', committed_at = now() where id = selected.id returning * into selected;
  return selected;
end;
$$;

revoke all on function public.commit_task_change_set(uuid) from public;
grant execute on function public.commit_task_change_set(uuid) to authenticated;
