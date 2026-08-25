create type public.learning_status as enum ('planned', 'active', 'paused', 'completed');
create type public.topic_status as enum ('not_started', 'learning', 'practicing', 'mastered');
create type public.problem_difficulty as enum ('easy', 'medium', 'hard');
create type public.assignment_status as enum ('not_started', 'in_progress', 'submitted', 'graded');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

create table public.skills (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 140), category text not null default 'General',
  status public.learning_status not null default 'active', mastery smallint not null default 0 check (mastery between 0 and 100),
  target text not null default '', deadline date, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,name)
);
create table public.learning_roadmaps (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade, title text not null, description text not null default '',
  status public.learning_status not null default 'active', progress smallint not null default 0 check (progress between 0 and 100),
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.learning_topics (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade, roadmap_id uuid references public.learning_roadmaps(id) on delete set null,
  title text not null, status public.topic_status not null default 'not_started', confidence numeric(3,1) not null default 1 check (confidence between 0 and 5),
  mastery smallint not null default 0 check (mastery between 0 and 100), last_revised_at timestamptz, next_revision_on date,
  weak boolean not null default false, sort_order integer not null default 0, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,skill_id,title)
);
create table public.learning_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade, topic_id uuid references public.learning_topics(id) on delete set null,
  started_at timestamptz not null default now(), ended_at timestamptz, duration_minutes integer not null check (duration_minutes between 1 and 1440),
  notes text not null default '', evidence_url text not null default '', created_at timestamptz not null default now()
);
create table public.learning_resources (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade, topic_id uuid references public.learning_topics(id) on delete set null,
  title text not null, resource_type text not null default 'article', url text not null default '', status text not null default 'saved' check(status in('saved','in_progress','completed')),
  created_at timestamptz not null default now()
);
create table public.courses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null, title text not null, provider text not null default '',
  status public.learning_status not null default 'active', progress smallint not null default 0 check(progress between 0 and 100),
  certificate_url text not null default '', started_on date, completed_on date, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.learning_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null, title text not null, target_value numeric(12,2) not null default 0,
  current_value numeric(12,2) not null default 0, unit text not null default '', deadline date, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.dsa_problems (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'leetcode', external_id text not null, title text not null, difficulty public.problem_difficulty not null,
  solved_at timestamptz not null default now(), confidence numeric(3,1) not null default 3 check(confidence between 0 and 5),
  notes text not null default '', url text not null default '', created_at timestamptz not null default now(), unique(user_id,platform,external_id)
);
create table public.dsa_problem_topics (
  user_id uuid not null references public.profiles(id) on delete cascade, problem_id uuid not null references public.dsa_problems(id) on delete cascade,
  topic_id uuid not null references public.learning_topics(id) on delete cascade, primary key(problem_id,topic_id)
);

create table public.semesters (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, starts_on date not null, ends_on date not null, active boolean not null default false,
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,name)
);
create table public.faculty (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, email text not null default '', department text not null default '', office text not null default '', created_at timestamptz not null default now()
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade, faculty_id uuid references public.faculty(id) on delete set null,
  code text not null, name text not null, credits numeric(3,1) not null default 3, attendance_target numeric(5,2) not null default 75,
  syllabus_progress smallint not null default 0 check(syllabus_progress between 0 and 100), color text not null default 'blue', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,semester_id,code)
);
create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade, weekday smallint not null check(weekday between 1 and 7),
  starts_at time not null, ends_at time not null, location text not null default '', entry_type text not null default 'lecture',
  created_at timestamptz not null default now(), check(ends_at > starts_at)
);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade, class_date date not null,
  status public.attendance_status not null, note text not null default '', created_at timestamptz not null default now(), unique(subject_id,class_date)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade, title text not null, description text not null default '',
  status public.assignment_status not null default 'not_started', due_at timestamptz, submitted_at timestamptz,
  grade text not null default '', source text not null default 'manual', version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.exams (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade, title text not null, exam_type text not null default 'internal',
  starts_at timestamptz not null, duration_minutes integer not null default 90, weight numeric(5,2) not null default 0,
  syllabus_progress smallint not null default 0 check(syllabus_progress between 0 and 100), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.academic_topics (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade, title text not null,
  status public.topic_status not null default 'not_started', progress smallint not null default 0 check(progress between 0 and 100),
  priority text not null default 'medium' check(priority in('low','medium','high','critical')), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(subject_id,title)
);

create index learning_topics_user_revision_idx on public.learning_topics(user_id,next_revision_on,weak);
create index learning_sessions_user_started_idx on public.learning_sessions(user_id,started_at desc);
create index dsa_problems_user_solved_idx on public.dsa_problems(user_id,solved_at desc,difficulty);
create index assignments_user_due_idx on public.assignments(user_id,status,due_at);
create index exams_user_starts_idx on public.exams(user_id,starts_at);
create index attendance_user_subject_idx on public.attendance_records(user_id,subject_id,class_date desc);

do $$ declare table_name text; begin
  foreach table_name in array array['skills','learning_roadmaps','learning_topics','courses','learning_goals','semesters','subjects','assignments','exams','academic_topics'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',table_name,table_name);
  end loop;
  foreach table_name in array array['skills','learning_roadmaps','learning_topics','learning_sessions','learning_resources','courses','learning_goals','dsa_problems','dsa_problem_topics','semesters','faculty','subjects','timetable_entries','attendance_records','assignments','exams','academic_topics'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy %I_select_own on public.%I for select using(user_id=auth.uid())',table_name,table_name);
    execute format('create policy %I_insert_own on public.%I for insert with check(user_id=auth.uid())',table_name,table_name);
    execute format('create policy %I_update_own on public.%I for update using(user_id=auth.uid()) with check(user_id=auth.uid())',table_name,table_name);
    execute format('create policy %I_delete_own on public.%I for delete using(user_id=auth.uid())',table_name,table_name);
  end loop;
end $$;

create or replace function public.enforce_owned_learning_references()
returns trigger language plpgsql security invoker set search_path=public as $$
declare row_data jsonb:=to_jsonb(new); reference_id uuid;
begin
  if row_data ? 'skill_id' and nullif(row_data->>'skill_id','') is not null then reference_id:=(row_data->>'skill_id')::uuid; if not exists(select 1 from public.skills where id=reference_id and user_id=new.user_id) then raise exception 'skill_not_found'; end if; end if;
  if row_data ? 'roadmap_id' and nullif(row_data->>'roadmap_id','') is not null then reference_id:=(row_data->>'roadmap_id')::uuid; if not exists(select 1 from public.learning_roadmaps where id=reference_id and user_id=new.user_id) then raise exception 'roadmap_not_found'; end if; end if;
  if row_data ? 'topic_id' and nullif(row_data->>'topic_id','') is not null then reference_id:=(row_data->>'topic_id')::uuid; if not exists(select 1 from public.learning_topics where id=reference_id and user_id=new.user_id) then raise exception 'topic_not_found'; end if; end if;
  if row_data ? 'semester_id' and nullif(row_data->>'semester_id','') is not null then reference_id:=(row_data->>'semester_id')::uuid; if not exists(select 1 from public.semesters where id=reference_id and user_id=new.user_id) then raise exception 'semester_not_found'; end if; end if;
  if row_data ? 'faculty_id' and nullif(row_data->>'faculty_id','') is not null then reference_id:=(row_data->>'faculty_id')::uuid; if not exists(select 1 from public.faculty where id=reference_id and user_id=new.user_id) then raise exception 'faculty_not_found'; end if; end if;
  if row_data ? 'subject_id' and nullif(row_data->>'subject_id','') is not null then reference_id:=(row_data->>'subject_id')::uuid; if not exists(select 1 from public.subjects where id=reference_id and user_id=new.user_id) then raise exception 'subject_not_found'; end if; end if;
  if row_data ? 'problem_id' and nullif(row_data->>'problem_id','') is not null then reference_id:=(row_data->>'problem_id')::uuid; if not exists(select 1 from public.dsa_problems where id=reference_id and user_id=new.user_id) then raise exception 'problem_not_found'; end if; end if;
  return new;
end $$;

do $$ declare table_name text; begin
  foreach table_name in array array['learning_roadmaps','learning_topics','learning_sessions','learning_resources','courses','learning_goals','dsa_problem_topics','subjects','timetable_entries','attendance_records','assignments','exams','academic_topics'] loop
    execute format('create trigger %I_owned_references before insert or update on public.%I for each row execute function public.enforce_owned_learning_references()',table_name,table_name);
  end loop;
end $$;

create or replace view public.subject_attendance_summary with(security_invoker=true) as
select s.user_id,s.id as subject_id,s.code,s.name,s.attendance_target,
  count(a.id) as total_classes,count(a.id) filter(where a.status in('present','late')) as attended_classes,
  case when count(a.id)=0 then 100 else round(count(a.id) filter(where a.status in('present','late'))::numeric/count(a.id)*100,1) end as attendance_percentage
from public.subjects s left join public.attendance_records a on a.subject_id=s.id and a.user_id=s.user_id group by s.user_id,s.id,s.code,s.name,s.attendance_target;

create or replace view public.dsa_topic_summary with(security_invoker=true) as
select t.user_id,t.id as topic_id,t.title,t.mastery,t.confidence,t.weak,
  count(distinct p.id) as solved,count(distinct p.id) filter(where p.difficulty='easy') as easy,
  count(distinct p.id) filter(where p.difficulty='medium') as medium,count(distinct p.id) filter(where p.difficulty='hard') as hard
from public.learning_topics t left join public.dsa_problem_topics m on m.topic_id=t.id and m.user_id=t.user_id left join public.dsa_problems p on p.id=m.problem_id and p.user_id=t.user_id
group by t.user_id,t.id,t.title,t.mastery,t.confidence,t.weak;

create or replace function public.initialize_learning_academics_workspace()
returns void language plpgsql security invoker set search_path=public as $$
declare dsa uuid; webskill uuid; roadmap uuid; arrays uuid; graphs uuid; dp uuid; semester uuid; compiler_faculty uuid; daa_faculty uuid; compiler uuid; daa uuid; problem uuid; day_index integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.skills where user_id=auth.uid()) then
    insert into public.skills(user_id,name,category,mastery,target,deadline) values(auth.uid(),'Data Structures & Algorithms','Engineering',46,'Interview-ready across core patterns',current_date+150) returning id into dsa;
    insert into public.skills(user_id,name,category,mastery,target,deadline) values(auth.uid(),'Full-stack product engineering','Engineering',68,'Ship production-grade TypeScript systems',current_date+240) returning id into webskill;
    insert into public.learning_roadmaps(user_id,skill_id,title,description,progress) values(auth.uid(),dsa,'Interview DSA roadmap','Patterns, practice, revision and mock interviews.',46) returning id into roadmap;
    insert into public.learning_topics(user_id,skill_id,roadmap_id,title,status,confidence,mastery,next_revision_on,weak,sort_order) values
      (auth.uid(),dsa,roadmap,'Arrays & hashing','mastered',4.4,84,current_date+10,false,1) returning id into arrays;
    insert into public.learning_topics(user_id,skill_id,roadmap_id,title,status,confidence,mastery,next_revision_on,weak,sort_order) values
      (auth.uid(),dsa,roadmap,'Graphs','practicing',3.1,52,current_date+2,true,2) returning id into graphs;
    insert into public.learning_topics(user_id,skill_id,roadmap_id,title,status,confidence,mastery,next_revision_on,weak,sort_order) values
      (auth.uid(),dsa,roadmap,'Dynamic programming','learning',2.3,31,current_date+1,true,3) returning id into dp;
    insert into public.learning_topics(user_id,skill_id,title,status,confidence,mastery,next_revision_on,sort_order) values(auth.uid(),webskill,'Next.js architecture','practicing',3.8,70,current_date+7,1);
    insert into public.learning_sessions(user_id,skill_id,topic_id,started_at,ended_at,duration_minutes,notes,evidence_url) values
      (auth.uid(),dsa,graphs,now()-interval '2 days 70 minutes',now()-interval '2 days',70,'BFS/DFS traversal and island patterns',''),
      (auth.uid(),dsa,dp,now()-interval '1 day 50 minutes',now()-interval '1 day',50,'Memoization and state transition drills','');
    insert into public.learning_resources(user_id,skill_id,topic_id,title,resource_type,url,status) values
      (auth.uid(),dsa,graphs,'Graph patterns revision sheet','notes','', 'in_progress'),
      (auth.uid(),dsa,dp,'Dynamic programming pattern guide','article','', 'saved');
    insert into public.courses(user_id,skill_id,title,provider,status,progress,started_on) values(auth.uid(),webskill,'Advanced TypeScript Systems','Frontend Masters','active',62,current_date-35);
    insert into public.learning_goals(user_id,skill_id,title,target_value,current_value,unit,deadline) values(auth.uid(),dsa,'Solve 300 interview problems',300,187,'problems',current_date+150);
    insert into public.dsa_problems(user_id,platform,external_id,title,difficulty,solved_at,confidence,notes,url) values(auth.uid(),'leetcode','two-sum','Two Sum','easy',now()-interval '5 days',5,'Hash map complement pattern','https://leetcode.com/problems/two-sum') returning id into problem;
    insert into public.dsa_problem_topics(user_id,problem_id,topic_id) values(auth.uid(),problem,arrays);
    insert into public.dsa_problems(user_id,platform,external_id,title,difficulty,solved_at,confidence,notes,url) values(auth.uid(),'leetcode','number-of-islands','Number of Islands','medium',now()-interval '2 days',3.5,'Revisit boundary handling','https://leetcode.com/problems/number-of-islands') returning id into problem;
    insert into public.dsa_problem_topics(user_id,problem_id,topic_id) values(auth.uid(),problem,graphs);
    insert into public.dsa_problems(user_id,platform,external_id,title,difficulty,solved_at,confidence,notes,url) values(auth.uid(),'leetcode','coin-change','Coin Change','medium',now()-interval '1 day',2.5,'State definition needs revision','https://leetcode.com/problems/coin-change') returning id into problem;
    insert into public.dsa_problem_topics(user_id,problem_id,topic_id) values(auth.uid(),problem,dp);
  end if;
  if not exists(select 1 from public.semesters where user_id=auth.uid()) then
    insert into public.semesters(user_id,name,starts_on,ends_on,active) values(auth.uid(),'Semester 5',current_date-45,current_date+75,true) returning id into semester;
    insert into public.faculty(user_id,name,email,department,office) values(auth.uid(),'Dr. Priya N','priya@university.example','CSE','SJT 411') returning id into compiler_faculty;
    insert into public.faculty(user_id,name,email,department,office) values(auth.uid(),'Prof. Raman V','raman@university.example','CSE','TT 204') returning id into daa_faculty;
    insert into public.subjects(user_id,semester_id,faculty_id,code,name,credits,attendance_target,syllabus_progress,color) values(auth.uid(),semester,compiler_faculty,'CSE301','Compiler Design',4,75,48,'violet') returning id into compiler;
    insert into public.subjects(user_id,semester_id,faculty_id,code,name,credits,attendance_target,syllabus_progress,color) values(auth.uid(),semester,daa_faculty,'CSE302','Design and Analysis of Algorithms',4,75,61,'blue') returning id into daa;
    insert into public.timetable_entries(user_id,subject_id,weekday,starts_at,ends_at,location) values
      (auth.uid(),compiler,1,'09:00','09:50','SJT 311'),(auth.uid(),compiler,4,'11:00','11:50','SJT 311'),
      (auth.uid(),daa,2,'10:00','10:50','TT 204'),(auth.uid(),daa,5,'14:00','14:50','TT 204');
    for day_index in 1..12 loop
      insert into public.attendance_records(user_id,subject_id,class_date,status) values(auth.uid(),compiler,current_date-day_index*2,case when day_index in(3,8,11) then 'absent'::public.attendance_status else 'present'::public.attendance_status end);
      insert into public.attendance_records(user_id,subject_id,class_date,status) values(auth.uid(),daa,current_date-day_index*2-1,case when day_index in(5,10) then 'absent'::public.attendance_status else 'present'::public.attendance_status end);
    end loop;
    insert into public.assignments(user_id,subject_id,title,description,status,due_at) values
      (auth.uid(),compiler,'Build LL(1) parsing table','Submit parser table and notes','in_progress',now()+interval '3 days'),
      (auth.uid(),daa,'Graph algorithm analysis','Complexity and correctness write-up','not_started',now()+interval '6 days');
    insert into public.exams(user_id,subject_id,title,exam_type,starts_at,duration_minutes,weight,syllabus_progress) values
      (auth.uid(),compiler,'CAT 2','internal',now()+interval '12 days',90,30,42),(auth.uid(),daa,'CAT 2','internal',now()+interval '14 days',90,30,55);
    insert into public.academic_topics(user_id,subject_id,title,status,progress,priority) values
      (auth.uid(),compiler,'LR parsing','learning',35,'critical'),(auth.uid(),compiler,'Code optimization','not_started',0,'high'),
      (auth.uid(),daa,'Greedy correctness','practicing',68,'medium'),(auth.uid(),daa,'Dynamic programming','learning',44,'high');
  end if;
end $$;

create or replace function public.product_learning_action(requested_action text,payload jsonb,expected_version integer,request_key text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare request_hash text; cached jsonb; saved_row jsonb; before_row jsonb; result jsonb; entity_id uuid; topic_record public.learning_topics; problem_id uuid;
begin
  request_hash:=encode(digest(jsonb_build_object('action',requested_action,'payload',payload,'version',expected_version)::text,'sha256'),'hex');
  cached:=public.private_cached_action('learning.'||requested_action,request_key,request_hash); if cached is not null then return cached; end if;
  if requested_action='create_skill' then
    insert into public.skills(user_id,name,category,status,mastery,target,deadline) values(auth.uid(),trim(payload->>'name'),coalesce(payload->>'category','General'),coalesce((payload->>'status')::public.learning_status,'active'),coalesce((payload->>'mastery')::smallint,0),coalesce(payload->>'target',''),(payload->>'deadline')::date) returning to_jsonb(skills.*) into saved_row;
  elsif requested_action='log_learning_session' then
    insert into public.learning_sessions(user_id,skill_id,topic_id,started_at,ended_at,duration_minutes,notes,evidence_url) values(auth.uid(),(payload->>'skill_id')::uuid,(payload->>'topic_id')::uuid,coalesce((payload->>'started_at')::timestamptz,now()),(payload->>'ended_at')::timestamptz,(payload->>'duration_minutes')::integer,coalesce(payload->>'notes',''),coalesce(payload->>'evidence_url','')) returning to_jsonb(learning_sessions.*) into saved_row;
  elsif requested_action='update_learning_topic' then
    entity_id:=(payload->>'id')::uuid; select to_jsonb(t.*) into before_row from public.learning_topics t where id=entity_id and user_id=auth.uid() for update;
    if before_row is null then raise exception 'topic_not_found'; end if; if (before_row->>'version')::integer<>expected_version then raise exception 'version_conflict'; end if;
    update public.learning_topics set status=coalesce((payload->>'status')::public.topic_status,status),confidence=coalesce((payload->>'confidence')::numeric,confidence),mastery=coalesce((payload->>'mastery')::smallint,mastery),last_revised_at=case when payload?'last_revised_at' then (payload->>'last_revised_at')::timestamptz else last_revised_at end,next_revision_on=case when payload?'next_revision_on' then (payload->>'next_revision_on')::date else next_revision_on end,weak=coalesce((payload->>'weak')::boolean,weak) where id=entity_id returning to_jsonb(learning_topics.*) into saved_row;
  elsif requested_action='record_dsa_problem' then
    insert into public.dsa_problems(user_id,platform,external_id,title,difficulty,solved_at,confidence,notes,url) values(auth.uid(),coalesce(payload->>'platform','leetcode'),payload->>'external_id',payload->>'title',(payload->>'difficulty')::public.problem_difficulty,coalesce((payload->>'solved_at')::timestamptz,now()),coalesce((payload->>'confidence')::numeric,3),coalesce(payload->>'notes',''),coalesce(payload->>'url','')) returning id,to_jsonb(dsa_problems.*) into problem_id,saved_row;
    for topic_record in select * from public.learning_topics where user_id=auth.uid() and id in(select (jsonb_array_elements_text(coalesce(payload->'topic_ids','[]'::jsonb)))::uuid) loop insert into public.dsa_problem_topics(user_id,problem_id,topic_id) values(auth.uid(),problem_id,topic_record.id); end loop;
  elsif requested_action='create_course' then
    insert into public.courses(user_id,skill_id,title,provider,status,progress,certificate_url,started_on) values(auth.uid(),(payload->>'skill_id')::uuid,payload->>'title',coalesce(payload->>'provider',''),coalesce((payload->>'status')::public.learning_status,'active'),coalesce((payload->>'progress')::smallint,0),coalesce(payload->>'certificate_url',''),(payload->>'started_on')::date) returning to_jsonb(courses.*) into saved_row;
  elsif requested_action='create_learning_goal' then
    insert into public.learning_goals(user_id,skill_id,title,target_value,current_value,unit,deadline) values(auth.uid(),(payload->>'skill_id')::uuid,payload->>'title',(payload->>'target_value')::numeric,coalesce((payload->>'current_value')::numeric,0),coalesce(payload->>'unit',''),(payload->>'deadline')::date) returning to_jsonb(learning_goals.*) into saved_row;
  elsif requested_action='create_subject' then
    insert into public.subjects(user_id,semester_id,faculty_id,code,name,credits,attendance_target,syllabus_progress,color) values(auth.uid(),(payload->>'semester_id')::uuid,(payload->>'faculty_id')::uuid,payload->>'code',payload->>'name',coalesce((payload->>'credits')::numeric,3),coalesce((payload->>'attendance_target')::numeric,75),coalesce((payload->>'syllabus_progress')::smallint,0),coalesce(payload->>'color','blue')) returning to_jsonb(subjects.*) into saved_row;
  elsif requested_action='log_attendance' then
    insert into public.attendance_records(user_id,subject_id,class_date,status,note) values(auth.uid(),(payload->>'subject_id')::uuid,(payload->>'class_date')::date,(payload->>'status')::public.attendance_status,coalesce(payload->>'note','')) on conflict(subject_id,class_date) do update set status=excluded.status,note=excluded.note returning to_jsonb(attendance_records.*) into saved_row;
  elsif requested_action='create_assignment' then
    insert into public.assignments(user_id,subject_id,title,description,status,due_at,source) values(auth.uid(),(payload->>'subject_id')::uuid,payload->>'title',coalesce(payload->>'description',''),coalesce((payload->>'status')::public.assignment_status,'not_started'),(payload->>'due_at')::timestamptz,'manual') returning to_jsonb(assignments.*) into saved_row;
  elsif requested_action='create_exam' then
    insert into public.exams(user_id,subject_id,title,exam_type,starts_at,duration_minutes,weight,syllabus_progress) values(auth.uid(),(payload->>'subject_id')::uuid,payload->>'title',coalesce(payload->>'exam_type','internal'),(payload->>'starts_at')::timestamptz,coalesce((payload->>'duration_minutes')::integer,90),coalesce((payload->>'weight')::numeric,0),coalesce((payload->>'syllabus_progress')::smallint,0)) returning to_jsonb(exams.*) into saved_row;
  elsif requested_action='update_academic_topic' then
    entity_id:=(payload->>'id')::uuid; select to_jsonb(t.*) into before_row from public.academic_topics t where id=entity_id and user_id=auth.uid() for update;
    if before_row is null then raise exception 'academic_topic_not_found'; end if; if (before_row->>'version')::integer<>expected_version then raise exception 'version_conflict'; end if;
    update public.academic_topics set status=coalesce((payload->>'status')::public.topic_status,status),progress=coalesce((payload->>'progress')::smallint,progress),priority=coalesce(payload->>'priority',priority) where id=entity_id returning to_jsonb(academic_topics.*) into saved_row;
  else raise exception 'unsupported_learning_action'; end if;
  insert into public.activity_log(user_id,event_type,entity_type,entity_id,summary,detail,actor_label,actor_type,source,before_state,after_state,reversible) values(auth.uid(),'learning_record_changed',split_part(requested_action,'_',2),coalesce((saved_row->>'id')::uuid,(payload->>'id')::uuid),initcap(replace(requested_action,'_',' ')),'Saved from the authenticated Personal OS workspace','You','user','web',before_row,saved_row,before_row is not null);
  result:=jsonb_build_object('record',saved_row,'replayed',false); return public.private_save_action('learning.'||requested_action,request_key,request_hash,result);
end $$;

revoke all on function public.initialize_learning_academics_workspace() from public;
revoke all on function public.product_learning_action(text,jsonb,integer,text) from public;
grant execute on function public.initialize_learning_academics_workspace() to authenticated;
grant execute on function public.product_learning_action(text,jsonb,integer,text) to authenticated;
