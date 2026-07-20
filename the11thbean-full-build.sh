#!/usr/bin/env bash
#
# Recreates the complete CRM from a clean checkout.
#
#   ./the11thbean-full-build.sh              # local stack, full verification
#   ./the11thbean-full-build.sh --skip-e2e   # local stack, no browser tests
#
# What it does:
#   1. Checks the tools it needs are present
#   2. Installs dependencies
#   3. Starts a local Supabase stack and applies every migration
#   4. Writes .env.local pointing at that stack
#   5. Seeds the synthetic staff user
#   6. Runs lint, typecheck, unit tests and build
#   7. Runs the write-enabled end-to-end suite against the local stack
#
# It never touches production. The guard in tests/e2e/support/environment.ts
# refuses to run write-enabled tests against the production project, and this
# script only ever configures loopback credentials.

set -euo pipefail

SKIP_E2E=false
[ "${1:-}" = "--skip-e2e" ] && SKIP_E2E=true

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

STAFF_EMAIL="${CRM_TEST_USER_EMAIL:-bean@the11thbean.com}"

log()  { printf '\033[1;32m[build]\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[build]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[build]\033[0m %s\n' "$1" >&2; exit 1; }

log "Checking prerequisites ..."
for tool in node npm docker supabase jq; do
  command -v "$tool" >/dev/null || fail "$tool is required but not installed."
done

docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker, then retry."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node 20 or newer is required (found $(node -v))."

log "Installing dependencies ..."
npm ci >/dev/null 2>&1 || npm install >/dev/null

log "Starting the local Supabase stack ..."
if ! supabase status -o json >/dev/null 2>&1; then
  supabase start </dev/null >/dev/null
fi

STATUS_JSON="$(supabase status -o json)"
SUPABASE_URL="$(jq -r '.API_URL' <<<"$STATUS_JSON")"
ANON_KEY="$(jq -r '.ANON_KEY' <<<"$STATUS_JSON")"
SERVICE_KEY="$(jq -r '.SERVICE_ROLE_KEY' <<<"$STATUS_JSON")"

for value in "$SUPABASE_URL" "$ANON_KEY" "$SERVICE_KEY"; do
  [ -n "$value" ] && [ "$value" != "null" ] \
    || fail "Could not read local Supabase credentials."
done

case "$SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Expected a loopback Supabase URL, got $SUPABASE_URL" ;;
esac

log "Applying migrations ..."
supabase migration up --local </dev/null >/dev/null

log "Writing .env.local ..."
cat > .env.local <<ENVFILE
# Written by the11thbean-full-build.sh. Points at the local Supabase stack.
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
ENVFILE

log "Seeding the staff user $STAFF_EMAIL ..."
USER_ID="$(curl -fsS -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg email "$STAFF_EMAIL" \
        '{email: $email, email_confirm: true, user_metadata: {display_name: "Local Staff"}}')" \
  2>/dev/null | jq -r '.id // empty' || true)"

if [ -z "$USER_ID" ]; then
  USER_ID="$(curl -fsS "${SUPABASE_URL}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
    | jq -r --arg email "$STAFF_EMAIL" \
        '.users[] | select(.email == $email) | .id' | head -n1)"
fi

[ -n "$USER_ID" ] || fail "Could not create or find the staff user."

ROLE_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${SUPABASE_URL}/rest/v1/app_roles?on_conflict=user_id" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "$(jq -nc --arg id "$USER_ID" \
        '{user_id: $id, role: "admin", is_active: true}')")"

case "$ROLE_STATUS" in
  2*) ;;
  *) fail "Could not grant the admin role (HTTP ${ROLE_STATUS})." ;;
esac

log "Running lint ..."
npm run lint

log "Running typecheck ..."
npm run typecheck

log "Running unit tests ..."
npm run test:unit

log "Building ..."
npm run build

if [ "$SKIP_E2E" = true ]; then
  warn "Skipping end-to-end tests at your request."
else
  log "Installing browsers for the end-to-end suite ..."
  npx playwright install chromium >/dev/null 2>&1 || \
    warn "Could not install browsers; the end-to-end suite may fail."

  log "Running the write-enabled end-to-end suite ..."
  bash ./scripts/test-local-e2e.sh
fi

cat <<SUMMARY

$(log "The 11th Bean CRM is built and verified.")

  Application     npm run dev        http://localhost:3000
  Supabase Studio                    http://127.0.0.1:54323
  Sign in as                         ${STAFF_EMAIL}

  Sign-in is by magic link. With the local stack, the email is captured by
  Mailpit at http://127.0.0.1:54324 rather than being delivered.

  Nothing here touches production. See docs/workflow.md before deploying.

SUMMARY
