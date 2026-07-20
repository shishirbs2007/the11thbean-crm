# Production readiness report

Assessed 20 July 2026, against the `staging` branch at commit `2afeb39`.

**Verdict: ready for a single café in production, with three caveats named
under Risk.** It is not ready for franchise scale, and the messaging features
are structurally complete but functionally inert.

---

## Architecture

**Green.**

Next.js 16 App Router, server components reading Supabase directly, server
actions for writes. No API layer and no client state management, which is
correct for one consumer and would be wrong for several.

The load-bearing decision is that **intelligence lives in SQL**. The same
question — "who are the lapsed regulars?" — is asked by the daily briefing,
audience building, the automation engine and the executive dashboard. One
definition means one answer. In TypeScript there would eventually be four that
disagreed.

Four registries make the system extensible by inserting a row: signals,
audience rules, business metrics, recommendation types. Adding a hospitality
signal is an insert plus one `case` branch.

*Concern:* `audience_rule_members` is a single function with a `case` over all
rules, so Postgres filters `people` then evaluates rather than using an index
per branch. This is the deliberate cost of one definition per rule, and the
first thing to profile at scale.

## Database

**Green.**

76 tables and views, 47 functions, 147 RLS policies, 25 migrations. Additive
and idempotent throughout. CI proves a blank database can be rebuilt from the
migration history and that applying twice is safe.

That check exists because it was once false: grants were missing from the
migrations and only present because the production project received them at
provisioning. The schema was not reproducible for weeks and nobody knew.

*Concern:* no materialised views. Deliberate — a stale aggregate whose age is
invisible is worse than a slow honest one. `docs/analytics.md` records the
exact trigger conditions and refresh strategy for each candidate.

## Security

**Amber.**

Strong: RLS on every table with role-based policies; consent enforced *inside*
audience and automation selection so no caller can forget; the production
denylist that fails closed; staging in a separate Supabase account whose token
cannot see production at all; no secrets in the database or repository.

Weak:

- **Vercel preview deployments are publicly reachable.** SSO was disabled so
  hosted staging tests could run. Staging holds only synthetic data, but the
  URL is not secret.
- **Staff can read all guest records.** Right for one café, wrong for a
  franchise.
- Two moderate advisories in Next's bundled `postcss`, unfixable without a
  major downgrade.

## Performance

**Green for current scale, unproven beyond it.**

Every analytic is a function or view over indexed columns, returning in
milliseconds at café volumes. The executive dashboard renders 13 KPIs, a
7-day forecast, drifting regulars and the trading rhythm in one page load.

*Concern:* `business_period_facts` runs eleven correlated subqueries in one
statement and is the most expensive query in the application. `operational_rhythm`
rescans 90 days of visits on every dashboard load. Both are documented
materialisation candidates. **Neither has been profiled under load**, because
there is no load to profile — production has almost no data yet.

## Accessibility

**Green, recently.**

All 49 dropdowns were unlabelled until this pass — the CRM was unusable with a
screen reader on any page with a form. Now every control has an accessible
name, every page has exactly one `h1` and a `main` landmark, images carry alt
text, and nothing scrolls sideways at 390px.

Covered by `tests/e2e/lifecycle/accessibility.spec.ts`, which runs against
hosted staging.

*Not yet checked:* colour contrast, keyboard-only navigation through the whole
app, and focus management after server actions.

## Disaster recovery

**Amber.**

The system rebuilds from the repository in minutes: `npm run bootstrap:local`
produces a complete verified instance, and the schema is fully reproducible
from migrations. Application rollback is `vercel rollback`.

*Concern:* **backups are the weak link.** The Supabase project is on the free
plan with limited automated retention. Guest records are the only
irreplaceable thing in the system and they are the least protected. Manual
dumps are documented but depend on somebody remembering.

## Monitoring

**Red.**

There is effectively none. `/api/health` returns liveness. Adapter health and
automation failures are visible in the UI if somebody looks.

There is no alerting, no error tracking, no uptime monitoring and no
notification when an automation fails. If production broke at 6am, the café
would find out from a guest.

This is the largest gap in the report.

## Technical debt

| Item | Severity |
| --- | --- |
| No error tracking or alerting | High |
| Backup retention on the free plan | High |
| No load profiling of the analytics layer | Medium |
| Preview deployments publicly reachable | Medium |
| Staff read-access is global, not branch-scoped | Medium (High at franchise) |
| `postcss` advisories via Next | Low |
| Coverage threshold at 20% | Low — most logic is SQL, exercised by E2E |

## Remaining roadmap

**Phase 7 — AI and Automation:** recommendations, next-best-action and the
automation engine are complete. AI-*assisted* summaries are not built and need
an LLM API key.

**Phase 8 — Integrations and Multi-Branch:** the branch entity, branch-aware
facts and the adapter registry exist. **No concrete adapter is implemented**,
so nothing can send. Branch-aware permissions and reporting are partial.

**Gaps carried forward:** campaign send pipeline, template editor,
personalisation tokens, audience membership preview, staff assignment UI, table
utilisation, inventory forecasting, staff-impact-on-loyalty analysis, community
timeline panel.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Guest data lost with no usable backup | Low | **Severe** | Upgrade the Supabase plan, or automate dumps |
| Production breaks unnoticed | **Medium** | High | Add error tracking and uptime alerting |
| Analytics degrade as data grows | Medium | Medium | Profile, then materialise per `analytics.md` |
| Someone finds a preview URL | Low | Low | Synthetic data only; re-enable protection |
| A test writes to production | **Very low** | Severe | Guard fails closed, separate account, 12 tests |
| Message sent without consent | **Very low** | High | Consent enforced inside selection functions |

**The three caveats:** no monitoring, fragile backups, and unprofiled
analytics. None blocks a single café going live. All three become serious the
moment the café depends on this daily or a second site opens.

**What I would do first:** error tracking and uptime alerting, then backups.
Both are configuration, not engineering, and together they remove the two
highest-impact risks in the table.
