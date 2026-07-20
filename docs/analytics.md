# Analytics architecture

## One source of truth

Nothing in the analytics layer recomputes a fact that already exists. Each
number traces back to exactly one owner:

| Fact | Owner |
| --- | --- |
| Revenue, visits, average spend | `visits` |
| Relationship, churn, lifetime value | `customer_health` |
| Community activity | `community_health` |
| Event turnout | `event_attendance_summary` |
| Campaign results | `campaign_outcomes` |
| Hospitality workload | `hospitality_tasks` |
| Guest readiness signals | `hospitality_signal_strengths` |

If a metric needs a new fact, it is added to its owner, not calculated a
second time in a report.

## Decision support, not reporting

`executive_kpis` returns four things for every metric: the value, the trend
against the previous period of equal length, an explanation, and a recommended
action. A metric that cannot produce all four does not belong on the
dashboard.

Thresholds live in `business_metrics.healthy_above`, so staff can read why the
CRM is worried rather than guessing at a hidden rule. Changing what "healthy"
means is an update, not a deployment.

## Drill-down

`business_metrics.drill_down_path` records where the underlying rows live.
Every card on the dashboard links to it. No number is a dead end.

## Forecasting

`forecast_demand` is a moving average of the same weekday over the previous
twelve weeks. This is deliberate:

- A café owner can check it by hand.
- It degrades honestly — `sample_weeks` is returned with every row, and the UI
  labels anything under three weeks as a rough guess.
- It has no training step to go stale.

A model that cannot be checked is a model that should not drive staffing.
Anything more sophisticated should still return its method and its sample size.

## Performance and materialization

**Nothing is materialized today.** Every analytic is a function or a view over
indexed columns, and at café scale they return in milliseconds. A stale
aggregate is worse than a slow honest one.

Materialization becomes justified when any of the following is true:

| Trigger | What to materialize | Refresh strategy |
| --- | --- | --- |
| `visits` exceeds ~1M rows | `operational_rhythm` | `REFRESH MATERIALIZED VIEW CONCURRENTLY` nightly; the view already covers a rolling 90 days |
| `executive_kpis` exceeds ~500ms | `business_period_facts` per period length | Hourly refresh keyed on `(period_days, date_trunc('hour', now()))` |
| More than ~20 saved audiences | `explain_audience` counts | Recompute on audience write plus a nightly sweep; show the computed-at time in the UI |
| Multi-branch rollout | all of the above, partitioned by branch | Per-branch refresh so one busy café cannot delay another |

Any materialization added must record its refresh cadence in this table and
display its freshness in the UI. An aggregate whose age is invisible will
eventually be trusted when it should not be.

## Multi-branch readiness

The analytics functions take their scope from the rows they read rather than
from a hard-coded café. When branch scoping arrives, the predicate belongs
inside these functions:

- `business_period_facts`
- `expected_guests_today`
- `event_invitation_candidates`
- `audience_rule_members`
- `drifting_regulars`

Adding it around them instead — filtering results after the fact — would scan
every branch's data to answer a question about one, which is the failure mode
to avoid.
