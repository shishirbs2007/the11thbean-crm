#!/usr/bin/env bash
set -u
IFS=$'\n\t'

VERSION="1.1.0"
START_DIR="$(pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_NAME="VALIDATION_REPORT_${TIMESTAMP}.txt"
LOG_NAME="VALIDATION_LOG_${TIMESTAMP}.txt"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

C_RESET=$'\033[0m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_RED=$'\033[31m'
C_CYAN=$'\033[36m'
C_BOLD=$'\033[1m'

report_line() {
  printf "%s\n" "$*" | tee -a "$REPORT_FILE"
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf "%s[PASS]%s %s\n" "$C_GREEN" "$C_RESET" "$*" | tee -a "$REPORT_FILE"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf "%s[WARN]%s %s\n" "$C_YELLOW" "$C_RESET" "$*" | tee -a "$REPORT_FILE"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf "%s[FAIL]%s %s\n" "$C_RED" "$C_RESET" "$*" | tee -a "$REPORT_FILE"
}

section() {
  printf "\n%s%s%s\n" "$C_BOLD" "$*" "$C_RESET" | tee -a "$REPORT_FILE"
}

run_capture() {
  local label="$1"
  shift
  {
    printf "\n--- %s ---\n" "$label"
    "$@"
    printf "\n"
  } >> "$LOG_FILE" 2>&1
}

find_project_root() {
  local current="$START_DIR"
  local depth=0

  while [[ "$current" != "/" && $depth -lt 6 ]]; do
    if [[ -f "$current/package.json" && -d "$current/src" ]]; then
      printf "%s" "$current"
      return 0
    fi

    local found
    found="$(find "$current" -maxdepth 2 -type f -name package.json 2>/dev/null | head -1 || true)"
    if [[ -n "$found" ]]; then
      local candidate
      candidate="$(dirname "$found")"
      if [[ -d "$candidate/src" ]]; then
        printf "%s" "$candidate"
        return 0
      fi
    fi

    current="$(dirname "$current")"
    depth=$((depth + 1))
  done

  return 1
}

PROJECT_ROOT="$(find_project_root || true)"

if [[ -z "$PROJECT_ROOT" ]]; then
  printf "\nCould not find a project containing package.json and src.\n"
  printf "Move this script into the project folder and run it again.\n"
  read -r -p "Press Enter to close..."
  exit 1
fi

cd "$PROJECT_ROOT"
REPORT_FILE="$PROJECT_ROOT/$REPORT_NAME"
LOG_FILE="$PROJECT_ROOT/$LOG_NAME"
touch "$REPORT_FILE" "$LOG_FILE"

clear
printf "%sThe 11th Bean Platform Validator%s\n" "$C_BOLD" "$C_RESET"
printf "Version %s\n\n" "$VERSION"
printf "Project detected at:\n%s\n\n" "$PROJECT_ROOT"

report_line "THE 11TH BEAN PLATFORM VALIDATION REPORT"
report_line "Generated: $(date)"
report_line "Validator version: $VERSION"
report_line "Project root: $PROJECT_ROOT"

section "1. LOCAL PROJECT STRUCTURE"

required_files=(
  "package.json"
  "package-lock.json"
  "next.config.ts"
  "src/app/page.tsx"
  "src/app/customers/page.tsx"
  "src/app/api/health/route.ts"
  "supabase/config.toml"
  "supabase/migrations/202607190001_initial_crm.sql"
)

for item in "${required_files[@]}"; do
  if [[ -e "$item" ]]; then
    pass "Found $item"
  else
    fail "Missing $item"
  fi
done

section "2. REQUIRED TOOLS"

for tool in git node npm gh supabase vercel curl; do
  if command -v "$tool" >/dev/null 2>&1; then
    version="$("$tool" --version 2>/dev/null | head -1 || true)"
    pass "$tool available ${version:+($version)}"
  else
    fail "$tool is not installed or not available in PATH"
  fi
done

section "3. GIT AND GITHUB"

if [[ -d .git ]]; then
  pass "Local Git repository exists"
else
  fail "Local Git repository is missing"
fi

if git remote get-url origin >/dev/null 2>&1; then
  ORIGIN_URL="$(git remote get-url origin)"
  pass "GitHub remote configured: $ORIGIN_URL"
else
  ORIGIN_URL=""
  fail "Git remote 'origin' is missing"
fi

if gh auth status >/dev/null 2>&1; then
  pass "GitHub CLI authentication works"
else
  fail "GitHub CLI is not authenticated"
fi

if [[ -n "$ORIGIN_URL" ]]; then
  REPO_SLUG="$(printf "%s" "$ORIGIN_URL" | sed -E 's#(https://github.com/|git@github.com:)##; s#\.git$##')"
  if gh repo view "$REPO_SLUG" >/dev/null 2>&1; then
    pass "GitHub repository is reachable: $REPO_SLUG"
    DEFAULT_BRANCH="$(gh repo view "$REPO_SLUG" --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)"
    [[ -n "$DEFAULT_BRANCH" ]] && pass "Default branch detected: $DEFAULT_BRANCH" || warn "Could not read the default branch"
  else
    fail "GitHub repository could not be reached: $REPO_SLUG"
  fi
fi

GIT_STATUS_RAW="$(git status --porcelain 2>/dev/null || true)"
GIT_STATUS="$(printf "%s\n" "$GIT_STATUS_RAW" | grep -Ev '(^|/)(VALIDATION_REPORT_|VALIDATION_LOG_).*\.txt$|(^|/)validate-11thbean-platform\.command$' || true)"

if [[ -z "$GIT_STATUS" ]]; then
  if [[ -n "$GIT_STATUS_RAW" ]]; then
    pass "Git has no application changes; only validator-generated files are untracked or modified"
  else
    pass "Git working tree is clean"
  fi
else
  warn "Git working tree has application changes"
  printf "%s\n" "$GIT_STATUS" >> "$LOG_FILE"
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  LOCAL_HEAD="$(git rev-parse HEAD)"
  REMOTE_HEAD="$(git rev-parse '@{u}')"
  if [[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]]; then
    pass "Local branch matches its remote branch"
  else
    warn "Local branch and remote branch differ"
  fi
else
  warn "Current branch has no upstream branch configured"
fi

section "4. SECRET AND SENSITIVE FILE CHECK"

sensitive_tracked=0
while IFS= read -r tracked; do
  case "$tracked" in
    .env|.env.local|.env.production|.env.development|*.pem|*.key|*secret*.txt)
      fail "Sensitive file is tracked by Git: $tracked"
      sensitive_tracked=1
      ;;
  esac
done < <(git ls-files 2>/dev/null || true)

if [[ $sensitive_tracked -eq 0 ]]; then
  pass "No obvious sensitive environment or key files are tracked by Git"
fi

SECRET_SCAN_FILE="/tmp/11thbean-secret-scan-${TIMESTAMP}.txt"
if git grep -nEI \
  '(SUPABASE_SERVICE_ROLE_KEY|RAZORPAY_KEY_SECRET|PRIVATE_KEY|DATABASE_PASSWORD|sbp_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.)' \
  -- ':!package-lock.json' ':!*.example' ':!README.md' \
  > "$SECRET_SCAN_FILE" 2>/dev/null; then
  warn "Potential secret-like values found. Review $SECRET_SCAN_FILE"
else
  pass "No obvious committed secrets found by pattern scan"
  rm -f "$SECRET_SCAN_FILE"
fi

section "5. APPLICATION QUALITY"

if npm run lint >> "$LOG_FILE" 2>&1; then
  pass "npm lint completed successfully"
else
  fail "npm lint failed. See $LOG_FILE"
fi

if npm run build >> "$LOG_FILE" 2>&1; then
  pass "Production build completed successfully"
else
  fail "Production build failed. See $LOG_FILE"
fi

section "6. SUPABASE"

if supabase projects list >/dev/null 2>&1; then
  pass "Supabase CLI authentication works"
else
  fail "Supabase CLI authentication failed"
fi

LINKED_REF=""
if [[ -f "supabase/.temp/project-ref" ]]; then
  LINKED_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
elif [[ -f ".supabase/project-ref" ]]; then
  LINKED_REF="$(tr -d '[:space:]' < .supabase/project-ref)"
elif [[ -f "supabase/.temp/linked-project.json" ]]; then
  LINKED_REF="$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("supabase/.temp/linked-project.json","utf8"));console.log(p.project_ref||p.ref||p.id||"")' 2>/dev/null || true)"
fi

if [[ -n "$LINKED_REF" ]]; then
  pass "Supabase project link detected: $LINKED_REF"
else
  warn "Supabase project reference could not be detected from local metadata"
fi

MIGRATION_OUTPUT="$(supabase migration list --linked 2>>"$LOG_FILE" || true)"
if [[ -n "$MIGRATION_OUTPUT" ]]; then
  printf "%s\n" "$MIGRATION_OUTPUT" >> "$LOG_FILE"
  if printf "%s\n" "$MIGRATION_OUTPUT" | grep -q "202607190001"; then
    pass "Initial CRM migration appears in linked migration history"
  else
    warn "Initial CRM migration was not clearly found in linked migration history"
  fi
else
  fail "Could not read linked Supabase migration history"
fi

MIGRATION_FILE="supabase/migrations/202607190001_initial_crm.sql"
expected_tables=(
  people
  external_identities
  visits
  order_items
  customer_preferences
  customer_notes
  tags
  person_tags
  communities
  community_memberships
  events
  event_registrations
  consents
  integration_sync_runs
  integration_errors
  app_roles
)

if [[ -f "$MIGRATION_FILE" ]]; then
  for table in "${expected_tables[@]}"; do
    if grep -Eq "create table public\.${table}[[:space:](]" "$MIGRATION_FILE"; then
      pass "Schema defines table: $table"
    else
      fail "Schema does not define expected table: $table"
    fi
  done

  rls_missing=0
  for table in "${expected_tables[@]}"; do
    if grep -Eq "alter table public\.${table} enable row level security" "$MIGRATION_FILE"; then
      :
    else
      warn "RLS declaration not found for: $table"
      rls_missing=1
    fi
  done
  [[ $rls_missing -eq 0 ]] && pass "RLS is declared for every expected table"
else
  fail "Initial migration file is unavailable for schema checks"
fi

section "7. VERCEL"

if vercel whoami >/dev/null 2>&1; then
  VERCEL_USER="$(vercel whoami 2>/dev/null | tail -1)"
  pass "Vercel CLI authentication works${VERCEL_USER:+ as $VERCEL_USER}"
else
  fail "Vercel CLI authentication failed"
fi

VERCEL_PROJECT_ID=""
VERCEL_PROJECT_NAME=""
if [[ -f ".vercel/project.json" ]]; then
  VERCEL_PROJECT_ID="$(node -e 'const p=require("./.vercel/project.json");console.log(p.projectId||"")' 2>/dev/null || true)"
  VERCEL_PROJECT_NAME="$(node -e 'const p=require("./.vercel/project.json");console.log(p.projectName||"")' 2>/dev/null || true)"
  pass "Local Vercel linkage exists${VERCEL_PROJECT_NAME:+ for $VERCEL_PROJECT_NAME}"
else
  fail ".vercel/project.json is missing"
fi

ENV_OUTPUT="$(vercel env ls 2>>"$LOG_FILE" || true)"
if [[ -n "$ENV_OUTPUT" ]]; then
  printf "%s\n" "$ENV_OUTPUT" >> "$LOG_FILE"
  for env_name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
    if printf "%s\n" "$ENV_OUTPUT" | grep -q "$env_name"; then
      pass "Vercel environment variable exists: $env_name"
    else
      fail "Vercel environment variable missing: $env_name"
    fi
  done
else
  fail "Could not retrieve Vercel environment variables"
fi

DEPLOY_LIST="$(vercel ls 2>>"$LOG_FILE" || true)"
printf "%s\n" "$DEPLOY_LIST" >> "$LOG_FILE"

LATEST_URL="$(printf "%s\n" "$DEPLOY_LIST" | grep -Eo 'https://[A-Za-z0-9._-]+\.vercel\.app' | head -1 || true)"

if [[ -z "$LATEST_URL" ]]; then
  LATEST_URL="$(grep -RhoE 'https://[A-Za-z0-9._-]+\.vercel\.app' .vercel 2>/dev/null | head -1 || true)"
fi

if [[ -n "$LATEST_URL" ]]; then
  pass "Latest Vercel URL detected: $LATEST_URL"
else
  warn "Could not automatically detect a deployed Vercel URL"
fi

section "8. LIVE ENDPOINTS"

if [[ -n "$LATEST_URL" ]]; then
  check_http_200() {
    local path="$1"
    local url="${LATEST_URL}${path}"
    local body_file="/tmp/11thbean-body-${TIMESTAMP}-$(printf "%s" "$path" | tr '/' '_').txt"
    local code
    code="$(curl --compressed -L -sS -o "$body_file" -w "%{http_code}" --max-time 30 "$url" 2>>"$LOG_FILE" || true)"

    if [[ "$code" == "200" ]]; then
      pass "$url returned HTTP 200"
    else
      fail "$url returned HTTP ${code:-unknown}"
      [[ -f "$body_file" ]] && head -c 1000 "$body_file" >> "$LOG_FILE"
    fi
    rm -f "$body_file"
  }

  check_http_200 "/"
  check_http_200 "/customers"

  HEALTH_BODY="/tmp/11thbean-health-${TIMESTAMP}.json"
  HEALTH_CODE="$(curl --compressed -L -sS -o "$HEALTH_BODY" -w "%{http_code}" --max-time 30 "${LATEST_URL}/api/health" 2>>"$LOG_FILE" || true)"

  HEALTH_STATUS=""
  if [[ -s "$HEALTH_BODY" ]]; then
    HEALTH_STATUS="$(node - "$HEALTH_BODY" <<'NODE' 2>>"$LOG_FILE" || true
const fs = require("fs");
const file = process.argv[2];
try {
  const body = fs.readFileSync(file, "utf8").trim();
  const parsed = JSON.parse(body);
  process.stdout.write(String(parsed.status || ""));
} catch (_) {
  process.stdout.write("");
}
NODE
)"
  fi

  if [[ "$HEALTH_CODE" == "200" && "$HEALTH_STATUS" == "ok" ]]; then
    pass "Health endpoint returned valid JSON with status=ok"
  elif [[ "$HEALTH_CODE" == "200" ]]; then
    warn "Health endpoint returned HTTP 200 but its body was not the expected JSON; body saved in the validation log"
    {
      printf "\n--- Health endpoint body ---\n"
      cat "$HEALTH_BODY" 2>/dev/null || true
      printf "\n--- End health endpoint body ---\n"
    } >> "$LOG_FILE"
  else
    fail "Health endpoint validation failed (HTTP ${HEALTH_CODE:-unknown})"
    cat "$HEALTH_BODY" >> "$LOG_FILE" 2>/dev/null || true
  fi
  rm -f "$HEALTH_BODY"
else
  warn "Live endpoint checks skipped because no deployment URL was detected"
fi

section "9. RESPONSIVE AND CONTENT SANITY"

if grep -q 'sm:grid-cols-2' src/app/page.tsx 2>/dev/null && grep -q 'lg:grid-cols-3' src/app/page.tsx 2>/dev/null; then
  pass "Responsive grid breakpoints are present in the homepage source"
else
  warn "Expected responsive grid breakpoints were not found"
fi

if grep -q 'max-w-' src/app/page.tsx 2>/dev/null; then
  pass "Homepage uses bounded responsive layout classes"
else
  warn "Homepage bounded-layout classes were not detected"
fi

section "10. FINAL RESULT"

report_line ""
report_line "PASS: $PASS_COUNT"
report_line "WARN: $WARN_COUNT"
report_line "FAIL: $FAIL_COUNT"

if [[ $FAIL_COUNT -eq 0 && $WARN_COUNT -eq 0 ]]; then
  STATUS="GREEN"
  report_line "OVERALL STATUS: GREEN"
  report_line "The current foundation passed every automated check."
elif [[ $FAIL_COUNT -eq 0 ]]; then
  STATUS="AMBER"
  report_line "OVERALL STATUS: AMBER"
  report_line "The foundation is usable, but warnings should be reviewed."
else
  STATUS="RED"
  report_line "OVERALL STATUS: RED"
  report_line "One or more required checks failed."
fi

report_line ""
report_line "Detailed command output: $LOG_FILE"
report_line "Validation report: $REPORT_FILE"

printf "\n%sValidation complete%s\n" "$C_BOLD" "$C_RESET"
printf "Status: %s\n" "$STATUS"
printf "Pass: %s | Warn: %s | Fail: %s\n" "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
printf "Report: %s\n" "$REPORT_FILE"
printf "Log: %s\n" "$LOG_FILE"

open "$REPORT_FILE" >/dev/null 2>&1 || true

printf "\n"
read -r -p "Press Enter to close..."
