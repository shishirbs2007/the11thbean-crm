#!/usr/bin/env bash
#
# Deterministic verification of the fallback POS against hosted staging.
#
#   npm run verify:pos:staging
#
# Runs one transaction on staging that:
#   1. records a sale through pos_checkout()            (write flow)
#   2. replays the SAME client_order_id                 (idempotent replay)
#   3. asserts exactly ONE pos_orders row exists        (no duplicate sale)
#   4. asserts NOTHING was written to visits/timeline   (standalone isolation)
# and then RAISES to roll the whole transaction back, so staging keeps no
# synthetic data. It fails closed: any assertion, a missing staff user, or an
# authorisation problem aborts with a non-zero exit.
#
# Secrets (access token, keys) are read from .env.staging or the environment
# and are never printed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/environment-guard.sh
source "$REPO_ROOT/scripts/lib/environment-guard.sh"

log()  { printf '\033[1;32m[pos-verify]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[pos-verify]\033[0m %s\n' "$1" >&2; exit 1; }

if [ -f "$REPO_ROOT/.env.staging" ]; then
  # shellcheck disable=SC1090
  set -a && source "$REPO_ROOT/.env.staging" && set +a
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

require_valid_ref "$STAGING_PROJECT_REF"
CRM_ENVIRONMENT=staging require_non_production "$STAGING_PROJECT_REF" "POS verification"

STAFF_EMAIL="${CRM_TEST_USER_EMAIL:-bean@the11thbean.com}"

# The verification transaction. It never commits: the trailing RAISE with the
# POS_VERIFY_OK sentinel rolls everything back once the assertions have passed.
read -r -d '' SQL <<SQL || true
do \$\$
declare
  v_uid uuid;
  v_client uuid := gen_random_uuid();
  v_payload jsonb;
  r1 jsonb; r2 jsonb;
  n_orders int; n_visits int; n_timeline int; v_order_id uuid;
begin
  select id into v_uid from auth.users where email = '${STAFF_EMAIL}' limit 1;
  if v_uid is null then
    raise exception 'POS_VERIFY_FAIL: staging staff user ${STAFF_EMAIL} not found';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  v_payload := jsonb_build_object(
    'client_order_id', v_client::text,
    'payment_method', 'cash',
    'amount_tendered', 200,
    'lines', jsonb_build_array(
      jsonb_build_object('menu_item_id', null, 'item_name', 'verify-brownie',
                         'category', 'Bakes', 'unit_price', 100, 'quantity', 1),
      jsonb_build_object('menu_item_id', null, 'item_name', 'verify-cookie',
                         'category', 'Bakes', 'unit_price', 70, 'quantity', 1)
    )
  );

  r1 := public.pos_checkout(v_payload);
  r2 := public.pos_checkout(v_payload);

  if (r1->>'created')::boolean is not true then
    raise exception 'POS_VERIFY_FAIL: first checkout did not create a sale: %', r1;
  end if;
  if (r2->>'created')::boolean is not false then
    raise exception 'POS_VERIFY_FAIL: replay created a duplicate sale: %', r2;
  end if;

  v_order_id := (r1->>'order_id')::uuid;

  select count(*) into n_orders from public.pos_orders where client_order_id = v_client;
  if n_orders <> 1 then
    raise exception 'POS_VERIFY_FAIL: expected exactly one pos_orders row, found %', n_orders;
  end if;

  if (select total from public.pos_orders where client_order_id = v_client) <> 170 then
    raise exception 'POS_VERIFY_FAIL: recorded total did not match 170';
  end if;

  select count(*) into n_visits from public.visits where external_order_id = v_client::text;
  select count(*) into n_timeline from public.timeline_entries where source_id = v_order_id;
  if n_visits <> 0 or n_timeline <> 0 then
    raise exception 'POS_VERIFY_FAIL: CRM leak detected — visits=% timeline=%', n_visits, n_timeline;
  end if;

  raise exception 'POS_VERIFY_OK: write-flow + idempotent replay + standalone isolation verified';
end \$\$;
SQL

PAYLOAD="$(python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" <<<"$SQL")"

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

STATUS="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' -m 120 \
  -X POST "https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "User-Agent: the11thbean-pos-verify/1.0" \
  -d "$PAYLOAD")"

if grep -q "POS_VERIFY_OK" "$RESPONSE_FILE"; then
  log "PASS — sale recorded once, replay created no duplicate, no CRM tables touched."
  log "Transaction rolled back: staging holds no synthetic POS data."
  exit 0
fi

if grep -q "POS_VERIFY_FAIL" "$RESPONSE_FILE"; then
  fail "Verification assertion failed: $(sed 's/.*\(POS_VERIFY_FAIL[^"]*\).*/\1/' "$RESPONSE_FILE" | head -c 300)"
fi

fail "POS verification did not complete (HTTP ${STATUS}): $(head -c 300 "$RESPONSE_FILE")"
