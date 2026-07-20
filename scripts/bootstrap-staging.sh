#!/usr/bin/env bash
#
# Bootstraps the hosted staging environment.
#
#   npm run bootstrap:staging
#
# Every step is safe to repeat. Nothing here can touch production: the target
# is checked against a denylist before a single command runs, and the guard
# fails closed on anything it does not positively recognise as staging.
#
# Credentials come from .env.staging (gitignored) or the environment. They are
# never printed, never committed, and never written to a report.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/environment-guard.sh
source "$REPO_ROOT/scripts/lib/environment-guard.sh"

log()  { printf '\033[1;32m[staging]\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[staging]\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[1;31m[staging]\033[0m %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

ENV_FILE="$REPO_ROOT/.env.staging"

step "Checking prerequisites"
for tool in supabase jq curl npm; do
  command -v "$tool" >/dev/null || fail "$tool is required but not installed."
done
log "All required tools present."

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
  log "Loaded credentials from .env.staging"
else
  warn ".env.staging not found; relying on the current environment."
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required (personal access token for the staging account)}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

step "Verifying the target is not production"
require_valid_ref "$STAGING_PROJECT_REF"
CRM_ENVIRONMENT=staging require_non_production "$STAGING_PROJECT_REF" "staging bootstrap"

# Confirm the reference actually belongs to the authenticated account, so a
# typo cannot silently point at somebody else's project.
PROJECT_NAME="$(supabase projects list -o json 2>/dev/null \
  | jq -r --arg ref "$STAGING_PROJECT_REF" \
      '.[] | select(.ref == $ref) | .name' | head -n1)"

[ -n "$PROJECT_NAME" ] \
  || fail "Project $STAGING_PROJECT_REF is not visible to this Supabase account."

log "Target project: $PROJECT_NAME ($STAGING_PROJECT_REF)"

# The denylist check above has passed, so the rest of this script may act on a
# hosted project. Declared once, deliberately, rather than per command.
export CRM_ENVIRONMENT=staging

STAGING_URL="https://${STAGING_PROJECT_REF}.supabase.co"

step "Linking the Supabase CLI to staging"
LINK_ARGS=(link --project-ref "$STAGING_PROJECT_REF")
[ -n "${STAGING_DB_PASSWORD:-}" ] && LINK_ARGS+=(--password "$STAGING_DB_PASSWORD")
supabase "${LINK_ARGS[@]}" </dev/null >/dev/null
log "Linked."

step "Applying migrations"
supabase db push --linked --include-all </dev/null
log "All migrations applied."

step "Reading staging API keys"
KEYS_JSON="$(supabase projects api-keys --project-ref "$STAGING_PROJECT_REF" -o json)"
ANON_KEY="$(jq -r '.[] | select(.name == "anon") | .api_key' <<<"$KEYS_JSON")"
SERVICE_KEY="$(jq -r '.[] | select(.name == "service_role") | .api_key' <<<"$KEYS_JSON")"

[ -n "$ANON_KEY" ] && [ "$ANON_KEY" != "null" ] || fail "Could not read the staging anon key."
[ -n "$SERVICE_KEY" ] && [ "$SERVICE_KEY" != "null" ] || fail "Could not read the staging service-role key."
log "Keys retrieved. (Values are never printed.)"

step "Storage buckets"
# The CRM uses no Storage buckets today. This step is declarative: when a
# bucket is introduced, add it here so a blank project reproduces it.
BUCKETS=()
if [ "${#BUCKETS[@]}" -eq 0 ]; then
  log "No buckets required by the current schema."
else
  for bucket in "${BUCKETS[@]}"; do
    curl -fsS -X POST "${STAGING_URL}/storage/v1/bucket" \
      -H "apikey: ${SERVICE_KEY}" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(jq -nc --arg id "$bucket" '{id: $id, name: $id, public: false}')" \
      >/dev/null 2>&1 || warn "Bucket $bucket may already exist."
    log "Bucket ready: $bucket"
  done
fi

step "Edge Functions"
if [ -d "$REPO_ROOT/supabase/functions" ] && \
   [ -n "$(ls -A "$REPO_ROOT/supabase/functions" 2>/dev/null)" ]; then
  for fn in "$REPO_ROOT"/supabase/functions/*/; do
    name="$(basename "$fn")"
    log "Deploying $name ..."
    supabase functions deploy "$name" --project-ref "$STAGING_PROJECT_REF" </dev/null
  done

  if [ -f "$REPO_ROOT/.env.staging.functions" ]; then
    log "Uploading Edge Function secrets ..."
    supabase secrets set --env-file "$REPO_ROOT/.env.staging.functions" \
      --project-ref "$STAGING_PROJECT_REF" </dev/null >/dev/null
  fi
else
  log "No Edge Functions in this repository."
fi

step "Seeding synthetic data"

# Seeding goes through the Management API rather than a direct database
# connection. It needs only the access token we already have, works from any
# network (the direct host is IPv6-only), and removes the database password
# from the required credential set entirely.
require_non_production "$STAGING_PROJECT_REF" "seeding"

SEED_PAYLOAD="$(python3 -c "import json,pathlib;print(json.dumps({'query':pathlib.Path('supabase/seed-staging.sql').read_text()}))")"

SEED_STATUS="$(curl -sS -o /tmp/crm-seed-response.json -w '%{http_code}' -m 180 \
  -X POST "https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "User-Agent: the11thbean-crm-bootstrap/1.0" \
  -d "$SEED_PAYLOAD")"

case "$SEED_STATUS" in
  2*) log "Synthetic seed applied." ;;
  *)  fail "Seeding failed (HTTP ${SEED_STATUS}): $(head -c 300 /tmp/crm-seed-response.json)" ;;
esac

rm -f /tmp/crm-seed-response.json

step "Generating database types"
supabase gen types typescript --project-id "$STAGING_PROJECT_REF" \
  > "$REPO_ROOT/src/lib/supabase/database.types.ts"
log "Types written to src/lib/supabase/database.types.ts"

step "Creating the staging staff user"
STAFF_EMAIL="${CRM_TEST_USER_EMAIL:-bean@the11thbean.com}"

USER_ID="$(curl -fsS -X POST "${STAGING_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg email "$STAFF_EMAIL" \
        '{email: $email, email_confirm: true, user_metadata: {display_name: "Staging Staff"}}')" \
  2>/dev/null | jq -r '.id // empty' || true)"

if [ -z "$USER_ID" ]; then
  USER_ID="$(curl -fsS "${STAGING_URL}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
    | jq -r --arg email "$STAFF_EMAIL" \
        '.users[] | select(.email == $email) | .id' | head -n1)"
fi

[ -n "$USER_ID" ] || fail "Could not create or find the staging staff user."

ROLE_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${STAGING_URL}/rest/v1/app_roles?on_conflict=user_id" \
  -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d "$(jq -nc --arg id "$USER_ID" '{user_id: $id, role: "admin", is_active: true}')")"

case "$ROLE_STATUS" in
  2*) log "Staff user ready: $STAFF_EMAIL (admin)" ;;
  *)  fail "Could not grant the admin role (HTTP ${ROLE_STATUS})." ;;
esac

step "Verifying"
CRM_ENVIRONMENT=staging \
STAGING_PROJECT_REF="$STAGING_PROJECT_REF" \
STAGING_SUPABASE_URL="$STAGING_URL" \
STAGING_ANON_KEY="$ANON_KEY" \
STAGING_SERVICE_KEY="$SERVICE_KEY" \
  bash "$REPO_ROOT/scripts/verify-staging.sh"

cat <<SUMMARY

$(log "Staging is ready.")

  Project        ${PROJECT_NAME} (${STAGING_PROJECT_REF})
  URL            ${STAGING_URL}
  Staff user     ${STAFF_EMAIL}

  Next:
    npm run verify:staging     re-run the non-destructive checks
    vercel env ...             point Preview at this project

  Production was not contacted by this script.

SUMMARY
