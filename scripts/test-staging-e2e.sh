#!/usr/bin/env bash
#
# Runs the write-enabled lifecycle suite against the hosted staging deployment.
#
#   npm run test:e2e:staging -- [playwright args]
#
# Resolves staging credentials from .env.staging, confirms the target is not
# production, and hands off to the staging Playwright config. Every fixture it
# creates lives in the staging database and is removed afterwards.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/environment-guard.sh
source "$REPO_ROOT/scripts/lib/environment-guard.sh"

log()  { printf '\033[1;32m[staging-e2e]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[staging-e2e]\033[0m %s\n' "$1" >&2; exit 1; }

if [ -f "$REPO_ROOT/.env.staging" ]; then
  # shellcheck disable=SC1090
  set -a && source "$REPO_ROOT/.env.staging" && set +a
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

require_valid_ref "$STAGING_PROJECT_REF"
export CRM_ENVIRONMENT=staging
require_non_production "$STAGING_PROJECT_REF" "staging end-to-end tests"

STAGING_URL="https://${STAGING_PROJECT_REF}.supabase.co"

# The deployment under test. Defaults to the most recent preview.
BASE_URL="${PLAYWRIGHT_BASE_URL:-$(vercel ls 2>/dev/null \
  | grep -oE 'https://the11thbean-[a-z0-9]+-[a-z0-9]+\.vercel\.app' | head -1)}"

[ -n "$BASE_URL" ] || fail "No preview deployment found. Run: vercel deploy"

case "$BASE_URL" in
  https://the11thbean-crm.vercel.app*)
    fail "Refusing to run write-enabled tests against the production URL." ;;
esac

log "Deployment under test: $BASE_URL"
log "Backed by staging project: $STAGING_PROJECT_REF"

KEYS_JSON="$(supabase projects api-keys --project-ref "$STAGING_PROJECT_REF" -o json)"
ANON_KEY="$(jq -r '.[] | select(.name == "anon") | .api_key' <<<"$KEYS_JSON")"
SERVICE_KEY="$(jq -r '.[] | select(.name == "service_role") | .api_key' <<<"$KEYS_JSON")"

[ -n "$SERVICE_KEY" ] && [ "$SERVICE_KEY" != "null" ] \
  || fail "Could not read the staging service-role key."

PLAYWRIGHT_BASE_URL="$BASE_URL" \
NEXT_PUBLIC_SUPABASE_URL="$STAGING_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
CRM_E2E_ALLOW_WRITES=true \
CRM_E2E_ENVIRONMENT=staging \
  npx playwright test --config=playwright.staging.config.ts "$@"
