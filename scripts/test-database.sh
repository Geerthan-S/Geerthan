#!/usr/bin/env bash
# Applies every migration to an empty Postgres database (Supabase image) and
# runs the SQL behaviour tests. Usage:
#   DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres scripts/test-database.sh
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable Supabase Postgres database}"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
cd "$(dirname "$0")/.."

for migration in supabase/migrations/*.sql; do
  echo "migrate  $(basename "$migration")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$migration" >/dev/null
done

for test in supabase/tests/*.test.sql; do
  echo "test     $(basename "$test")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -t -f "$test" | grep -v '^\s*(' | sed '/^\s*$/d'
done
