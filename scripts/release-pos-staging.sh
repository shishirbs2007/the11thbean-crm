#!/usr/bin/env bash
#
# COMMAND 1 of the fallback-POS release: prepare + validate + stage.
#
#   npm run release:pos:staging
#
# Safe to stop at any point — nothing here can touch production. It:
#   1. checks the Node version
#   2. checks git state (clean tree) and prints the exact commit
#   3. loads and maps the staging environment
#   4. fails closed if the target is anything but the known staging project
#   5. runs the local validation gate (lint, types, unit tests, build)
#   6. applies the POS migration to STAGING (additive)
#   7. runs the non-destructive staging checks
#   8. verifies the POS write flow AND idempotent replay on staging,
#      leaving no synthetic data behind
#   9. optionally runs the hosted staging UI suite if a preview URL is set
# and stops immediately on the first failure.
#
# Secrets come from .env.staging (gitignored) and are never printed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/environment-guard.sh
source "$REPO_ROOT/scripts/lib/environment-guard.sh"

log()  { printf '\033[1;32m[stage]\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[stage]\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[1;31m[stage]\033[0m %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

started=$(date +%s)

step "1. Node version"
command -v node >/dev/null || fail "node is not installed."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node 20+ required (CI uses 22); found $(node -v 2>/dev/null)."
[ "$NODE_MAJOR" = "22" ] || warn "CI uses Node 22; you have $(node -v). Continuing."
log "Node $(node -v)."

step "2. Git state"
git diff --quiet && git diff --cached --quiet \
  || fail "Working tree is not clean. Commit or stash before releasing."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse HEAD)"
log "Branch $BRANCH at $COMMIT"
[ -f "supabase/migrations/202607240001_fallback_pos.sql" ] \
  || fail "POS migration not found on this checkout — are you on the POS branch?"

step "3. Staging environment"
for tool in supabase jq curl npm python3; do
  command -v "$tool" >/dev/null || fail "$tool is required but not installed."
done
if [ -f "$REPO_ROOT/.env.staging" ]; then
  # shellcheck disable=SC1090
  set -a && source "$REPO_ROOT/.env.staging" && set +a
  log "Loaded .env.staging"
else
  warn ".env.staging not found; relying on the current environment."
fi
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

step "4. Fail-closed target check"
require_valid_ref "$STAGING_PROJECT_REF"
CRM_ENVIRONMENT=staging require_non_production "$STAGING_PROJECT_REF" "staging release"
PROJECT_NAME="$(supabase projects list -o json 2>/dev/null \
  | jq -r --arg ref "$STAGING_PROJECT_REF" '.[] | select(.ref == $ref) | .name' | head -n1)"
[ -n "$PROJECT_NAME" ] || fail "Project $STAGING_PROJECT_REF is not visible to this Supabase account."
log "Target: $PROJECT_NAME ($STAGING_PROJECT_REF)"
export CRM_ENVIRONMENT=staging

step "5. Local validation gate"
npm run --silent test:guards
npm run --silent lint;      log "lint ok"
npm run --silent typecheck; log "typecheck ok"
npm run --silent test:unit
npm run --silent build >/dev/null; log "build ok"
if [ "${POS_FULL_LOCAL:-0}" = "1" ]; then
  step "5b. Local write-enabled E2E (requires local Supabase)"
  npm run --silent test:e2e:local
fi

step "6. Apply POS migration to staging"
LINK_ARGS=(link --project-ref "$STAGING_PROJECT_REF")
[ -n "${STAGING_DB_PASSWORD:-}" ] && LINK_ARGS+=(--password "$STAGING_DB_PASSWORD")
supabase "${LINK_ARGS[@]}" </dev/null >/dev/null
supabase db push --linked </dev/null
log "Migrations applied to staging."

step "7. Non-destructive staging checks"
npm run --silent verify:staging

step "8. POS write flow + idempotent replay on staging"
npm run --silent verify:pos:staging

step "9. Hosted staging UI suite"
if [ -n "${PLAYWRIGHT_BASE_URL:-}" ]; then
  npm run --silent test:e2e:staging
else
  warn "PLAYWRIGHT_BASE_URL not set — skipping the hosted UI suite."
  warn "Pushing this branch auto-creates a Vercel Preview; set its URL as"
  warn "PLAYWRIGHT_BASE_URL in .env.staging to run test:e2e:staging here."
fi

cat <<SUMMARY

$(log "STAGING IS GREEN for the fallback POS.")

  Commit         $COMMIT
  Staging        $PROJECT_NAME ($STAGING_PROJECT_REF)
  Verified       write flow · idempotent replay (one sale) · CRM isolation
  Elapsed        $(( $(date +%s) - started ))s

  Production was NOT contacted by this command.
  When you are ready to go live, run COMMAND 2:

      CONFIRM_PRODUCTION_RELEASE=yes npm run release:pos:production

SUMMARY
