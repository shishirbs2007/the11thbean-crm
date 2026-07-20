#!/usr/bin/env bash
#
# Provisions the staging Supabase project used by Preview deployments and the
# write-enabled end-to-end suite.
#
# Staging is disposable. The regression suite creates and deletes records here
# freely, which is exactly why it must never be the production project.
#
# Usage:
#   scripts/bootstrap-staging.sh
#
# Requires an authenticated Supabase CLI and an organisation slot free on the
# current plan.

set -euo pipefail

PROJECT_NAME="${STAGING_PROJECT_NAME:-the11thbean-crm-staging}"
REGION="${STAGING_REGION:-ap-south-1}"
STAFF_EMAIL="${CRM_TEST_USER_EMAIL:-bean@the11thbean.com}"
PRODUCTION_REF="ehbkxldhajgcununyfat"

log() { printf '\033[1;32m[staging]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[staging]\033[0m %s\n' "$1" >&2; exit 1; }

command -v supabase >/dev/null || fail "Supabase CLI is not installed."
command -v jq >/dev/null || fail "jq is required."

ORG_ID="$(supabase orgs list -o json | jq -r '.[0].id')"
[ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ] || fail "Could not resolve the Supabase organisation."

# Reuse the project if a previous run already created it.
EXISTING_REF="$(supabase projects list -o json \
  | jq -r --arg name "$PROJECT_NAME" '.[] | select(.name == $name) | .ref' | head -n1)"

if [ -n "$EXISTING_REF" ]; then
  log "Reusing existing project $PROJECT_NAME ($EXISTING_REF)."
  STAGING_REF="$EXISTING_REF"
else
  DB_PASS="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)"

  log "Creating $PROJECT_NAME in $REGION ..."
  STAGING_REF="$(supabase projects create "$PROJECT_NAME" \
    --org-id "$ORG_ID" \
    --region "$REGION" \
    --db-password "$DB_PASS" \
    -o json | jq -r '.id')"

  [ -n "$STAGING_REF" ] && [ "$STAGING_REF" != "null" ] \
    || fail "Project creation failed. A free plan allows two active projects per organisation."

  log "Created $STAGING_REF. Store this database password somewhere safe:"
  printf '  %s\n' "$DB_PASS"
fi

[ "$STAGING_REF" != "$PRODUCTION_REF" ] \
  || fail "Refusing to continue: resolved ref is the production project."

log "Waiting for the project to become healthy ..."
for _ in $(seq 1 60); do
  STATUS="$(supabase projects list -o json \
    | jq -r --arg ref "$STAGING_REF" '.[] | select(.ref == $ref) | .status')"
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  sleep 10
done
[ "$STATUS" = "ACTIVE_HEALTHY" ] || fail "Project did not become healthy in time (status: $STATUS)."

log "Applying migrations ..."
supabase link --project-ref "$STAGING_REF" >/dev/null
supabase db push --linked --include-all </dev/null

STAGING_URL="https://${STAGING_REF}.supabase.co"
SERVICE_KEY="$(supabase projects api-keys --project-ref "$STAGING_REF" -o json \
  | jq -r '.[] | select(.name == "service_role") | .api_key')"
ANON_KEY="$(supabase projects api-keys --project-ref "$STAGING_REF" -o json \
  | jq -r '.[] | select(.name == "anon") | .api_key')"

[ -n "$SERVICE_KEY" ] && [ "$SERVICE_KEY" != "null" ] || fail "Could not read the staging service-role key."

log "Creating the synthetic staff user $STAFF_EMAIL ..."
USER_ID="$(curl -fsS -X POST "${STAGING_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg email "$STAFF_EMAIL" \
        '{email: $email, email_confirm: true, user_metadata: {display_name: "Staging Test Staff"}}')" \
  | jq -r '.id')"

# A rerun against an existing user is not an error; look the account up instead.
if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  USER_ID="$(curl -fsS "${STAGING_URL}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
    | jq -r --arg email "$STAFF_EMAIL" '.users[] | select(.email == $email) | .id' | head -n1)"
fi

[ -n "$USER_ID" ] && [ "$USER_ID" != "null" ] || fail "Could not create or find the staff user."

log "Granting the admin role ..."
curl -fsS -X POST "${STAGING_URL}/rest/v1/app_roles" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "$(jq -nc --arg id "$USER_ID" '{user_id: $id, role: "admin", is_active: true}')" >/dev/null

cat <<SUMMARY

$(log "Staging is ready.")

  Project ref   ${STAGING_REF}
  URL           ${STAGING_URL}
  Staff user    ${STAFF_EMAIL} (admin)

Point Vercel Preview — and only Preview — at this project:

  vercel env add NEXT_PUBLIC_SUPABASE_URL preview
  vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
  vercel env add SUPABASE_SERVICE_ROLE_KEY preview

Anon key:
${ANON_KEY}

Then run the regression suite against a Preview deployment:

  PLAYWRIGHT_BASE_URL="https://<preview>.vercel.app" \\
  NEXT_PUBLIC_SUPABASE_URL="${STAGING_URL}" \\
  CRM_E2E_ALLOW_WRITES=true \\
  CRM_E2E_ENVIRONMENT=staging \\
  npm run test:e2e:staging

SUMMARY
