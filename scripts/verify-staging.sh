#!/usr/bin/env bash
#
# Non-destructive verification of the hosted staging environment.
#
#   npm run verify:staging
#
# Reads only. Writes nothing, deletes nothing. Safe to run at any time,
# including against a staging environment somebody else is using.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/environment-guard.sh
source "$REPO_ROOT/scripts/lib/environment-guard.sh"

pass=0
fail=0

ok()   { pass=$((pass + 1)); printf '  \033[1;32mok\033[0m   %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  \033[1;31mFAIL\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ -f "$REPO_ROOT/.env.staging" ] && [ -z "${STAGING_PROJECT_REF:-}" ]; then
  # shellcheck disable=SC1090
  set -a && source "$REPO_ROOT/.env.staging" && set +a
fi

: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

STAGING_URL="${STAGING_SUPABASE_URL:-https://${STAGING_PROJECT_REF}.supabase.co}"

step "Environment safety"

if ( CRM_ENVIRONMENT=staging require_non_production "$STAGING_PROJECT_REF" "verification" ) >/dev/null 2>&1; then
  ok "Target is not a production project"
else
  bad "Target failed the production denylist"
  exit 1
fi

if ( require_non_production "ehbkxldhajgcununyfat" "test" ) >/dev/null 2>&1; then
  bad "Guard allowed production — the safety system is broken"
  exit 1
else
  ok "Guard still refuses production"
fi

# Resolve keys without ever printing them.
if [ -z "${STAGING_ANON_KEY:-}" ] || [ -z "${STAGING_SERVICE_KEY:-}" ]; then
  KEYS_JSON="$(supabase projects api-keys --project-ref "$STAGING_PROJECT_REF" -o json 2>/dev/null || echo '[]')"
  STAGING_ANON_KEY="${STAGING_ANON_KEY:-$(jq -r '.[] | select(.name=="anon") | .api_key' <<<"$KEYS_JSON")}"
  STAGING_SERVICE_KEY="${STAGING_SERVICE_KEY:-$(jq -r '.[] | select(.name=="service_role") | .api_key' <<<"$KEYS_JSON")}"
fi

api() {
  curl -fsS "${STAGING_URL}/rest/v1/$1" \
    -H "apikey: ${STAGING_SERVICE_KEY}" \
    -H "Authorization: Bearer ${STAGING_SERVICE_KEY}" 2>/dev/null
}

step "Reachability"

# Query a real table the way the application does. The /rest/v1/ root needs
# more than an apikey and returns 401, which is not a reachability failure.
if curl -fsS -o /dev/null "${STAGING_URL}/rest/v1/branches?select=id&limit=1" \
     -H "apikey: ${STAGING_ANON_KEY}" \
     -H "Authorization: Bearer ${STAGING_ANON_KEY}" 2>/dev/null; then
  ok "Staging API responds to an anonymous read"
else
  bad "Staging API did not respond"
fi

step "Schema"

for object in branches hospitality_signals audience_rules business_metrics \
              recommendation_types hospitality_automations integration_adapters; do
  if api "${object}?select=*&limit=1" >/dev/null; then
    ok "Table present: $object"
  else
    bad "Table missing or unreadable: $object"
  fi
done

step "Registries populated"

check_count() {
  local table="$1" minimum="$2" label="$3"
  local count
  count="$(curl -fsS -I "${STAGING_URL}/rest/v1/${table}?select=*" \
    -H "apikey: ${STAGING_SERVICE_KEY}" \
    -H "Authorization: Bearer ${STAGING_SERVICE_KEY}" \
    -H "Prefer: count=exact" -H "Range: 0-0" 2>/dev/null \
    | grep -i '^content-range:' | sed 's|.*/||' | tr -d '\r')"

  if [ -n "$count" ] && [ "$count" -ge "$minimum" ] 2>/dev/null; then
    ok "$label ($count)"
  else
    bad "$label — expected at least $minimum, found ${count:-none}"
  fi
}

check_count "hospitality_signals" 11 "Hospitality signals registered"
check_count "audience_rules" 14 "Audience rules registered"
check_count "business_metrics" 13 "Business metrics registered"
check_count "recommendation_types" 8 "Recommendation types registered"
check_count "hospitality_automations" 9 "Automations registered"
check_count "integration_adapters" 6 "Integration adapters registered"
check_count "branches" 1 "Default branch created"

step "Synthetic data only"

REAL_ROWS="$(curl -fsS -I "${STAGING_URL}/rest/v1/people?select=*&email=not.like.*%40example.com" \
  -H "apikey: ${STAGING_SERVICE_KEY}" \
  -H "Authorization: Bearer ${STAGING_SERVICE_KEY}" \
  -H "Prefer: count=exact" -H "Range: 0-0" 2>/dev/null \
  | grep -i '^content-range:' | sed 's|.*/||' | tr -d '\r')"

if [ "${REAL_ROWS:-0}" = "0" ]; then
  ok "No non-synthetic guest records present"
else
  bad "Found ${REAL_ROWS} guest records that are not @example.com — investigate before proceeding"
fi

step "Automations are switched off"

ACTIVE="$(api "hospitality_automations?select=key&is_active=eq.true" | jq 'length' 2>/dev/null || echo "?")"
if [ "$ACTIVE" = "0" ]; then
  ok "No automation is running unattended"
else
  bad "$ACTIVE automation(s) active on staging — confirm this is deliberate"
fi

step "Integrations are disabled"

ENABLED="$(api "integration_adapters?select=key&is_enabled=eq.true" | jq 'length' 2>/dev/null || echo "?")"
if [ "$ENABLED" = "0" ]; then
  ok "No integration adapter is enabled, so nothing can reach a real recipient"
else
  bad "$ENABLED adapter(s) enabled — confirm none can message real customers"
fi

step "Intelligence responds"

for fn in executive_kpis expected_guests_today hospitality_recommendations forecast_demand; do
  if curl -fsS -X POST "${STAGING_URL}/rest/v1/rpc/${fn}" \
       -H "apikey: ${STAGING_SERVICE_KEY}" \
       -H "Authorization: Bearer ${STAGING_SERVICE_KEY}" \
       -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1; then
    ok "Function responds: $fn"
  else
    bad "Function failed: $fn"
  fi
done

printf '\n\033[1m%s passed, %s failed\033[0m\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
