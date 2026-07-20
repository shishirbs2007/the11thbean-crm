# Runbooks

Procedures for running the café's CRM and recovering it when something breaks.
Each one is a sequence somebody can follow under pressure without thinking.

## Contents

- [Daily and weekly operation](#daily-rhythm)
- [Automations](#automations)
- [Consent](#consent)
- [Sending messages](#sending-messages)
- [Health checks](#health-checks)
- [Routine maintenance](#routine-maintenance)
- [Roles](#roles)
- [Backups](#backups)
- [Recovery scenarios](#recovery-scenarios)
- [Releasing a change](#releasing-a-change)
- [Rolling back](#rolling-back)

---

## Daily rhythm

The CRM is designed to be opened once at the start of a shift and once at the
end.

**Start of shift** — open `/briefing`. It answers who to welcome personally
today, what needs attention now, and what is worth doing if there is a moment.
Tasks are generated from records the café already keeps; nobody maintains a
list.

**End of shift** — write the handover on the same page. Keep it short. A
handover that takes ten minutes to read does not get read.

**Weekly** — open `/intelligence`. Anything outside its threshold appears under
"What needs a decision", with the recommended action and a link to the records
behind it.

## Automations

Every automation ships switched off. Turn one on at `/automations` after
reading what it does.

- **Run history** shows what each run found, acted on, skipped and failed.
- **Failures** are recorded per guest and the run continues. One bad row never
  stops the café's other guests being looked after.
- **Scheduling** is by interval, not clock time, so running the scheduler twice
  in a minute does no work the second time.

To drive automations on a schedule, call `run_due_automations()` from a cron,
a Supabase scheduled function, or the "Run everything that is due" button.

## Consent

Consent is per channel *and* per purpose. Permission to confirm a booking is
not permission to market. Purposes requiring an explicit opt-in refuse by
default — silence is never taken as a yes.

Consent is enforced inside `evaluate_audience` and `automation_candidates`, so
no screen or automation can route around it.

## Sending messages

No provider is configured out of the box. Until one is:

- Campaigns can be drafted, reasoned, reviewed and approved.
- Automations queue messages with status `queued`.
- Nothing is delivered, and the CRM says so rather than pretending.

To enable delivery: enable an adapter at `/integrations`, supply its
environment variables in Vercel, and redeploy.

## Health checks

| Check | Where |
| --- | --- |
| Application up | `GET /api/health` |
| Adapter health | `integration_adapters.health_status` |
| Automation failures | `/automations` → Failures |
| Unresolved service recovery | `/briefing` → Needs attention now |

## Routine maintenance

- **Recalculating health** — `select public.recalculate_customer_health(null);`
  Runs automatically on visit and order changes; only needed after a bulk import.
- **Regenerating today's tasks** — happens on every briefing load, and is
  idempotent.
- **Migrations** — `supabase db push --linked`. Always additive; never
  destructive to guest data.

## Roles

| Role | Can |
| --- | --- |
| `barista` | Read everything, complete hospitality tasks, record visits |
| `manager` | Everything above, plus campaigns, audiences, automations, communities |
| `admin` | Everything above, plus branches, integrations, staff roles |

Row-level security enforces this in the database, not only in the UI.


---

## Backups

Supabase takes automatic daily backups on paid plans. **The project is
currently on the free plan, where automated backup retention is limited.**
Until that changes, take a manual dump before any significant change:

```bash
supabase db dump --linked -f backup-$(date +%Y%m%d).sql
```

Store it outside the repository. It contains real guest data.

## Recovery scenarios

### The application is broken

```bash
vercel rollback
npm run test:smoke
```

The database is untouched. Recovery time: minutes.

### A migration caused a problem

Migrations are additive, so the previous application version continues to work
against the new schema. Roll the application back first, then write a forward
migration that corrects the problem.

Never edit an applied migration. Never `drop` guest data to undo a change.

### The database is lost or corrupted

```bash
# 1. Create a new Supabase project
# 2. Apply the full schema
supabase link --project-ref <new-ref>
supabase db push --linked --include-all
# 3. Restore data
psql "<connection-string>" -f backup-YYYYMMDD.sql
# 4. Point Vercel at the new project and redeploy
```

The schema is fully reproducible from `supabase/migrations/`. Only the data
needs a backup.

### Everything is lost

```bash
git clone https://github.com/shishirbs2007/the11thbean-crm.git
cd the11thbean-crm
./the11thbean-full-build.sh
```

This produces a complete, verified, working system with an empty database.
Restore data from backup as above.

## Verifying a recovery

```bash
npm run test:smoke                    # production, read-only
npm run test:e2e:local                # full behaviour, local
```

A recovery is not complete until the smoke suite passes.

## What is not backed up

- `.env.local` — regenerated by the build script
- Vercel environment variables — recorded in `docs/deployment.md`
- Integration credentials — held by their providers, never in this repository


---

## Releasing a change

```bash
npm run validate                 # guards, lint, types, unit, build, local E2E
git push origin staging
vercel deploy                    # hosted staging on the staging database
npm run test:e2e:staging         # write-enabled, against hosted staging
npm run verify:staging           # non-destructive staging checks
```

Then, and only as a deliberate act:

```bash
supabase db push --linked        # migrations BEFORE the deploy
vercel --prod
npm run test:smoke               # read-only production verification
```

Migrations go first. Every migration is additive, so new schema against old
code is safe; old schema against new code is not.

CI never promotes to production.

## Rolling back

**Application:**

```bash
vercel rollback
npm run test:smoke
```

The database is untouched. Recovery takes minutes.

**A bad migration:** roll the application back first. Because migrations are
additive, the previous version keeps working against the new schema. Then write
a *forward* migration that corrects the problem.

Never edit an applied migration. Never drop guest data to undo a change.
