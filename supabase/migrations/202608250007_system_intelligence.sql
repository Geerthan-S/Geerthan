create type public.integration_status as enum ('not_configured', 'disconnected', 'healthy', 'degraded', 'error');
create type public.notification_kind as enum ('task', 'calendar', 'habit', 'work', 'finance', 'academic', 'learning', 'system');
create type public.connector_kind as enum ('google_calendar', 'microsoft_teams', 'vtop', 'lms', 'github', 'gmail', 'leetcode');

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  color text not null default 'blue',
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  title text not null check (char_length(title) between 1 and 220),
  description text not null default '',
  status text not null default 'active' check (status in ('planned','active','paused','achieved','cancelled')),
  horizon text not null default 'quarter' check (horizon in ('week','month','quarter','year','long_term')),
  target_value numeric(14,2) not null default 100,
  current_value numeric(14,2) not null default 0,
  unit text not null default '%',
  priority public.task_priority not null default 'medium',
  deadline date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 220),
  target_value numeric(14,2) not null default 0,
  completed boolean not null default false,
  due_on date,
  created_at timestamptz not null default now()
);

alter table public.projects add column area_id uuid references public.areas(id) on delete set null;
alter table public.projects add column goal_id uuid references public.goals(id) on delete set null;
alter table public.tasks add column area_id uuid references public.areas(id) on delete set null;
alter table public.tasks add column goal_id uuid references public.goals(id) on delete set null;
alter table public.inbox_items add column suggested_kind text check (suggested_kind in ('task','meeting','idea','follow_up','learning','finance','academic'));
alter table public.inbox_items add column suggested_priority public.task_priority;
alter table public.inbox_items add column suggestion_confidence numeric(3,2) check (suggestion_confidence between 0 and 1);
alter table public.inbox_items add column suggestion_reason text not null default '';

create or replace function public.classify_inbox_capture()
returns trigger language plpgsql security invoker set search_path = public as $$
declare content text := lower(new.title || ' ' || new.note);
begin
  if content ~ '(invoice|payment|expense|income|budget)' then new.suggested_kind:='finance'; new.suggested_priority:='high'; new.suggestion_confidence:=0.82; new.suggestion_reason:='Money-related language detected.';
  elsif content ~ '(class|assignment|exam|attendance|faculty)' then new.suggested_kind:='academic'; new.suggested_priority:='high'; new.suggestion_confidence:=0.80; new.suggestion_reason:='Academic deadline or attendance language detected.';
  elsif content ~ '(learn|course|dsa|leetcode|revise)' then new.suggested_kind:='learning'; new.suggested_priority:='medium'; new.suggestion_confidence:=0.78; new.suggestion_reason:='Learning or practice language detected.';
  elsif content ~ '(call|meeting|schedule)' then new.suggested_kind:='meeting'; new.suggested_priority:='medium'; new.suggestion_confidence:=0.76; new.suggestion_reason:='Scheduling language detected.';
  elsif content ~ '(follow up|reply|email|send)' then new.suggested_kind:='follow_up'; new.suggested_priority:='high'; new.suggestion_confidence:=0.74; new.suggestion_reason:='Follow-up language detected.';
  elsif content ~ '(idea|maybe|explore)' then new.suggested_kind:='idea'; new.suggested_priority:='low'; new.suggestion_confidence:=0.68; new.suggestion_reason:='Exploratory language detected.';
  else new.suggested_kind:='task'; new.suggested_priority:='medium'; new.suggestion_confidence:=0.60; new.suggestion_reason:='Default actionable-item suggestion.'; end if;
  return new;
end;
$$;
create trigger inbox_items_classify before insert or update of title,note on public.inbox_items for each row execute function public.classify_inbox_capture();

create table public.planning_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  workday_start time not null default '09:00',
  workday_end time not null default '19:00',
  deep_work_minutes integer not null default 90 check (deep_work_minutes between 15 and 240),
  break_minutes integer not null default 15 check (break_minutes between 5 and 120),
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  weekend_planning boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connector public.connector_kind not null,
  status public.integration_status not null default 'not_configured',
  capabilities text[] not null default '{}',
  account_label text not null default '',
  status_message text not null default 'OAuth or connector configuration is required.',
  last_checked_at timestamptz,
  last_synced_at timestamptz,
  cursor text,
  configuration jsonb not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connector)
);

create table public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  direction text not null check (direction in ('pull','push')),
  status text not null check (status in ('started','completed','failed','skipped')),
  records_processed integer not null default 0,
  message text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null default 'system',
  title text not null check (char_length(title) between 1 and 220),
  body text not null default '',
  action_url text not null default '',
  scheduled_for timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  source_type text not null default '',
  source_id uuid,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  task_reminders boolean not null default true,
  calendar_reminders boolean not null default true,
  habit_reminders boolean not null default true,
  finance_reminders boolean not null default true,
  academic_reminders boolean not null default true,
  learning_reminders boolean not null default true,
  reminder_lead_minutes integer not null default 15 check (reminder_lead_minutes between 0 and 10080),
  daily_brief_time time not null default '08:00',
  updated_at timestamptz not null default now()
);

create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index goals_user_status_deadline_idx on public.goals (user_id, status, deadline);
create index notifications_user_unread_idx on public.notifications (user_id, read_at, scheduled_for, created_at desc);
create index integration_sync_user_idx on public.integration_sync_logs (user_id, started_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['areas','goals','planning_preferences','integration_connections','notification_preferences','web_push_subscriptions'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
  foreach table_name in array array['areas','goals','goal_milestones','planning_preferences','integration_connections','integration_sync_logs','notifications','notification_preferences','web_push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I_select_own on public.%I for select using (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_insert_own on public.%I for insert with check (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_update_own on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_delete_own on public.%I for delete using (user_id = auth.uid())', table_name, table_name);
  end loop;
end;
$$;

create or replace view public.task_priority_scores with (security_invoker = true) as
select t.user_id, t.id as task_id,
  (case t.priority when 'critical' then 100 when 'high' then 70 when 'medium' then 40 else 10 end)
  + (case when t.due_at < now() then 50 when t.due_at < now() + interval '1 day' then 30 when t.due_at < now() + interval '3 days' then 15 else 0 end)
  + (case when t.status = 'in_progress' then 12 when t.status = 'blocked' then 5 else 0 end)
  + (case when g.priority = 'critical' then 18 when g.priority = 'high' then 10 else 0 end) as priority_score
from public.tasks t left join public.goals g on g.id = t.goal_id and g.user_id = t.user_id
where t.status in ('inbox','planned','in_progress','blocked');

create or replace view public.personal_os_daily_analytics with (security_invoker = true) as
with days as (select generate_series(current_date - 29, current_date, interval '1 day')::date as metric_date),
task_data as (select user_id, completed_at::date as metric_date, count(*) completed_tasks from public.tasks where completed_at >= current_date - 29 group by user_id, completed_at::date),
session_data as (select user_id, started_at::date as metric_date, sum(duration_minutes) focus_minutes from public.work_sessions where started_at >= current_date - 29 group by user_id, started_at::date),
habit_data as (select l.user_id, l.log_date as metric_date, count(*) filter (where l.value >= h.target_value) completed_habits, count(*) habit_logs from public.habit_logs l join public.habits h on h.id = l.habit_id where l.log_date >= current_date - 29 group by l.user_id, l.log_date)
select p.id user_id, d.metric_date as day, coalesce(t.completed_tasks,0) completed_tasks, coalesce(s.focus_minutes,0) focus_minutes,
  coalesce(h.completed_habits,0) completed_habits, coalesce(h.habit_logs,0) habit_logs
from public.profiles p cross join days d
left join task_data t on t.user_id = p.id and t.metric_date = d.metric_date
left join session_data s on s.user_id = p.id and s.metric_date = d.metric_date
left join habit_data h on h.user_id = p.id and h.metric_date = d.metric_date;

create or replace function public.initialize_system_workspace()
returns void language plpgsql security invoker set search_path = public as $$
declare work_area uuid; growth_area uuid; academic_area uuid; work_goal uuid; dsa_goal uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  insert into public.planning_preferences (user_id) values (auth.uid()) on conflict do nothing;
  insert into public.notification_preferences (user_id) values (auth.uid()) on conflict do nothing;
  insert into public.integration_connections (user_id, connector, capabilities) values
    (auth.uid(),'google_calendar',array['read','write']), (auth.uid(),'microsoft_teams',array['read']),
    (auth.uid(),'vtop',array['read']), (auth.uid(),'lms',array['read']), (auth.uid(),'github',array['read']),
    (auth.uid(),'gmail',array['read']), (auth.uid(),'leetcode',array['read'])
  on conflict (user_id, connector) do nothing;
  insert into public.integration_sync_logs(user_id,connection_id,direction,status,message,completed_at)
  select auth.uid(),c.id,'pull','skipped','Connector authorization has not been configured.',now()
  from public.integration_connections c where c.user_id=auth.uid()
    and not exists(select 1 from public.integration_sync_logs l where l.connection_id=c.id);
  if exists (select 1 from public.areas where user_id = auth.uid()) then return; end if;
  insert into public.areas (user_id,name,description,color) values (auth.uid(),'Work','Internship, freelance, clients and business delivery.','blue') returning id into work_area;
  insert into public.areas (user_id,name,description,color) values (auth.uid(),'Growth','Skills, DSA and durable learning evidence.','violet') returning id into growth_area;
  insert into public.areas (user_id,name,description,color) values (auth.uid(),'Academics','Classes, attendance, assignments and exams.','amber') returning id into academic_area;
  insert into public.goals (user_id,area_id,title,description,horizon,target_value,current_value,unit,priority,deadline)
  values (auth.uid(),work_area,'Deliver current client milestones','Close the current delivery cycle without overdue work.','month',100,64,'%', 'critical', current_date + 30) returning id into work_goal;
  insert into public.goals (user_id,area_id,title,description,horizon,target_value,current_value,unit,priority,deadline)
  values (auth.uid(),growth_area,'Become interview-ready in DSA','Build mastery with solved-problem evidence.','year',300,187,'problems','high', current_date + 180) returning id into dsa_goal;
  insert into public.goal_milestones (user_id,goal_id,title,target_value,due_on) values
    (auth.uid(),work_goal,'Client milestone approved',100,current_date + 14),
    (auth.uid(),dsa_goal,'Reach 225 solved problems',225,current_date + 60);
  update public.projects set area_id = work_area, goal_id = work_goal where user_id = auth.uid() and status = 'active';
  update public.tasks set area_id = work_area, goal_id = work_goal where user_id = auth.uid() and project_id is not null and status <> 'completed';
  insert into public.notifications (user_id,kind,title,body,action_url,scheduled_for,source_type) values
    (auth.uid(),'work','Protect the next delivery block','A high-priority work item is due soon.','/today',now(),'seed'),
    (auth.uid(),'habit','Daily check-in is open','Log habits before the day closes.','/habits',date_trunc('day',now()) + interval '20 hours','seed'),
    (auth.uid(),'academic','Attendance needs attention','Review subjects below your attendance target.','/academics',now() + interval '2 hours','seed');
end;
$$;

create or replace function public.product_system_action(requested_action text, payload jsonb, expected_version integer, request_key text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare request_hash text; cached jsonb; saved_row jsonb; before_row jsonb; entity_id uuid; result jsonb;
begin
  request_hash := encode(digest(jsonb_build_object('action',requested_action,'payload',payload,'version',expected_version)::text,'sha256'),'hex');
  cached := public.private_cached_action('system.' || requested_action, request_key, request_hash);
  if cached is not null then return cached; end if;
  if requested_action = 'create_area' then
    insert into public.areas(user_id,name,description,color) values(auth.uid(),trim(payload->>'name'),coalesce(payload->>'description',''),coalesce(payload->>'color','blue')) returning to_jsonb(areas.*) into saved_row;
  elsif requested_action = 'create_goal' then
    insert into public.goals(user_id,area_id,title,description,status,horizon,target_value,current_value,unit,priority,deadline)
    values(auth.uid(),(payload->>'area_id')::uuid,trim(payload->>'title'),coalesce(payload->>'description',''),'active',coalesce(payload->>'horizon','quarter'),coalesce((payload->>'target_value')::numeric,100),coalesce((payload->>'current_value')::numeric,0),coalesce(payload->>'unit','%'),coalesce((payload->>'priority')::public.task_priority,'medium'),(payload->>'deadline')::date) returning to_jsonb(goals.*) into saved_row;
  elsif requested_action = 'update_goal' then
    entity_id := (payload->>'id')::uuid;
    select to_jsonb(g.*) into before_row from public.goals g where id=entity_id and user_id=auth.uid() for update;
    if before_row is null then raise exception 'goal_not_found'; end if;
    if (before_row->>'version')::integer <> expected_version then raise exception 'version_conflict'; end if;
    update public.goals set title=coalesce(payload->>'title',title), status=coalesce(payload->>'status',status), current_value=coalesce((payload->>'current_value')::numeric,current_value), deadline=case when payload ? 'deadline' then (payload->>'deadline')::date else deadline end where id=entity_id returning to_jsonb(goals.*) into saved_row;
  elsif requested_action = 'mark_notification_read' then
    update public.notifications set read_at=coalesce(read_at,now()) where id=(payload->>'id')::uuid and user_id=auth.uid() returning to_jsonb(notifications.*) into saved_row;
    if saved_row is null then raise exception 'notification_not_found'; end if;
  elsif requested_action = 'mark_all_notifications_read' then
    update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null;
    saved_row := jsonb_build_object('marked',true);
  elsif requested_action = 'update_notification_preferences' then
    insert into public.notification_preferences(user_id) values(auth.uid()) on conflict do nothing;
    update public.notification_preferences set
      in_app_enabled=coalesce((payload->>'in_app_enabled')::boolean,in_app_enabled),
      push_enabled=coalesce((payload->>'push_enabled')::boolean,push_enabled),
      task_reminders=coalesce((payload->>'task_reminders')::boolean,task_reminders),
      calendar_reminders=coalesce((payload->>'calendar_reminders')::boolean,calendar_reminders),
      habit_reminders=coalesce((payload->>'habit_reminders')::boolean,habit_reminders),
      finance_reminders=coalesce((payload->>'finance_reminders')::boolean,finance_reminders),
      academic_reminders=coalesce((payload->>'academic_reminders')::boolean,academic_reminders),
      learning_reminders=coalesce((payload->>'learning_reminders')::boolean,learning_reminders),
      reminder_lead_minutes=coalesce((payload->>'reminder_lead_minutes')::integer,reminder_lead_minutes)
    where user_id=auth.uid() returning to_jsonb(notification_preferences.*) into saved_row;
  elsif requested_action = 'upsert_push_subscription' then
    insert into public.web_push_subscriptions(user_id,endpoint,p256dh,auth_key,user_agent,active)
    values(auth.uid(),payload->>'endpoint',payload->>'p256dh',payload->>'auth_key',coalesce(payload->>'user_agent',''),true)
    on conflict(user_id,endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,user_agent=excluded.user_agent,active=true
    returning to_jsonb(web_push_subscriptions.*) into saved_row;
  else raise exception 'unsupported_system_action';
  end if;
  insert into public.activity_log(user_id,event_type,entity_type,entity_id,summary,detail,actor_label,actor_type,source,before_state,after_state,reversible)
  values(auth.uid(),'system_record_changed',split_part(requested_action,'_',2),coalesce((saved_row->>'id')::uuid,(payload->>'id')::uuid),initcap(replace(requested_action,'_',' ')),'Saved from the authenticated Personal OS workspace','You','user','web',before_row,saved_row,before_row is not null);
  result := jsonb_build_object('record',saved_row,'replayed',false);
  return public.private_save_action('system.' || requested_action,request_key,request_hash,result);
end;
$$;

create or replace function public.refresh_smart_notifications()
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  insert into public.notifications(user_id,kind,title,body,action_url,scheduled_for,source_type,source_id)
  select auth.uid(),'task',case when t.due_at < now() then 'Overdue: ' else 'Due soon: ' end || t.title,
    case when t.due_at < now() then 'This item is now escalating because its deadline passed.' else 'Protect time before this deadline becomes urgent.' end,
    '/today',now(),'task',t.id from public.tasks t where t.user_id=auth.uid() and t.status<>'completed' and t.due_at<now()+interval '1 day'
    and not exists(select 1 from public.notifications n where n.user_id=auth.uid() and n.source_type='task' and n.source_id=t.id and n.created_at>current_date);
  insert into public.notifications(user_id,kind,title,body,action_url,scheduled_for,source_type,source_id)
  select auth.uid(),'finance','Payment follow-up: ' || i.invoice_number,'A client balance remains open and the collection date is close.','/work',now(),'invoice',i.id
  from public.invoices i where i.user_id=auth.uid() and i.status not in ('paid','cancelled') and i.due_on<=current_date+3
    and not exists(select 1 from public.notifications n where n.user_id=auth.uid() and n.source_type='invoice' and n.source_id=i.id and n.created_at>current_date-1);
  insert into public.notifications(user_id,kind,title,body,action_url,scheduled_for,source_type,source_id)
  select auth.uid(),'academic','Assignment due: ' || a.title,'Coursework is approaching its submission window.','/academics',now(),'assignment',a.id
  from public.assignments a where a.user_id=auth.uid() and a.status not in ('submitted','graded') and a.due_at<now()+interval '3 days'
    and not exists(select 1 from public.notifications n where n.user_id=auth.uid() and n.source_type='assignment' and n.source_id=a.id and n.created_at>current_date-1);
  insert into public.notifications(user_id,kind,title,body,action_url,scheduled_for,source_type,source_id)
  select auth.uid(),'learning','Revision due: ' || t.title,'This topic has reached its spaced-repetition date.','/growth',now(),'learning_topic',t.id
  from public.learning_topics t where t.user_id=auth.uid() and t.next_revision_on<=current_date
    and not exists(select 1 from public.notifications n where n.user_id=auth.uid() and n.source_type='learning_topic' and n.source_id=t.id and n.created_at>current_date-1);
  insert into public.notifications(user_id,kind,title,body,action_url,scheduled_for,source_type,source_id)
  select auth.uid(),'academic','Attendance risk: ' || s.code,'Current attendance is below your configured target.','/academics',now(),'subject',s.id
  from public.subjects s join public.subject_attendance_summary a on a.subject_id=s.id and a.user_id=s.user_id where s.user_id=auth.uid() and a.attendance_percentage<s.attendance_target
    and not exists(select 1 from public.notifications n where n.user_id=auth.uid() and n.source_type='subject' and n.source_id=s.id and n.created_at>current_date-3);
  insert into public.notifications(user_id,kind,title,body,action_url,scheduled_for,source_type)
  select auth.uid(),'habit','Daily habit check-in','Keep the record complete before quiet hours begin.','/habits',date_trunc('day',now())+interval '20 hours','habit_daily_'||current_date
  where exists(select 1 from public.habits h where h.user_id=auth.uid() and h.active)
    and not exists(select 1 from public.notifications n where n.user_id=auth.uid() and n.source_type='habit_daily_'||current_date);
end;
$$;

revoke all on function public.initialize_system_workspace() from public;
revoke all on function public.product_system_action(text,jsonb,integer,text) from public;
revoke all on function public.refresh_smart_notifications() from public;
grant execute on function public.initialize_system_workspace() to authenticated;
grant execute on function public.product_system_action(text,jsonb,integer,text) to authenticated;
grant execute on function public.refresh_smart_notifications() to authenticated;
