# Deployment guide

## Environments

| Environment | Application | Supabase | Data |
| --- | --- | --- | --- |
| Local | `next start` on 3100 | local stack on 54321 | disposable |
| Preview | Vercel preview | production (read-only use) | not written to |
| Production | Vercel production | production | real guest records |

## First-time setup from a clean checkout

```bash
git clone https://github.com/shishirbs2007/the11thbean-crm.git
cd the11thbean-crm
./the11thbean-full-build.sh
```

That installs dependencies, starts a local Supabase stack, applies every
migration, writes `.env.local`, seeds the staff user, and runs the full
verification suite. It never touches production.

## Deploying

Follow `docs/workflow.md`. In short:

```bash
npm run lint && npm run typecheck && npm run test:unit && npm run build
npm run test:e2e:local          # write-enabled, local only
supabase db push --linked       # migrations first
vercel --prod
npm run test:smoke              # read-only production verification
```

**Migrations go before the deploy.** Every migration is additive and idempotent,
so a new schema against old code is safe; old schema against new code is not.

## Environment variables

Required in Vercel Production:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is currently absent from Vercel. It is needed for
the authenticated smoke suite in CI; the application itself does not require it
at runtime.

Optional, per integration adapter — see `integration_adapters.required_env`
for the authoritative list.

## Rollback

Application: `vercel rollback` or promote a previous deployment.

Database: migrations are additive, so rolling back the application is safe
without touching the schema. If a migration must be reversed, write a new
forward migration that undoes it rather than editing history.
