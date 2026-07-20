# Delivery workflow

Feature work is never deployed to production before it has been verified
end to end. The sequence below is the only supported path to production.

## Environment map

| Environment | Application | Supabase project | Data |
| --- | --- | --- | --- |
| Local | `next start` on 3100 | local stack on 54321 | disposable |
| Staging | Vercel Preview (`staging` branch) | `mirlfxruneqcgrwpqzvp` (separate account) | synthetic only |
| Production | Vercel Production (`main`) | `ehbkxldhajgcununyfat` | real guest records |

The staging Supabase project lives in a **different Supabase account** from
production. Its access token cannot see the production project at all, so a
misconfigured staging command has nothing to hit.

## Release flow

```
feature branch
  → npm run lint / typecheck / test:unit / test:guards / build
  → npm run test:e2e:local          write-enabled, local stack
  → merge to staging
  → vercel deploy                   hosted preview, staging database
  → npm run test:e2e:staging        write-enabled, hosted staging
  → npm run verify:staging          non-destructive staging checks
  → explicit human promotion to production
  → supabase db push --linked       production migrations
  → vercel --prod
  → npm run test:smoke              read-only production verification
```

CI never deploys production. Promotion is always a deliberate human action.

## Adding a route to the production smoke suite

The smoke suite verifies **production**. A new route belongs in it only once
production actually serves it, so the order is:

1. Build and verify the route on staging
2. Promote to production
3. Add the route to `tests/e2e/smoke/` in the same change as the promotion

Adding it earlier turns the suite red for a reason that has nothing to do with
production health, which trains people to ignore it.

**Awaiting promotion:** `/system` (operational monitoring).

## Test suites

| Script | Target | Writes |
| --- | --- | --- |
| `npm run test:unit` | none | no |
| `npm run test:public` | production | no |
| `npm run test:auth:smoke` | production | no |
| `npm run test:smoke` | production | no |
| `npm run test:e2e:local` | local app + local Supabase | yes |
| `npm run test:e2e:staging` | Preview + staging | yes |
| `npm run test:guards` | none | no |
| `npm run validate` | local only | yes |

`test:public` and `test:auth:smoke` are smoke tests. They confirm
availability, authentication, route rendering and critical read operations.
They must never create, edit or delete business data.

`test:e2e:staging` exercises the full customer, visit, loyalty, event and
communication lifecycles. It creates uniquely identified fixtures and removes
them afterwards, and only ever runs against staging.

## Running the local regression

```bash
npm run test:e2e:local
```

Requires Docker. The script starts the local Supabase stack if it is not
already running, applies any pending migrations, ensures the synthetic staff
user exists with the admin role, builds the application against local Supabase
and runs the lifecycle suite.

## Running the staging regression

```bash
PLAYWRIGHT_BASE_URL="https://<preview-deployment>.vercel.app" \
CRM_E2E_ALLOW_WRITES=true \
CRM_E2E_ENVIRONMENT=staging \
npm run test:e2e:staging
```

## The production-write guard

Every write-enabled suite refuses to start unless all three of the following
hold:

1. `CRM_E2E_ALLOW_WRITES` is exactly `true`
2. `CRM_E2E_ENVIRONMENT` is `local` or `staging`
3. `NEXT_PUBLIC_SUPABASE_URL` is not the production project

Setting both flags while leaving production credentials in place still
refuses. `npm run test:guards` covers that case explicitly.

The check runs in Playwright's global setup, so a misconfigured run aborts
before a browser starts. It is enforced again inside `stagingAdminClient()`,
so no fixture can reach the database through another route.

## Production smoke run

```bash
npm run test:smoke
```

Defaults to `https://the11thbean-crm.vercel.app`; override with
`PLAYWRIGHT_BASE_URL`.
