# Release log

Every production release, what it contained, and how to undo it.

## v1.0.0 — 20 July 2026

**Commit:** `87b91c7` (branch `staging`)
**Deployment:** https://the11thbean-qxcn62lfy-shishirbs2026.vercel.app
**Rolls back to:** https://the11thbean-15rlxcqed-shishirbs2026.vercel.app

### What was promoted

The first production release since the CRM's scaffolding. Everything from
Phase 2 through Phase 8, plus the operational foundations built alongside them.

- **Customer intelligence** — favourites inferred from order history,
  relationship, community and referral scoring
- **Communities and events** — explained invitation suggestions, attendance
  written to the guest's timeline, capacity as a hospitality constraint
- **Daily briefing** — who to welcome today, what needs attention, shift
  handover, an eleven-signal registry
- **Audiences and campaigns** — self-explaining selection, consent enforced
  inside the selection functions, an enforced campaign lifecycle
- **Business intelligence** — thirteen measures each carrying trend, reason,
  recommended action and a drill-down path
- **Recommendations and automation** — explainable, evidence-carrying, audited,
  everything shipped switched off
- **Branches and integration adapters** — capability-based, no vendor names in
  feature code
- **Order import** — the till can now feed the CRM instead of the staff
- **Operational monitoring** at `/system`
- **Accessibility** — all 49 dropdowns given accessible names

### Migrations applied

Three, all purely additive. The only `drop` statements are
`if exists` idempotency guards immediately followed by recreation.

| Migration | Adds |
| --- | --- |
| `202607201800_order_import` | `import_runs`, `import_run_items`, `visits.external_order_id`, `import_orders()`, `match_guest_for_import()` |
| `202607201900_system_health` | `system_incidents`, `record_incident()`, `system_health_checks()` |
| `202607202000_import_match_reasons` | `match_guest_detail()`, distinguishable unmatched reasons |

Production migration history: **28 applied, latest `202607202000`, none pending.**

### Backup

```
/Users/shishir/crm-backups/production-20260720-230457
```

26 tables, 150 rows, JSON per table, taken immediately before the release and
verified parseable. Restore with:

```bash
# For each table, POST the file back through PostgREST:
curl -X POST "https://ehbkxldhajgcununyfat.supabase.co/rest/v1/<table>" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" --data-binary @<table>.json
```

Restore parents before children: `branches` → `people` → `visits` →
everything else.

### Rollback

**Application:**

```bash
vercel rollback https://the11thbean-15rlxcqed-shishirbs2026.vercel.app
npm run test:smoke
```

**Database:** no rollback needed. All three migrations are additive, so the
previous application version runs unchanged against the new schema. If a
migration must be reversed, write a forward migration; never edit an applied
one.

### Verification

| Check | Result |
| --- | --- |
| Pre-production gate | passed in 108s |
| Unit tests | 158 passed |
| Environment guards | 12 passed |
| E2E local (write-enabled) | 56 passed |
| E2E hosted staging (write-enabled) | 56 passed |
| Staging verification | 24 passed |
| Production smoke | 61 passed |
| `/system` health checks in production | 8 of 8 ok |
| Import pipeline in production | verified, zero residue |
| Data intact vs backup | every table unchanged |
| Synthetic data in production | none |

## v1.1.0 — 21 July 2026

**Commit:** `5b14d53` (branch `staging`)
**Deployment:** https://the11thbean-3eph3u21e-shishirbs2026.vercel.app
**Rolls back to:** https://the11thbean-qxcn62lfy-shishirbs2026.vercel.app (v1.0.0)

### What was promoted

**Arrival** — the counter interaction that recognises a guest in one move.

- Live search with no page navigation, debounced
- Enter welcomes the top match; a scanned id resolves straight to the guest
- Inline welcome card, allergy-first, with the next best action
- Quick-add a new guest from a name and one contact detail
- Duplicate-proof, loss-proof on a dropped connection

### Migrations applied

Two, purely additive, no `drop` statements.

| Migration | Adds |
| --- | --- |
| `202607202100_arrival` | `arrival_context()`, `record_arrival()`, `quick_add_guest()`, `arrivals_today` view |
| `202607202200_first_visit_at_counter` | first-visit flag correct at the moment of arrival |

Applied through the Management API query endpoint (the CLI push hung on a
keychain prompt) and recorded in `supabase_migrations.schema_migrations`.
Production history: latest `202607202200`.

### Backup

```
/Users/shishir/crm-backups/production-20260721-094705-pre-v1.1.0
```

26 tables, 150 rows, verified parseable. Restore method in the v1.0.0 entry.

### Rollback

```bash
vercel rollback https://the11thbean-qxcn62lfy-shishirbs2026.vercel.app
npm run test:smoke
```

Database needs no rollback: both migrations are additive.

### Verification

| Check | Result |
| --- | --- |
| Pre-production gate | passed in 142s |
| E2E hosted staging | 66 passed |
| Production smoke | 63 passed |
| Arrival in production (read-only) | card returns, no data written |
| Data intact vs backup | every table unchanged |
