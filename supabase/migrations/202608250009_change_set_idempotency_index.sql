alter table public.change_sets drop constraint if exists change_sets_user_id_idempotency_key_key;
create unique index change_sets_user_id_idempotency_key_unique
  on public.change_sets(user_id,idempotency_key)
  where idempotency_key is not null;
