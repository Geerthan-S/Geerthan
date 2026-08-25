-- Harden trigger and event-trigger functions that are not intended to be
-- called directly by browser-facing database roles.

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
