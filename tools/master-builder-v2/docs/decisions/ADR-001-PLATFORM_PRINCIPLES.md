# ADR-001 Platform Principles

## Status
Accepted

## Principles

1. Customer-first architecture.
2. Customer 360 is the source of truth.
3. External systems are integrations, not owners.
4. Every customer interaction becomes a timeline event.
5. Every module is independently installable.
6. Every schema change is migration-based.
7. Every feature is protected by RLS.
8. Every user action is auditable.
9. Every deployment is reversible.
10. Every release must pass automated validation before production.

## Consequences

- No direct database edits in production.
- No manual schema drift.
- No duplicated customer records.
- No module may bypass authentication or authorization.
