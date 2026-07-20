#!/usr/bin/env bash
#
# Runs the write-enabled lifecycle suite against a local Next.js server backed
# by a local Supabase stack.
#
# This is the temporary stand-in for a hosted staging environment. Everything it
# touches is disposable; the production project is never involved.
#
# Usage:
#   scripts/test-local-e2e.sh [additional playwright args]

set -euo pipefail

STAFF_EMAIL="${CRM_TEST_USER_EMAIL:-bean@the11thbean.com}"

log() { printf '\033[1;32m[local-e2e]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[local-e2e]\033[0m %s\n' "$1" >&2; exit 1; }

command -v supabase >/dev/null || fail "Supabase CLI is not installed."
command -v jq >/dev/null || fail "jq is required."

docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker, then retry."

if ! supabase status -o json >/dev/null 2>&1; then
  log "Starting local Supabase ..."
  supabase start </dev/null >/dev/null
fi

STATUS_JSON="$(supabase status -o json)"
SUPABASE_URL="$(jq -r '.API_URL' <<<"$STATUS_JSON")"
ANON_KEY="$(jq -r '.ANON_KEY' <<<"$STATUS_JSON")"
SERVICE_KEY="$(jq -r '.SERVICE_ROLE_KEY' <<<"$STATUS_JSON")"

for value in "$SUPABASE_URL" "$ANON_KEY" "$SERVICE_KEY"; do
  [ -n "$value" ] && [ "$value" != "null" ] || fail "Could not read local Supabase credentials."
done

# Belt and braces: the suite's own guard checks this too, but a local runner
# should never be one typo away from the café's real records.
case "$SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Expected a loopback Supabase URL, got $SUPABASE_URL" ;;
esac

log "Applying any pending migrations ..."
supabase migration up --local </dev/null >/dev/null

log "Ensuring the synthetic staff user $STAFF_EMAIL exists ..."
USER_ID="$(curl -fsS -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg email "$STAFF_EMAIL" \
        '{email: $email, email_confirm: true, user_metadata: {display_name: "Local Test Staff"}}')" \
  2>/dev/null | jq -r '.id // empty' || true)"

# A rerun finds the account already present, which is not an error.
if [ -z "$USER_ID" ]; then
  USER_ID="$(curl -fsS "${SUPABASE_URL}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
    | jq -r --arg email "$STAFF_EMAIL" '.users[] | select(.email == $email) | .id' | head -n1)"
fi

[ -n "$USER_ID" ] || fail "Could not create or find the staff user."

ROLE_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${SUPABASE_URL}/rest/v1/app_roles?on_conflict=user_id" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "$(jq -nc --arg id "$USER_ID" '{user_id: $id, role: "admin", is_active: true}')")"

case "$ROLE_STATUS" in
  2*) ;;
  *) fail "Could not grant the admin role (HTTP ${ROLE_STATUS})." ;;
esac

log "Building the application against local Supabase ..."
NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  npm run build >/dev/null

log "Running the write-enabled lifecycle suite ..."
NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
LOCAL_SUPABASE_URL="$SUPABASE_URL" \
LOCAL_SUPABASE_ANON_KEY="$ANON_KEY" \
LOCAL_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
CRM_E2E_ALLOW_WRITES=true \
CRM_E2E_ENVIRONMENT=local \
CRM_TEST_USER_EMAIL="$STAFF_EMAIL" \
  npx playwright test --config=playwright.local.config.ts "$@"
