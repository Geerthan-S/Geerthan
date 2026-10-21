-- Harden trigger and event-trigger functions that are not intended to be
-- called directly by browser-facing database roles.

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable() is created by the hosted project, not by these migrations,
-- so fresh databases (local development, CI) may not have it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
