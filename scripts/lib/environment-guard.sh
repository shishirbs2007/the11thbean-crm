#!/usr/bin/env bash
#
# Environment safety.
#
# Every script that can write to a database sources this and calls
# require_non_production before doing anything. The guard fails closed: an
# unknown project reference is treated as production, not as safe.
#
# The denylist is the authority. A project reference on it can never be the
# target of a migration, reset, seed or destructive command from any script in
# this repository.


# Production. Never a valid target for anything in scripts/.
PRODUCTION_REFS=(
  "ehbkxldhajgcununyfat"   # the11thbean-crm — PRODUCTION
  "ycvjhwnbekavnnztrwjb"   # Aanu_Registry — unrelated project, also protected
)

guard_log()  { printf '\033[1;32m[guard]\033[0m %s\n' "$1"; }
guard_warn() { printf '\033[1;33m[guard]\033[0m %s\n' "$1" >&2; }
guard_fail() { printf '\033[1;31m[guard]\033[0m %s\n' "$1" >&2; exit 1; }

is_production_ref() {
  local candidate="${1:-}"
  [ -n "$candidate" ] || return 1

  local ref
  for ref in "${PRODUCTION_REFS[@]}"; do
    [ "$candidate" = "$ref" ] && return 0
  done

  return 1
}

is_production_url() {
  local url="${1:-}"
  [ -n "$url" ] || return 1

  local ref
  for ref in "${PRODUCTION_REFS[@]}"; do
    case "$url" in
      *"$ref"*) return 0 ;;
    esac
  done

  return 1
}

is_loopback_url() {
  case "${1:-}" in
    http://127.0.0.1:*|http://localhost:*) return 0 ;;
    *) return 1 ;;
  esac
}

# Refuses unless the target is demonstrably local or staging.
#
#   require_non_production <ref-or-url> <operation-description>
#
# An empty or unrecognised target fails. There is no "probably fine" path.
require_non_production() {
  local target="${1:-}"
  local operation="${2:-this operation}"

  if [ -z "$target" ]; then
    guard_fail "Refusing $operation: no target was given. The guard fails closed."
  fi

  if is_production_ref "$target" || is_production_url "$target"; then
    guard_fail "Refusing $operation: '$target' is a protected production project."
  fi

  if is_loopback_url "$target"; then
    guard_log "Target is the local stack. Safe for $operation."
    return 0
  fi

  # A hosted target must be positively declared as staging.
  if [ "${CRM_ENVIRONMENT:-}" != "staging" ]; then
    guard_fail \
      "Refusing $operation against hosted project '$target': CRM_ENVIRONMENT is not 'staging'. Set it deliberately."
  fi

  guard_log "Target '$target' is staging. Safe for $operation."
  return 0
}

# Confirms a Supabase project reference looks like one before it is used
# anywhere. Catches a pasted URL or a truncated value early.
require_valid_ref() {
  local ref="${1:-}"

  if ! printf '%s' "$ref" | grep -qE '^[a-z]{20}$'; then
    guard_fail "'$ref' is not a valid Supabase project reference (expected 20 lowercase letters)."
  fi
}
