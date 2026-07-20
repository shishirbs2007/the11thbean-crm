# Database schema

Generated from the live schema. The authoritative definition is
`supabase/migrations/`, applied in filename order.

**76 tables and views · 47 functions · 147 row-level security policies**

Every table has RLS enabled. Staff read broadly; managers and admins write.

## Tables and views

| Object | Columns |
| --- | --- |
| `app_roles` | 4 |
| `audience_rules` | 8 |
| `audiences` | 12 |
| `audit_log` | 8 |
| `automation_run_items` | 7 |
| `automation_runs` | 11 |
| `branches` | 10 |
| `business_metrics` | 9 |
| `campaign_outcomes` | 9 |
| `communication_campaigns` | 23 |
| `communication_channel_preferences` | 12 |
| `communication_delivery_events` | 7 |
| `communication_frequency_limits` | 6 |
| `communication_messages` | 14 |
| `communication_provider_configs` | 8 |
| `communication_recipients` | 16 |
| `communication_suppressions` | 8 |
| `communication_templates` | 15 |
| `communities` | 10 |
| `community_health` | 9 |
| `community_memberships` | 6 |
| `consent_purposes` | 5 |
| `consents` | 8 |
| `customer_feedback` | 10 |
| `customer_health` | 22 |
| `customer_health_history` | 7 |
| `customer_hospitality_profiles` | 17 |
| `customer_item_history` | 7 |
| `customer_milestones` | 9 |
| `customer_notes` | 6 |
| `customer_preferences` | 9 |
| `customer_subscriptions` | 11 |
| `customer_tasks` | 12 |
| `customer_timeline` | 14 |
| `event_attendance_summary` | 11 |
| `event_registrations` | 9 |
| `events` | 17 |
| `external_identities` | 8 |
| `gift_cards` | 10 |
| `hospitality_automations` | 15 |
| `hospitality_signals` | 6 |
| `hospitality_tasks` | 14 |
| `household_addresses` | 15 |
| `household_members` | 9 |
| `household_preferences` | 13 |
| `households` | 17 |
| `important_dates` | 8 |
| `integration_adapters` | 13 |
| `integration_capabilities` | 3 |
| `integration_errors` | 8 |
| `integration_sync_runs` | 13 |
| `loyalty_accounts` | 10 |
| `loyalty_ledger` | 10 |
| `operational_checklist_items` | 7 |
| `operational_checklists` | 8 |
| `operational_rhythm` | 5 |
| `operational_run_items` | 6 |
| `operational_runs` | 10 |
| `order_items` | 9 |
| `people` | 18 |
| `person_relationships` | 10 |
| `person_tags` | 3 |
| `pet_species` | 3 |
| `pet_visit_history` | 5 |
| `pets` | 23 |
| `recommendation_types` | 6 |
| `referrals` | 6 |
| `relationship_types` | 5 |
| `saved_segments` | 8 |
| `segment_memberships` | 4 |
| `shift_handovers` | 7 |
| `staff_branches` | 4 |
| `tags` | 4 |
| `timeline_entries` | 12 |
| `visit_items` | 11 |
| `visits` | 26 |

## Functions

Intelligence lives here rather than in application code, so every question
has exactly one answer. See `docs/architecture.md`.

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

## Conventions

- Migrations are **idempotent** and **additive**. Guest data is never dropped.
- `branch_id` is nullable everywhere; a single café never populates it.
- Consent is checked inside audience and automation selection, never by callers.
- Registries (`hospitality_signals`, `audience_rules`, `business_metrics`,
  `recommendation_types`) are extended with rows, not rewrites.

