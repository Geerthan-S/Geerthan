-- Evaluate auth.uid() once per statement instead of once per row. The policy
-- names, commands, roles, permissiveness, and predicates are preserved.

do $$
declare
  policy_row record;
  role_list text;
  using_expression text;
  check_expression text;
  statement text;
begin
  for policy_row in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
    order by tablename, policyname
  loop
    select string_agg(quote_ident(role_name::text), ', ')
      into role_list
    from unnest(policy_row.roles) as role_name;

    using_expression := replace(policy_row.qual, 'auth.uid()', '(select auth.uid())');
    check_expression := replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())');

    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );

    statement := format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.permissive,
      policy_row.cmd,
      role_list
    );

    if using_expression is not null then
      statement := statement || format(' using (%s)', using_expression);
    end if;

    if check_expression is not null then
      statement := statement || format(' with check (%s)', check_expression);
    end if;

    execute statement;
  end loop;
end;
$$;
