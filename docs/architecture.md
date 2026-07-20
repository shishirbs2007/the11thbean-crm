# Architecture

## What this system is for

The 11th Bean CRM exists to help café staff remember people. Not transactions —
people. Every architectural decision below serves that: intelligence is derived
rather than typed in, recommendations explain themselves so staff can disagree
with them, and nothing acts on a guest without a record of why.

## Shape

- **Next.js 16, App Router, server components.** Pages read Supabase directly
  through a request-scoped client. There is no API layer between the page and
  the database, because there is no second consumer to justify one.
- **Server actions for writes.** Every mutation is a server action that
  redirects with a flash message. No client-side state management.
- **Supabase (Postgres) for everything else.** Auth, row-level security, and —
  importantly — the intelligence itself.

## Intelligence lives in SQL

This is the central decision. Scoring, audience selection, recommendations and
analytics are Postgres functions, not application code.

**Why:** the same question gets asked from several places. "Who are the lapsed
regulars?" is asked by the daily briefing, by audience building, by the
automation engine and by the executive dashboard. With the logic in SQL there
is exactly one answer. With it in TypeScript there would eventually be four
that disagreed.

**What lives in TypeScript:** presentation. How a number is worded, how a list
is ordered for a human, what to call a confidence of 0.7. Nothing that decides
anything.

## Registries, not hard-coded rules

Four registries make the system extensible without a rewrite:

| Registry | Governs | Extending it |
| --- | --- | --- |
| `hospitality_signals` | What makes a guest matter today | Insert a row, add a `case` branch |
| `audience_rules` | How guests are selected for messages | Insert a row, add a `case` branch |
| `business_metrics` | What the café watches, and its thresholds | Insert a row, add a fact |
| `recommendation_types` | What the CRM suggests doing | Insert a row, add a `union all` branch |

Signals and metrics can also be switched off without a deployment, so a café
that would rather not rank guests by spend simply turns that signal off.

## The unified timeline

`timeline_entries` is the single history for a person. Visits, events,
communications, deliveries, replies and automation actions all write to it.
There is no separate communication history to go and look at.

This was enforced the hard way: two triggers were writing duplicate entries for
every message, and the older one was removed rather than left to diverge.

## Explainability

No recommendation, audience or metric is allowed to be opaque:

- Recommendations return **why**, **evidence**, **confidence** and a
  **suggested action**.
- Audiences return a per-rule breakdown — "237 guests · 81 attended Book Club,
  65 not seen in 30 days".
- Metrics return trend, explanation, recommended action and a drill-down path.
- Forecasts return their method and sample size, and the UI calls three weeks
  a rough guess.

Confidence reflects how much evidence exists, not how sure the code feels.

## No model

There is deliberately no LLM in the recommendation path. Everything is
deterministic SQL over records the café already keeps. It cannot hallucinate,
cannot go stale, needs no credentials, and a member of staff can check it.

If narrative generation is added later, it belongs behind the same adapter
pattern as messaging providers, and must never be the thing that *decides* —
only the thing that words a decision already made and explained.

## Integrations are capabilities, not vendors

The CRM asks for `email.send`, never for a company. Adapters declare
capabilities; configuration decides which one carries them. Every adapter ships
disabled, and one enabled without its credentials is treated as absent rather
than failing at send time. No credentials are stored in the database.

## Multi-branch

Branches exist without imposing themselves on a single café. Every row has a
default branch, `branch_id` is nullable everywhere, and staff with no branch
assignment see everything — so a one-site deployment carries no branch
administration at all.

The scoping predicate belongs **inside** the functions that scan people and
visits, never around them. Filtering afterwards would scan every branch to
answer a question about one.

## Where to be careful

- `audience_rule_members` is one function with a `case` over all rules, so
  Postgres filters `people` then evaluates. This is the deliberate cost of
  having one definition per rule.
- `business_period_facts` runs many correlated subqueries in one statement. It
  is the most expensive query in the application and the first materialization
  candidate. See `docs/analytics.md`.
- Nothing is materialized today. That is a choice, not an oversight: an
  aggregate whose age is invisible will eventually be trusted when it should
  not be.
