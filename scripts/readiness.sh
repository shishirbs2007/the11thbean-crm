#!/usr/bin/env bash
set -u

pass=0
warn=0
fail=0

check_pass() { printf "[PASS] %s\n" "$1"; pass=$((pass+1)); }
check_warn() { printf "[WARN] %s\n" "$1"; warn=$((warn+1)); }
check_fail() { printf "[FAIL] %s\n" "$1"; fail=$((fail+1)); }

command -v node >/dev/null 2>&1 && check_pass "Node.js installed" || check_fail "Node.js missing"
command -v git >/dev/null 2>&1 && check_pass "Git installed" || check_fail "Git missing"
command -v gh >/dev/null 2>&1 && check_pass "GitHub CLI installed" || check_fail "GitHub CLI missing"
command -v supabase >/dev/null 2>&1 && check_pass "Supabase CLI installed" || check_fail "Supabase CLI missing"
command -v vercel >/dev/null 2>&1 && check_pass "Vercel CLI installed" || check_fail "Vercel CLI missing"

gh auth status >/dev/null 2>&1 && check_pass "GitHub authenticated" || check_warn "GitHub not authenticated"
supabase projects list >/dev/null 2>&1 && check_pass "Supabase authenticated" || check_warn "Supabase not authenticated"
vercel whoami >/dev/null 2>&1 && check_pass "Vercel authenticated" || check_warn "Vercel not authenticated"

[[ -d .git ]] && check_pass "Git repository present" || check_fail "Git repository missing"
git remote get-url origin >/dev/null 2>&1 && check_pass "GitHub remote present" || check_warn "GitHub remote missing"
[[ -f supabase/migrations/202607190001_initial_crm.sql ]] && check_pass "Initial migration present" || check_fail "Initial migration missing"
[[ -f .env.example ]] && check_pass "Environment template present" || check_fail "Environment template missing"
[[ ! -f .env.local ]] && check_warn "No local environment file yet" || check_pass "Local environment file present"

if git grep -nE '(service_role|secret|password).{0,10}[=:].{4,}' -- ':!*.example' ':!scripts/readiness.sh' >/tmp/11thbean-secret-scan.txt 2>/dev/null; then
  check_warn "Potential secret-like text found; inspect /tmp/11thbean-secret-scan.txt"
else
  check_pass "No obvious committed secrets found"
fi

printf "\nSummary: %s pass, %s warning, %s fail\n" "$pass" "$warn" "$fail"
[[ "$fail" -eq 0 ]]
