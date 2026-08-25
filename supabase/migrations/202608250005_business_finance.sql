create type public.client_status as enum ('lead', 'active', 'paused', 'former');
create type public.pipeline_status as enum ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost');
create type public.document_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired');
create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled');
create type public.deliverable_status as enum ('planned', 'in_progress', 'review', 'completed', 'blocked');
create type public.finance_entry_type as enum ('income', 'expense');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  status public.client_status not null default 'lead',
  health public.project_health not null default 'on_track',
  next_action text not null default '',
  next_action_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table public.projects add column client_id uuid references public.clients(id) on delete set null;

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 220),
  description text not null default '',
  status public.deliverable_status not null default 'planned',
  progress smallint not null default 0 check (progress between 0 and 100),
  due_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 220),
  status public.document_status not null default 'draft',
  amount numeric(14,2) not null default 0 check (amount >= 0),
  currency char(3) not null default 'INR',
  valid_until date,
  notes text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  invoice_number text not null check (char_length(invoice_number) between 1 and 40),
  status public.invoice_status not null default 'draft',
  issued_on date not null default current_date,
  due_on date,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) generated always as (subtotal + tax) stored,
  currency char(3) not null default 'INR',
  notes text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text not null default 'bank_transfer',
  reference text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_type public.finance_entry_type not null,
  entry_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  category text not null,
  description text not null default '',
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  company text not null default '',
  email text not null default '',
  status public.pipeline_status not null default 'new',
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  probability smallint not null default 10 check (probability between 0 and 100),
  next_action text not null default '',
  next_action_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 220),
  target_value numeric(14,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  unit text not null default '',
  deadline date,
  status text not null default 'active' check (status in ('active','achieved','paused')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recurring_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 220),
  cadence text not null check (cadence in ('daily','weekly','monthly','quarterly')),
  next_due date not null,
  last_completed_at timestamptz,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 220),
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  currency char(3) not null default 'INR',
  deadline date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_user_status_idx on public.clients (user_id, status, updated_at desc);
create index deliverables_user_due_idx on public.deliverables (user_id, status, due_at);
create index invoices_user_status_due_idx on public.invoices (user_id, status, due_on);
create index payments_user_invoice_idx on public.payments (user_id, invoice_id, paid_at desc);
create index finance_user_date_idx on public.finance_transactions (user_id, entry_date desc, entry_type);
create index leads_user_status_idx on public.leads (user_id, status, updated_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['clients','deliverables','proposals','invoices','leads','business_goals','recurring_operations','financial_goals'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
  foreach table_name in array array['clients','client_contacts','client_notes','deliverables','proposals','invoices','payments','finance_transactions','leads','business_goals','recurring_operations','financial_goals'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I_select_own on public.%I for select using (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_insert_own on public.%I for insert with check (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_update_own on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_delete_own on public.%I for delete using (user_id = auth.uid())', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.enforce_owned_business_references()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare row_data jsonb := to_jsonb(new); reference_id uuid;
begin
  if row_data ? 'client_id' and nullif(row_data ->> 'client_id', '') is not null then
    reference_id := (row_data ->> 'client_id')::uuid;
    if not exists (select 1 from public.clients where id = reference_id and user_id = new.user_id) then raise exception 'client_not_found'; end if;
  end if;
  if row_data ? 'project_id' and nullif(row_data ->> 'project_id', '') is not null then
    reference_id := (row_data ->> 'project_id')::uuid;
    if not exists (select 1 from public.projects where id = reference_id and user_id = new.user_id) then raise exception 'project_not_found'; end if;
  end if;
  if row_data ? 'invoice_id' and nullif(row_data ->> 'invoice_id', '') is not null then
    reference_id := (row_data ->> 'invoice_id')::uuid;
    if not exists (select 1 from public.invoices where id = reference_id and user_id = new.user_id) then raise exception 'invoice_not_found'; end if;
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['projects','client_contacts','client_notes','deliverables','proposals','invoices','payments','finance_transactions'] loop
    execute format('create trigger %I_owned_references before insert or update on public.%I for each row execute function public.enforce_owned_business_references()', table_name, table_name);
  end loop;
end;
$$;

create or replace view public.finance_monthly_summary with (security_invoker = true) as
select user_id, date_trunc('month', entry_date)::date as month,
  sum(amount) filter (where entry_type = 'income') as income,
  sum(amount) filter (where entry_type = 'expense') as expenses,
  sum(case when entry_type = 'income' then amount else -amount end) as net_cash_flow
from public.finance_transactions group by user_id, date_trunc('month', entry_date);

create or replace view public.client_financial_summary with (security_invoker = true) as
select c.user_id, c.id as client_id, c.name,
  coalesce(sum(i.total), 0) as invoiced,
  coalesce((select sum(p.amount) from public.payments p join public.invoices pi on pi.id = p.invoice_id where pi.client_id = c.id and p.user_id = c.user_id), 0) as collected
from public.clients c left join public.invoices i on i.client_id = c.id and i.user_id = c.user_id
group by c.user_id, c.id, c.name;

create or replace function public.initialize_business_workspace()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare northstar uuid; internship uuid; atlas uuid; internship_project uuid; invoice_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if exists (select 1 from public.clients where user_id = auth.uid()) then return; end if;
  insert into public.clients (user_id, name, company, email, status, health, next_action, next_action_at)
  values (auth.uid(), 'Maya Rao', 'Northstar Labs', 'maya@northstar.example', 'active', 'on_track', 'Review milestone approval', now() + interval '2 days') returning id into northstar;
  insert into public.clients (user_id, name, company, email, status, health, next_action, next_action_at)
  values (auth.uid(), 'Product Team', 'Internship', 'team@internship.example', 'active', 'at_risk', 'Confirm navigation handoff', now() + interval '1 day') returning id into internship;
  insert into public.client_contacts (user_id, client_id, name, role, email, is_primary) values
    (auth.uid(), northstar, 'Maya Rao', 'Product lead', 'maya@northstar.example', true),
    (auth.uid(), internship, 'Arun K', 'Engineering mentor', 'arun@internship.example', true);
  insert into public.client_notes (user_id, client_id, note) values
    (auth.uid(), northstar, 'Prefers a concise weekly progress note and recorded walkthroughs.'),
    (auth.uid(), internship, 'Navigation delivery is the current critical path.');
  select id into atlas from public.projects where user_id = auth.uid() and code = 'ATL' limit 1;
  select id into internship_project from public.projects where user_id = auth.uid() and code = 'IPR' limit 1;
  update public.projects set client_id = northstar where id = atlas;
  update public.projects set client_id = internship where id = internship_project;
  insert into public.deliverables (user_id, client_id, project_id, title, status, progress, due_at) values
    (auth.uid(), northstar, atlas, 'Approval and reporting workspace', 'review', 82, now() + interval '4 days'),
    (auth.uid(), northstar, atlas, 'Stakeholder walkthrough', 'planned', 25, now() + interval '9 days'),
    (auth.uid(), internship, internship_project, 'Responsive navigation handoff', 'in_progress', 64, now() + interval '2 days');
  insert into public.proposals (user_id, client_id, project_id, title, status, amount, valid_until, notes)
  values (auth.uid(), northstar, atlas, 'Atlas phase-two extension', 'sent', 85000, current_date + 10, 'Reporting automation and approval enhancements.');
  insert into public.invoices (user_id, client_id, project_id, invoice_number, status, issued_on, due_on, subtotal, tax, notes)
  values (auth.uid(), northstar, atlas, 'INV-2026-014', 'partial', current_date - 12, current_date + 2, 60000, 10800, 'Atlas milestone two') returning id into invoice_id;
  insert into public.payments (user_id, invoice_id, amount, paid_at, method, reference)
  values (auth.uid(), invoice_id, 30000, now() - interval '4 days', 'bank_transfer', 'UTR-DEMO-014');
  insert into public.finance_transactions (user_id, entry_type, entry_date, amount, category, description, client_id, project_id, invoice_id) values
    (auth.uid(), 'income', current_date - 4, 30000, 'Client payment', 'Partial payment for Atlas milestone', northstar, atlas, invoice_id),
    (auth.uid(), 'expense', current_date - 6, 2499, 'Software', 'Design and development tools', null, null, null),
    (auth.uid(), 'expense', current_date - 2, 1800, 'Operations', 'Client meeting and travel', northstar, atlas, null);
  insert into public.leads (user_id, name, company, email, status, estimated_value, probability, next_action, next_action_at) values
    (auth.uid(), 'Arjun Mehta', 'Meridian Studio', 'arjun@meridian.example', 'proposal', 120000, 65, 'Follow up on revised scope', now() + interval '1 day'),
    (auth.uid(), 'Nila S', 'Independent founder', 'nila@founder.example', 'qualified', 45000, 40, 'Schedule discovery call', now() + interval '3 days');
  insert into public.business_goals (user_id, title, target_value, current_value, unit, deadline) values
    (auth.uid(), 'Reach monthly studio revenue', 150000, 30000, 'INR', date_trunc('month', current_date)::date + interval '1 month - 1 day');
  insert into public.recurring_operations (user_id, title, cadence, next_due) values
    (auth.uid(), 'Send client progress updates', 'weekly', current_date + 3),
    (auth.uid(), 'Review invoices and collections', 'weekly', current_date + 1),
    (auth.uid(), 'Close monthly accounts', 'monthly', date_trunc('month', current_date)::date + interval '1 month - 1 day');
  insert into public.financial_goals (user_id, title, target_amount, current_amount, deadline) values
    (auth.uid(), 'Emergency runway', 300000, 85000, current_date + 180),
    (auth.uid(), 'New workstation fund', 180000, 42000, current_date + 120);
end;
$$;

create or replace function public.product_business_action(
  requested_action text,
  payload jsonb,
  expected_version integer,
  request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare request_hash text; cached jsonb; result jsonb; before_row jsonb; saved_row jsonb; entity_id uuid; selected_invoice public.invoices; paid_total numeric;
begin
  request_hash := encode(digest(jsonb_build_object('action', requested_action, 'payload', payload, 'version', expected_version)::text, 'sha256'), 'hex');
  cached := public.private_cached_action('business.' || requested_action, request_key, request_hash);
  if cached is not null then return cached; end if;
  if requested_action = 'create_client' then
    insert into public.clients (user_id, name, company, email, phone, status, health, next_action, next_action_at)
    values (auth.uid(), trim(payload ->> 'name'), coalesce(payload ->> 'company',''), coalesce(payload ->> 'email',''), coalesce(payload ->> 'phone',''), coalesce((payload ->> 'status')::public.client_status,'lead'), coalesce((payload ->> 'health')::public.project_health,'on_track'), coalesce(payload ->> 'next_action',''), (payload ->> 'next_action_at')::timestamptz) returning to_jsonb(clients.*) into saved_row;
  elsif requested_action = 'update_client' then
    entity_id := (payload ->> 'id')::uuid;
    select to_jsonb(c.*) into before_row from public.clients c where id = entity_id and user_id = auth.uid() for update;
    if before_row is null then raise exception 'client_not_found'; end if;
    if (before_row ->> 'version')::integer <> expected_version then raise exception 'version_conflict'; end if;
    update public.clients set name = coalesce(payload ->> 'name', name), company = coalesce(payload ->> 'company', company), email = coalesce(payload ->> 'email', email), phone = coalesce(payload ->> 'phone', phone), status = coalesce((payload ->> 'status')::public.client_status, status), health = coalesce((payload ->> 'health')::public.project_health, health), next_action = coalesce(payload ->> 'next_action', next_action), next_action_at = case when payload ? 'next_action_at' then (payload ->> 'next_action_at')::timestamptz else next_action_at end where id = entity_id returning to_jsonb(clients.*) into saved_row;
  elsif requested_action = 'add_client_contact' then
    if not exists (select 1 from public.clients where id = (payload ->> 'client_id')::uuid and user_id = auth.uid()) then raise exception 'client_not_found'; end if;
    insert into public.client_contacts (user_id, client_id, name, role, email, phone, is_primary) values (auth.uid(), (payload ->> 'client_id')::uuid, trim(payload ->> 'name'), coalesce(payload ->> 'role',''), coalesce(payload ->> 'email',''), coalesce(payload ->> 'phone',''), coalesce((payload ->> 'is_primary')::boolean,false)) returning to_jsonb(client_contacts.*) into saved_row;
  elsif requested_action = 'add_client_note' then
    if not exists (select 1 from public.clients where id = (payload ->> 'client_id')::uuid and user_id = auth.uid()) then raise exception 'client_not_found'; end if;
    insert into public.client_notes (user_id, client_id, note) values (auth.uid(), (payload ->> 'client_id')::uuid, trim(payload ->> 'note')) returning to_jsonb(client_notes.*) into saved_row;
  elsif requested_action = 'create_deliverable' then
    insert into public.deliverables (user_id, client_id, project_id, title, description, status, progress, due_at) values (auth.uid(), (payload ->> 'client_id')::uuid, (payload ->> 'project_id')::uuid, trim(payload ->> 'title'), coalesce(payload ->> 'description',''), coalesce((payload ->> 'status')::public.deliverable_status,'planned'), coalesce((payload ->> 'progress')::smallint,0), (payload ->> 'due_at')::timestamptz) returning to_jsonb(deliverables.*) into saved_row;
  elsif requested_action = 'create_proposal' then
    insert into public.proposals (user_id, client_id, project_id, title, status, amount, currency, valid_until, notes) values (auth.uid(), (payload ->> 'client_id')::uuid, (payload ->> 'project_id')::uuid, trim(payload ->> 'title'), coalesce((payload ->> 'status')::public.document_status,'draft'), (payload ->> 'amount')::numeric, coalesce(payload ->> 'currency','INR'), (payload ->> 'valid_until')::date, coalesce(payload ->> 'notes','')) returning to_jsonb(proposals.*) into saved_row;
  elsif requested_action = 'create_invoice' then
    insert into public.invoices (user_id, client_id, project_id, invoice_number, status, issued_on, due_on, subtotal, tax, currency, notes) values (auth.uid(), (payload ->> 'client_id')::uuid, (payload ->> 'project_id')::uuid, trim(payload ->> 'invoice_number'), coalesce((payload ->> 'status')::public.invoice_status,'draft'), coalesce((payload ->> 'issued_on')::date,current_date), (payload ->> 'due_on')::date, (payload ->> 'subtotal')::numeric, coalesce((payload ->> 'tax')::numeric,0), coalesce(payload ->> 'currency','INR'), coalesce(payload ->> 'notes','')) returning to_jsonb(invoices.*) into saved_row;
  elsif requested_action = 'record_payment' then
    select * into selected_invoice from public.invoices where id = (payload ->> 'invoice_id')::uuid and user_id = auth.uid() for update;
    if selected_invoice.id is null then raise exception 'invoice_not_found'; end if;
    insert into public.payments (user_id, invoice_id, amount, paid_at, method, reference, note) values (auth.uid(), selected_invoice.id, (payload ->> 'amount')::numeric, coalesce((payload ->> 'paid_at')::timestamptz,now()), coalesce(payload ->> 'method','bank_transfer'), coalesce(payload ->> 'reference',''), coalesce(payload ->> 'note','')) returning to_jsonb(payments.*) into saved_row;
    select coalesce(sum(amount),0) into paid_total from public.payments where invoice_id = selected_invoice.id and user_id = auth.uid();
    update public.invoices set status = case when paid_total >= total then 'paid'::public.invoice_status else 'partial'::public.invoice_status end where id = selected_invoice.id;
    insert into public.finance_transactions (user_id, entry_type, entry_date, amount, category, description, client_id, project_id, invoice_id) values (auth.uid(), 'income', coalesce((payload ->> 'paid_at')::date,current_date), (payload ->> 'amount')::numeric, 'Client payment', 'Payment for ' || selected_invoice.invoice_number, selected_invoice.client_id, selected_invoice.project_id, selected_invoice.id);
  elsif requested_action = 'add_transaction' then
    insert into public.finance_transactions (user_id, entry_type, entry_date, amount, currency, category, description, client_id, project_id, invoice_id, recurring) values (auth.uid(), (payload ->> 'entry_type')::public.finance_entry_type, coalesce((payload ->> 'entry_date')::date,current_date), (payload ->> 'amount')::numeric, coalesce(payload ->> 'currency','INR'), trim(payload ->> 'category'), coalesce(payload ->> 'description',''), (payload ->> 'client_id')::uuid, (payload ->> 'project_id')::uuid, (payload ->> 'invoice_id')::uuid, coalesce((payload ->> 'recurring')::boolean,false)) returning to_jsonb(finance_transactions.*) into saved_row;
  elsif requested_action = 'create_lead' then
    insert into public.leads (user_id, name, company, email, status, estimated_value, probability, next_action, next_action_at) values (auth.uid(), trim(payload ->> 'name'), coalesce(payload ->> 'company',''), coalesce(payload ->> 'email',''), coalesce((payload ->> 'status')::public.pipeline_status,'new'), coalesce((payload ->> 'estimated_value')::numeric,0), coalesce((payload ->> 'probability')::smallint,10), coalesce(payload ->> 'next_action',''), (payload ->> 'next_action_at')::timestamptz) returning to_jsonb(leads.*) into saved_row;
  elsif requested_action = 'create_business_goal' then
    insert into public.business_goals (user_id, title, target_value, current_value, unit, deadline) values (auth.uid(), trim(payload ->> 'title'), (payload ->> 'target_value')::numeric, coalesce((payload ->> 'current_value')::numeric,0), coalesce(payload ->> 'unit',''), (payload ->> 'deadline')::date) returning to_jsonb(business_goals.*) into saved_row;
  elsif requested_action = 'create_recurring_operation' then
    insert into public.recurring_operations (user_id, title, cadence, next_due) values (auth.uid(), trim(payload ->> 'title'), payload ->> 'cadence', (payload ->> 'next_due')::date) returning to_jsonb(recurring_operations.*) into saved_row;
  elsif requested_action = 'create_financial_goal' then
    insert into public.financial_goals (user_id, title, target_amount, current_amount, currency, deadline) values (auth.uid(), trim(payload ->> 'title'), (payload ->> 'target_amount')::numeric, coalesce((payload ->> 'current_amount')::numeric,0), coalesce(payload ->> 'currency','INR'), (payload ->> 'deadline')::date) returning to_jsonb(financial_goals.*) into saved_row;
  else
    raise exception 'unsupported_business_action';
  end if;
  insert into public.activity_log (user_id, event_type, entity_type, entity_id, summary, detail, actor_label, actor_type, source, before_state, after_state, reversible)
  values (auth.uid(), 'business_record_changed', split_part(requested_action,'_',2), coalesce((saved_row ->> 'id')::uuid, (payload ->> 'id')::uuid), initcap(replace(requested_action,'_',' ')), 'Saved from the authenticated Personal OS workspace', 'You', 'user', 'web', before_row, saved_row, before_row is not null);
  result := jsonb_build_object('record', saved_row, 'replayed', false);
  return public.private_save_action('business.' || requested_action, request_key, request_hash, result);
end;
$$;

revoke all on function public.initialize_business_workspace() from public;
revoke all on function public.product_business_action(text, jsonb, integer, text) from public;
grant execute on function public.initialize_business_workspace() to authenticated;
grant execute on function public.product_business_action(text, jsonb, integer, text) to authenticated;
