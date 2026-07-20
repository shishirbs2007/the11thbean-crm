# Engineering handover

Written for whoever picks this up next, including me in six months.

---

## What exists

A hospitality operating system for one café, running in production at
https://the11thbean-crm.vercel.app.

It is not a sales CRM and should never become one. Its purpose is that staff
remember people: that Asha comes on Thursdays after badminton, wants a flat
white and the quiet corner table, and cannot have peanuts. Every feature earns
its place by helping somebody behind the counter recognise a guest, or helping
the café decide something.

**Working and in production:**

- Daily briefing — who to welcome today, what needs attention, shift handover
- Customer 360 with one unified timeline
- Intelligence inferred from records, not typed in
- Communities and events, with explained invitation suggestions
- Audiences and campaigns, with consent enforced in the database
- Business intelligence — 13 measures, each with trend, reason and next action
- Explainable recommendations with evidence and confidence
- An audited automation engine, everything shipped switched off
- Branches, ready for a second site without burdening the first

**Built but inert:** the messaging layer. Campaigns draft, reason, review and
approve; automations queue messages. **No provider adapter is implemented**, so
nothing is delivered. The default adapter refuses to send rather than
pretending — a café must never believe a message went out when it did not.

---

## How it works

### The one decision that explains everything

**Intelligence lives in SQL.** Scoring, audience selection, recommendations and
analytics are Postgres functions.

The reason is that the same question is asked from several places. "Who are the
lapsed regulars?" is asked by the briefing, by audience building, by the
automation engine and by the dashboard. One definition means one answer. Four
TypeScript implementations would eventually disagree, and nobody would notice
which was wrong.

TypeScript does presentation only: how a number is worded, how a list is
ordered for a human, what to call a confidence of 0.7. Nothing that decides.

### Registries, not hard-coded rules

| Registry | Governs |
| --- | --- |
| `hospitality_signals` | What makes a guest matter today |
| `audience_rules` | How guests are selected for messages |
| `business_metrics` | What the café watches, and its thresholds |
| `recommendation_types` | What the CRM suggests doing |

Each is a table. Adding a signal is an insert plus one `case` branch. Signals
and metrics can be switched off without a deployment, so a café that would
rather not rank guests by spend simply turns that off.

### Explainability is not decoration

Nothing is allowed to be opaque. Recommendations return why, evidence,
confidence and a suggested action. Audiences return a per-rule breakdown.
Metrics return trend, explanation and a drill-down path. Forecasts return their
method and sample size.

A member of staff who cannot check the reasoning cannot disagree with it, and
they should always be able to.

### There is deliberately no model

The recommendation engine is deterministic SQL. It cannot hallucinate, cannot
go stale, needs no credentials, and can be checked by hand. If narrative
generation is added later it belongs behind an adapter, and must never *decide*
— only word a decision already made.

### Safety is structural, not procedural

- Production project references are on a denylist every script consults. The
  guard **fails closed**.
- Staging lives in a **different Supabase account**; its token cannot see
  production at all.
- Write-enabled and read-only test suites live in separate directories that
  separate Playwright configs cannot cross.
- Consent is checked *inside* audience selection, not by its callers.

---

## How to extend it

**Add a hospitality signal:** insert into `hospitality_signals`, add a branch
to `hospitality_signal_strengths`. Nothing else changes.

**Add an audience rule:** insert into `audience_rules`, add a branch to
`audience_rule_members`. Campaigns, automations and previews pick it up.

**Add a business metric:** insert into `business_metrics` with a threshold and
drill-down path, add a fact to `business_period_facts`.

**Add an integration:** insert into `integration_adapters` with capabilities and
required environment variable *names*, implement `IntegrationAdapter`, register
it. No feature code changes — features resolve capabilities, never vendors.

**Add a page:** server component reading Supabase directly, server actions for
writes, `Section` for panels (it provides the accessible landmark the tests
rely on), `ErrorPanel` for query failures, the global toast for action
feedback. Do not add a success banner; that duplication was removed once
already.

**Rules that matter:**

- Migrations are additive and idempotent. Never edit an applied one.
- Run `npm run types:generate` after any migration or CI fails.
- Scope test assertions to your own fixtures, never to shared aggregates.

---

## How to recover from failure

| Situation | Action |
| --- | --- |
| Application broken | `vercel rollback && npm run test:smoke` |
| Bad migration | Roll back the app, then write a *forward* migration |
| Database lost | New project → `supabase db push --linked --include-all` → restore dump |
| Everything lost | `git clone` → `npm run bootstrap:local` → restore dump |
| Local confusion | `npm run reset:local && npm run validate` |

The schema is fully reproducible from `supabase/migrations/`. **Only the data
needs a backup**, and that is the weakest part of the system — see
`docs/runbooks.md`.

`docs/troubleshooting.md` lists every problem actually encountered and what it
turned out to be. Read it before diagnosing from first principles.

---

## Known limitations

**Functional:** no provider adapter, so nothing sends. No campaign template
editor or personalisation rendering. No audience preview screen. No staff
assignment UI. No table utilisation or inventory forecasting (no schema for
either). No AI-assisted summaries — needs an API key.

**Operational:** **no monitoring or alerting of any kind.** If production broke
at 6am the café would learn it from a guest. Backups rely on the free plan's
limited retention plus somebody remembering to dump manually.

**Scale:** `audience_rule_members` and `business_period_facts` have never been
profiled under load. Staff read-access is global rather than branch-scoped,
which is right for one café and wrong for a franchise.

**Security:** preview deployments are publicly reachable because hosted staging
tests need it and bypass tokens require a paid plan.

---

## Recommended next priorities

**1. Error tracking and uptime alerting.** The largest gap. Configuration, not
engineering, and it removes the highest-likelihood risk in the readiness
report.

**2. Backups you do not have to remember.** Guest records are the only
irreplaceable thing here and the least protected.

**3. One integration adapter, end to end.** Resend is simplest. It closes the
biggest functional gap and finally exercises `campaign_outcomes` against real
delivery data, which has only ever been tested with zero recipients.

**4. Profile, then materialise.** Not before. `docs/analytics.md` names the
candidates, their trigger conditions and refresh strategies. Any materialised
view must display its freshness — an aggregate whose age is invisible will
eventually be trusted when it should not be.

**5. Branch-scoped read policies,** before a second site opens rather than
after.

Everything else on the roadmap is genuinely optional. The café can run on what
exists today.

---

## A note on judgement

Six real defects were found by tests doing things a human would not have
thought to try: rebuilding the database from nothing, running a seed twice,
pointing the suite at a populated environment, reading a page as a screen
reader does.

The missing role grants meant the repository could not rebuild its own database
and nobody knew for weeks. The unlabelled dropdowns meant the CRM was unusable
without sight. Neither would have been caught by review.

When adding a feature, ask what would prove it works somewhere other than the
machine it was written on. That question has been worth more here than any
amount of careful reading.
