#!/usr/bin/env bash
#
# Rebuilds the local database from the migration history and reseeds it.
#
#   npm run reset:local
#
# Destructive to LOCAL data only. The guard refuses to run if the configured
# Supabase URL is anything other than a loopback address.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/environment-guard.sh
source "$REPO_ROOT/scripts/lib/environment-guard.sh"

log() { printf '\033[1;32m[reset]\033[0m %s\n' "$1"; }

command -v supabase >/dev/null || { echo "supabase CLI is required" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 1; }

if ! supabase status -o json >/dev/null 2>&1; then
  log "Starting the local stack ..."
  supabase start </dev/null >/dev/null
fi

LOCAL_URL="$(supabase status -o json | jq -r '.API_URL')"

# This is the whole point of the guard: a reset is irreversible, so the target
# must be provably local before anything is dropped.
require_non_production "$LOCAL_URL" "a destructive local reset"

log "Rebuilding from migrations ..."
supabase db reset --local </dev/null

log "Seeding synthetic data ..."
CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$REPO_ROOT/supabase/seed-staging.sql" 2>&1 | grep -E "NOTICE|ERROR" || true

log "Local database rebuilt and seeded."
