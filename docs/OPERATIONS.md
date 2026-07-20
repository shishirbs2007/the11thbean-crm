# Operations handbook

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
