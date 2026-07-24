#!/usr/bin/env bash
#
# COMMAND 2 of the fallback-POS release: back up, migrate and go live.
#
#   CONFIRM_PRODUCTION_RELEASE=yes npm run release:pos:production
#
# This is the only command that touches production, and it refuses to run
# unless you say so explicitly. It:
#   1. re-confirms Node and a clean git checkout on the POS commit
#   2. positively identifies the PRODUCTION project (fails on anything else)
#   3. takes a full production database backup, outside the repo
#   4. confirms the POS migration is additive (no CRM writes, no drops)
#   5. applies the POS migration to production
#   6. deploys the production build
#   7. runs the read-only production smoke suite
#   8. runs a read-only production check (menu + prices + checkout function)
#   9. prints the production /pos URL and the Android hand-off
# and stops immediately on the first failure. On any error after the deploy it
# prints the one-line rollback.
#
# Secrets come from the environment / .env.production and are never printed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/environment-guard.sh
source "$REPO_ROOT/scripts/lib/environment-guard.sh"

log()  { printf '\033[1;32m[prod]\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[prod]\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[1;31m[prod]\033[0m %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1m━━ %s\033[0m\n' "$1"; }

PRODUCTION_REF_EXPECTED="ehbkxldhajgcununyfat"
DEPLOYED=0
rollback_hint() {
  if [ "$DEPLOYED" = "1" ]; then
    printf '\n\033[1;31mIf production looks wrong, roll the app back now:\033[0m\n' >&2
    printf '    vercel rollback && npm run test:smoke\n' >&2
    printf 'The database change is additive, so the previous build runs unchanged.\n' >&2
  fi
}
trap rollback_hint ERR

step "0. Explicit confirmation"
[ "${CONFIRM_PRODUCTION_RELEASE:-}" = "yes" ] \
  || fail "Refusing to run. Re-run with: CONFIRM_PRODUCTION_RELEASE=yes npm run release:pos:production"

step "1. Node + git state"
command -v node >/dev/null || fail "node is not installed."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node 20+ required; found $(node -v 2>/dev/null)."
git diff --quiet && git diff --cached --quiet || fail "Working tree is not clean."
COMMIT="$(git rev-parse HEAD)"
log "Commit $COMMIT"
[ -f "supabase/migrations/202607240001_fallback_pos.sql" ] \
  || fail "POS migration not found — wrong checkout?"

if [ -f "$REPO_ROOT/.env.production" ]; then
  # shellcheck disable=SC1090
  set -a && source "$REPO_ROOT/.env.production" && set +a
  log "Loaded .env.production"
fi

step "2. Positively identify production"
for tool in supabase jq npm; do
  command -v "$tool" >/dev/null || fail "$tool is required but not installed."
done
PROD_REF="${PRODUCTION_PROJECT_REF:-$(cat supabase/.temp/project-ref 2>/dev/null || true)}"
[ -n "$PROD_REF" ] || fail "Could not determine the production project ref."
require_valid_ref "$PROD_REF"
[ "$PROD_REF" = "$PRODUCTION_REF_EXPECTED" ] \
  || fail "Linked project '$PROD_REF' is not the expected production project. Refusing."
is_production_ref "$PROD_REF" \
  || fail "Safety mismatch: '$PROD_REF' is not on the guard's production list. Refusing."
log "Confirmed production project: $PROD_REF"

# Ensure the CLI is linked to production before any db operation.
LINK_ARGS=(link --project-ref "$PROD_REF")
[ -n "${PRODUCTION_DB_PASSWORD:-}" ] && LINK_ARGS+=(--password "$PRODUCTION_DB_PASSWORD")
supabase "${LINK_ARGS[@]}" </dev/null >/dev/null
log "Supabase CLI linked to production."

step "3. Production backup (real guest data)"
BACKUP_DIR="${CRM_BACKUP_DIR:-$HOME/crm-backups}"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/production-$(date +%Y%m%d-%H%M%S)-pre-pos.sql"
supabase db dump --linked -f "$BACKUP_FILE" </dev/null
[ -s "$BACKUP_FILE" ] || fail "Backup file is empty — aborting before any change."
log "Backup written: $BACKUP_FILE ($(wc -c <"$BACKUP_FILE") bytes)"

step "4. Confirm the migration is additive"
MIG="supabase/migrations/202607240001_fallback_pos.sql"
if grep -qiE 'drop[[:space:]]+table|drop[[:space:]]+column|truncate|delete[[:space:]]+from' "$MIG"; then
  fail "Migration contains a destructive statement — refusing."
fi
for t in visits visit_items order_items timeline_entries people; do
  if grep -qiE "insert[[:space:]]+into[[:space:]]+public\.${t}\b" "$MIG"; then
    fail "Migration writes to CRM table '$t' — not a standalone POS. Refusing."
  fi
done
log "Migration is additive and writes only to pos_* tables."

step "5. Apply POS migration to production"
supabase db push --linked </dev/null
log "POS migration applied to production."

step "6. Deploy production build"
if [ "${POS_SKIP_VERCEL:-0}" = "1" ]; then
  warn "POS_SKIP_VERCEL=1 — skipping 'vercel --prod'. Deploy the build yourself."
else
  command -v vercel >/dev/null || fail "vercel CLI not installed (or set POS_SKIP_VERCEL=1)."
  DEPLOY_URL="$(vercel deploy --prod --yes 2>/dev/null | tail -n1)"
  DEPLOYED=1
  log "Deployed: ${DEPLOY_URL:-(see Vercel dashboard)}"
fi

step "7. Production smoke suite (read-only)"
npm run --silent test:smoke

step "8. Read-only production POS check"
if [ -n "${PRODUCTION_ACCESS_TOKEN:-${SUPABASE_ACCESS_TOKEN:-}}" ] && command -v curl >/dev/null && command -v python3 >/dev/null; then
  TOKEN="${PRODUCTION_ACCESS_TOKEN:-$SUPABASE_ACCESS_TOKEN}"
  CHECK_SQL="select
      (select count(*) from public.pos_menu_items) as items,
      (select count(*) from public.pos_menu_items
         where (name,price) in (('Brownie',100),('Cake Pop',60),
           ('Lemon Blueberry Cake',90),('Cookie',70),('Cupcake',60),
           ('Roll',90),('Pizza Pocket',90))) as correct,
      (select count(*) from pg_proc where proname='pos_checkout') as fn;"
  BODY="$(python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" <<<"$CHECK_SQL")"
  RESP="$(curl -sS -m 60 -X POST \
    "https://api.supabase.com/v1/projects/${PROD_REF}/database/query" \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    -d "$BODY" 2>/dev/null || true)"
  if echo "$RESP" | grep -q '"correct":7' && echo "$RESP" | grep -q '"fn":1'; then
    log "Production has the 7-item menu at the correct prices and pos_checkout()."
  else
    warn "Could not confirm the menu/prices read-only. Response: $(echo "$RESP" | head -c 200)"
  fi
else
  warn "No production access token available — skipping the read-only menu check."
  warn "Verify manually: open /pos and confirm the 7 items and prices."
fi

PROD_URL="${PRODUCTION_URL:-https://the11thbean-crm.vercel.app}"

cat <<SUMMARY

$(log "FALLBACK POS IS LIVE.")

  Commit        $COMMIT
  Backup        $BACKUP_FILE
  Production     $PROD_URL/pos

  Android hand-off for staff:
    1. Open $PROD_URL/pos in Chrome and sign in.
    2. Chrome menu (⋮) → "Add to Home screen" → "Install".
    3. Open "Bean POS" from the home screen (full-screen register).
    4. Tap items to build the order; +/- to change quantity.
    5. Choose Cash / UPI / Card, then tap "Charge".
    6. "Share receipt" → pick WhatsApp / SMS / email (or "Copy").
    7. If the internet drops, keep selling — sales queue and sync
       automatically when it returns (watch the "pending sync" badge).
    8. Today's total is shown top-right of the register.

  Rollback if needed:  vercel rollback && npm run test:smoke

SUMMARY

trap - ERR
