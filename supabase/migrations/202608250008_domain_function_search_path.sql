-- Supabase installs pgcrypto in the extensions schema. Domain actions keep a
-- restrictive function search path while explicitly allowing digest/encode.
alter function public.domain_create_task(text, public.task_priority, uuid, timestamptz, integer, text[], text) set search_path = public, extensions;
alter function public.domain_update_task(uuid, integer, jsonb, text) set search_path = public, extensions;
alter function public.domain_complete_task(uuid, integer, text) set search_path = public, extensions;
alter function public.domain_reschedule_task(uuid, integer, timestamptz, timestamptz, text) set search_path = public, extensions;
alter function public.domain_start_work_session(uuid, integer, text) set search_path = public, extensions;
alter function public.domain_end_work_session(uuid, integer, text, text) set search_path = public, extensions;
alter function public.domain_log_habit(uuid, date, numeric, text, integer, text) set search_path = public, extensions;
alter function public.domain_create_time_block(text, public.calendar_block_kind, timestamptz, timestamptz, text, text) set search_path = public, extensions;
alter function public.domain_update_time_block(uuid, integer, jsonb, text) set search_path = public, extensions;
alter function public.domain_draft_day_plan(date, boolean, text) set search_path = public, extensions;
alter function public.domain_commit_change_set(uuid, text) set search_path = public, extensions;
alter function public.domain_discard_change_set(uuid, text) set search_path = public, extensions;
alter function public.domain_undo_change_set(uuid, text) set search_path = public, extensions;
alter function public.product_business_action(text, jsonb, integer, text) set search_path = public, extensions;
alter function public.product_learning_action(text, jsonb, integer, text) set search_path = public, extensions;
alter function public.product_system_action(text, jsonb, integer, text) set search_path = public, extensions;
