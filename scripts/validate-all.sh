#!/usr/bin/env bash
#
# The full local validation gate.
#
#   npm run validate
#
# Everything that must pass before code is considered mergeable. Reads and
# writes only local resources; never contacts staging or production.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
pass() { printf '\033[1;32m✓\033[0m %s\n' "$1"; }

started=$(date +%s)

step "Environment safety guards";  npm run --silent test:guards
step "Lint";                       npm run --silent lint;      pass "lint"
step "Types";                      npm run --silent typecheck; pass "typecheck"
step "Unit tests";                 npm run --silent test:unit
step "Production build";           npm run --silent build >/dev/null; pass "build"
step "End-to-end (local, write-enabled)"; npm run --silent test:e2e:local

printf '\n\033[1;32mAll checks passed\033[0m in %ss\n\n' "$(( $(date +%s) - started ))"
