#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="$ROOT/validation-reports/$STAMP"
LOG="$REPORT_DIR/validation.log"

mkdir -p "$REPORT_DIR"

exec > >(tee "$LOG") 2>&1

status=0

section() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

run() {
  local name="$1"
  shift

  section "$name"

  if "$@"; then
    echo "$name: PASS"
  else
    echo "$name: FAIL"
    status=1
  fi
}

load_env() {
  if [[ -f ".env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ".env.local"
    set +a
  fi
}

load_env

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://the11thbean-crm.vercel.app}"
export CRM_TEST_USER_EMAIL="${CRM_TEST_USER_EMAIL:-bean@the11thbean.com}"

run "ESLint" npm run lint
run "Production build" npm run build
run "Public browser tests" npm run test:public

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  run "Authenticated browser tests" npm run test:auth
  run "Database integrity" npm run test:db
else
  section "Authenticated tests"
  echo "SKIPPED"
  echo "Add SUPABASE_SERVICE_ROLE_KEY to .env.local."
  echo "CRM_TEST_USER_EMAIL defaults to bean@the11thbean.com."
  status=1
fi

if [[ -d "playwright-report" ]]; then
  cp -R "playwright-report" "$REPORT_DIR/"
fi

if [[ -d "test-results" ]]; then
  cp -R "test-results" "$REPORT_DIR/"
fi

section "RESULT"

if [[ "$status" -eq 0 ]]; then
  echo "READY FOR PRODUCTION"
else
  echo "VALIDATION FAILED OR INCOMPLETE"
fi

echo "Report: $REPORT_DIR"
exit "$status"
