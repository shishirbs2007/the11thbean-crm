# Database

**76 tables and views · 47 functions · 147 row-level security policies · 25 migrations**

Generated from the live schema. The authoritative definition is
`supabase/migrations/`, applied in filename order. Regenerate with the
snippet at the foot of this file.

## Principles

- Migrations are **additive and idempotent**. Guest data is never dropped.
- Never edit an applied migration; write a forward one.
- Every table has RLS enabled. Policies call `current_app_role()` rather
  than trusting the client.
- Grants are part of the schema (`202607200500_role_grants.sql`), not part
  of a dashboard. Without them a rebuilt database rejects every write.
- `branch_id` is nullable everywhere; a single café never populates it.
- Consent is checked inside audience and automation selection, never by
  callers.

## Registries

Extended by inserting a row, not by rewriting code:

| Registry | Governs |
| --- | --- |
| `hospitality_signals` | What makes a guest matter today |
| `audience_rules` | How guests are selected for messages |
| `business_metrics` | What the café watches, and its thresholds |
| `recommendation_types` | What the CRM suggests doing |
| `consent_purposes` | What permission is being asked for |
| `integration_capabilities` | What an adapter can do |

## Tables and views

| Object | Kind | Columns |
| --- | --- | --- |
| `app_roles` | table | 4 |
| `audience_rules` | table | 8 |
| `audiences` | table | 12 |
| `audit_log` | table | 8 |
| `automation_run_items` | table | 7 |
| `automation_runs` | table | 11 |
| `branches` | table | 10 |
| `business_metrics` | table | 9 |
| `campaign_outcomes` | view | 9 |
| `communication_campaigns` | table | 23 |
| `communication_channel_preferences` | table | 12 |
| `communication_delivery_events` | table | 7 |
| `communication_frequency_limits` | table | 6 |
| `communication_messages` | table | 14 |
| `communication_provider_configs` | table | 8 |
| `communication_recipients` | table | 16 |
| `communication_suppressions` | table | 8 |
| `communication_templates` | table | 15 |
| `communities` | table | 10 |
| `community_health` | view | 9 |
| `community_memberships` | table | 6 |
| `consent_purposes` | table | 5 |
| `consents` | table | 8 |
| `customer_feedback` | table | 10 |
| `customer_health` | table | 22 |
| `customer_health_history` | table | 7 |
| `customer_hospitality_profiles` | table | 17 |
| `customer_item_history` | view | 7 |
| `customer_milestones` | table | 9 |
| `customer_notes` | table | 6 |
| `customer_preferences` | table | 9 |
| `customer_subscriptions` | table | 11 |
| `customer_tasks` | table | 12 |
| `customer_timeline` | table | 14 |
| `event_attendance_summary` | view | 11 |
| `event_registrations` | table | 9 |
| `events` | table | 17 |
| `external_identities` | table | 8 |
| `gift_cards` | table | 10 |
| `hospitality_automations` | table | 15 |
| `hospitality_signals` | table | 6 |
| `hospitality_tasks` | table | 14 |
| `household_addresses` | table | 15 |
| `household_members` | table | 9 |
| `household_preferences` | table | 13 |
| `households` | table | 17 |
| `important_dates` | table | 8 |
| `integration_adapters` | table | 13 |
| `integration_capabilities` | table | 3 |
| `integration_errors` | table | 8 |
| `integration_sync_runs` | table | 13 |
| `loyalty_accounts` | table | 10 |
| `loyalty_ledger` | table | 10 |
| `operational_checklist_items` | table | 7 |
| `operational_checklists` | table | 8 |
| `operational_rhythm` | view | 5 |
| `operational_run_items` | table | 6 |
| `operational_runs` | table | 10 |
| `order_items` | table | 9 |
| `people` | table | 18 |
| `person_relationships` | table | 10 |
| `person_tags` | table | 3 |
| `pet_species` | table | 3 |
| `pet_visit_history` | table | 5 |
| `pets` | table | 23 |
| `recommendation_types` | table | 6 |
| `referrals` | table | 6 |
| `relationship_types` | table | 5 |
| `saved_segments` | table | 8 |
| `segment_memberships` | table | 4 |
| `shift_handovers` | table | 7 |
| `staff_branches` | table | 4 |
| `tags` | table | 4 |
| `timeline_entries` | table | 12 |
| `visit_items` | table | 11 |
| `visits` | table | 26 |

## Functions

Intelligence lives here rather than in application code, so every question
has exactly one answer. See [architecture.md](architecture.md).

- `adapter_for_capability()`
- `add_customer_timeline_event()`
- `add_timeline_from_note()`
- `add_timeline_from_visit()`
- `advance_campaign_status()`
- `apply_loyalty_transaction()`
- `audience_rule_members()`
- `automation_candidates()`
- `branch_period_facts()`
- `business_period_facts()`
- `claim_first_admin()`
- `conversion_stories()`
- `crm_dashboard_signals()`
- `crm_global_search()`
- `current_app_role()`
- `current_branch_id()`
- `customer_taste_profile()`
- `drifting_regulars()`
- `evaluate_audience()`
- `event_invitation_candidates()`
- `executive_kpis()`
- `expected_guests_today()`
- `explain_audience()`
- `forecast_demand()`
- `generate_daily_hospitality_tasks()`
- `has_consent()`
- `hospitality_recommendations()`
- `hospitality_score()`
- `hospitality_signal_strengths()`
- `next_best_action()`
- `platform_overview()`
- `platform_touch_updated_at()`
- `recalculate_customer_health()`
- `record_adapter_health()`
- `record_communication_on_timeline()`
- `record_delivery_on_timeline()`
- `record_event_attendance()`
- `refresh_customer_health()`
- `refresh_customer_health_after_item()`
- `refresh_customer_health_after_visit()`
- `run_automation()`
- `run_due_automations()`
- `set_branch_default()`
- `set_updated_at()`
- `sync_updated_at()`
- `upcoming_important_dates()`
- `visible_branch_ids()`

## Regenerating this document

```bash
npm run reset:local     # rebuild from migrations
```

Then re-run the generator in `scripts/` or update the counts by hand. The
table list is derived, so it cannot drift from the schema silently.

