# Delivery workflow

Feature work is never deployed to production before it has been verified
end to end. The sequence below is the only supported path to production.

## Current sequence (until a hosted staging database exists)

1. Implement the feature
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:unit`
5. `npm run build`
6. `npm run test:e2e:local` — full write-enabled lifecycle suite against local
   Next.js plus local Supabase
7. Fix and repeat from step 2 until green
8. Deploy a Vercel Preview for read-only UI and route verification
9. Deploy to production: `vercel deploy --prod`
10. `npm run test:smoke` — read-only production smoke suite

## Environments

| Environment | Application | Supabase project | Data |
| --- | --- | --- | --- |
| Local | `next start` on port 3100 | local stack on 54321 | disposable |
| Preview | preview deployment | production (read-only use) | not written to |
| Production | production deployment | production | real customer records |

The local Supabase stack is built from the same migrations as production, so
the lifecycle suite exercises the real schema.

Vercel Preview currently shares the production Supabase project, so Preview is
used only for read-only UI and route verification. No write-enabled suite runs
against it.

## After 10 August 2026

Once a free project slot is available:

1. Pause `Aanu_Registry`
2. Run `scripts/bootstrap-staging.sh` to create `the11thbean-crm-staging`,
   apply every migration and configure the synthetic staff user
3. Point Vercel **Preview** environment variables at staging, leaving
   **Production** untouched
4. Run `npm run test:e2e:staging` against a Preview deployment

At that point step 6 above moves to Preview plus staging, and the target table
becomes:

| Environment | Application | Supabase project |
| --- | --- | --- |
| Local | `next start` | local stack |
| Preview | preview deployment | staging |
| Production | production deployment | production |

## Test suites

| Script | Target | Writes |
| --- | --- | --- |
| `npm run test:unit` | none | no |
| `npm run test:public` | production | no |
| `npm run test:auth:smoke` | production | no |
| `npm run test:smoke` | production | no |
| `npm run test:e2e:local` | local app + local Supabase | yes |
| `npm run test:e2e:staging` | Preview + staging | yes |

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

The check runs in Playwright's global setup, so a misconfigured run aborts
before a browser starts. It is enforced again inside `stagingAdminClient()`,
so no fixture can reach the database through another route.

## Production smoke run

```bash
npm run test:smoke
```

Defaults to `https://the11thbean-crm.vercel.app`; override with
`PLAYWRIGHT_BASE_URL`.
