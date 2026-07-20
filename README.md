# The 11th Bean CRM

A hospitality operating system for a café in Basavanagudi, Bengaluru.

This is not a sales CRM. It exists so that staff can remember people — that
Asha comes on Thursdays after badminton, wants a flat white and the quiet
corner table, and cannot have peanuts. Every feature is judged by whether it
helps somebody behind the counter recognise a guest, or helps the café decide
something.

## Getting started

One command, from a clean checkout:

```bash
git clone https://github.com/shishirbs2007/the11thbean-crm.git
cd the11thbean-crm
npm run bootstrap:local
```

That checks prerequisites, installs dependencies, starts a local Supabase
stack, applies every migration, writes `.env.local`, seeds the staff user, and
runs the full verification suite. It never touches production.

Then:

```bash
npm run dev        # http://localhost:3000
```

Sign in as `bean@the11thbean.com`. Magic-link emails are captured locally by
Mailpit at http://127.0.0.1:54324 rather than delivered.

**Requires:** Node 20+, Docker, the Supabase CLI, and `jq`.

## Commands

| Command | Does |
| --- | --- |
| `npm run bootstrap:local` | Build everything from a clean checkout |
| `npm run reset:local` | Rebuild the local database and reseed it |
| `npm run validate` | The full gate: guards, lint, types, unit, build, E2E |
| `npm run dev` | Development server |
| `npm run bootstrap:staging` | Provision or refresh hosted staging |
| `npm run verify:staging` | Non-destructive staging checks |
| `npm run test:e2e:staging` | Write-enabled suite against hosted staging |
| `npm run test:smoke` | Read-only production verification |
| `npm run types:generate` | Regenerate database types after a migration |

`npm run validate` is the gate. If it passes, the change is mergeable.

## Environments

| Environment | Application | Supabase | Data |
| --- | --- | --- | --- |
| Local | `next dev` | local stack | disposable |
| Staging | Vercel Preview (`staging`) | `mirlfxruneqcgrwpqzvp` | synthetic only |
| Production | Vercel Production (`main`) | `ehbkxldhajgcununyfat` | real guest records |

Staging lives in a **different Supabase account** from production. Its access
token cannot see the production project at all.

Write-enabled tests can never run against production. The guard in
`tests/e2e/support/environment.ts` fails closed and is covered by
`npm run test:guards`.

## How it is built

Next.js 16 App Router with server components, reading Supabase directly. Server
actions for writes. No API layer, no client state management.

**The intelligence lives in SQL.** Scoring, audience selection, recommendations
and analytics are Postgres functions, not application code, because the same
question gets asked from several places and there should be exactly one answer.
TypeScript handles presentation only.

Four registries make it extensible by inserting a row rather than rewriting:
`hospitality_signals`, `audience_rules`, `business_metrics`,
`recommendation_types`.

See [docs/architecture.md](docs/architecture.md).

## What it does

- **Daily briefing** — who to welcome today, what needs attention, shift handover
- **Customer 360** — visits, preferences, family, pets, milestones, one timeline
- **Inferred intelligence** — favourite drinks from order history, not data entry
- **Communities and events** — who to invite, and why, with attendance
- **Audiences and campaigns** — self-explaining selection, consent enforced in SQL
- **Business intelligence** — 13 measures, each with trend, reason and next action
- **Recommendations** — explainable, with evidence and confidence, no model
- **Automations** — audited, failure-isolated, all shipped switched off

## Documentation

| | |
| --- | --- |
| [architecture.md](docs/architecture.md) | How it is put together and why |
| [database.md](docs/database.md) | Schema, generated from the live database |
| [deployment.md](docs/deployment.md) | Environments and how to ship |
| [workflow.md](docs/workflow.md) | The release flow |
| [testing.md](docs/testing.md) | Suites, the write guard, writing tests |
| [runbooks.md](docs/runbooks.md) | Operating and recovering the system |
| [troubleshooting.md](docs/troubleshooting.md) | Problems actually encountered |
| [security.md](docs/security.md) | Threat model, RLS, consent, secrets |
| [analytics.md](docs/analytics.md) | Metric ownership and materialisation |
| [integrations.md](docs/integrations.md) | The adapter contract |

## Contributing

1. Branch from `staging`
2. `npm run validate`
3. Push, deploy a preview, `npm run test:e2e:staging`
4. Promotion to production is a deliberate human act, never CI

Migrations are additive and idempotent. Never edit one that has been applied;
write a forward migration instead.
