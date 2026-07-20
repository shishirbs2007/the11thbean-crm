# The 11th Bean CRM Roadmap

This CRM exists to help café staff remember people, not transactions. Every
phase below is judged by whether it improves hospitality: whether it helps
someone behind the counter greet a guest by name, remember their usual, and
know why they love the place.

Intelligence is built automatically. Where a fact can be inferred from what the
café already records, staff are never asked to type it in.

## Phase 1: Foundation — complete

- Authentication and staff roles
- Dashboard
- Customer 360 foundation
- Customer management, visits and households
- Communities and events
- Loyalty
- Communications
- Operations
- Integrations foundation
- Audit
- Search

## Phase 2: Customer Intelligence

- Health score, relationship score and churn risk
- Lifetime value, average ticket and visit frequency
- Favourite visit day and favourite time
- Favourite drinks and food, inferred from order history
- Community engagement and referral impact
- Hospitality suggestions
- Customer timeline, journey and relationship graph
- Smart search and smart segments

## Phase 3: Communities & Events

- Community lifecycle and membership management
- Event planning, capacity and registration
- Attendance tracking and follow-up
- Community-driven invitation targeting
- Post-event hospitality actions

## Phase 4: Hospitality Operating System

- Seating and table preferences
- Allergy and dietary safety surfacing
- Daily service briefings for staff
- Guest recognition on arrival
- Milestones, family and pet context
- Operational checklists and runs

## Phase 5: Marketing & Communications

- Campaign engine
- WhatsApp and email channels
- Consent-aware audience building
- Event and milestone automation
- Message templates and personalisation

## Phase 6: Business Intelligence

- Revenue, retention and cohort reporting
- Profitability and forecasting
- Community and event contribution analysis
- Referral attribution
- Operational dashboards

## Phase 7: AI & Automation

Answering the questions staff actually ask:

- Who hasn't visited recently?
- Who should be invited to this event?
- Who usually comes after badminton?
- Which families have children?
- Who prefers decaf?
- Who always orders oat milk?
- Who is likely to churn?
- Who should staff greet personally today?

## Phase 8: Integrations & Multi-Branch

- PetPooja point-of-sale synchronisation
- Provider-neutral integration ledger
- Multi-branch data model and scoping
- Cross-branch reporting
- Branch-level staff permissions

## Environments

| Environment | Vercel | Supabase | Tests |
| --- | --- | --- | --- |
| Development | local | staging | `test:unit` |
| Preview | preview deployment | staging | `test:e2e:staging` (write-enabled) |
| Production | production deployment | production | `test:public`, `test:auth:smoke` (read-only) |

Write-enabled end-to-end tests never run against production. See
`docs/WORKFLOW.md` for the full delivery sequence.
