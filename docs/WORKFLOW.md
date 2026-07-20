# Delivery workflow

Feature work is never deployed to production before it has been verified
end to end. The sequence below is the only supported path to production.

## Sequence

1. Implement the feature
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:unit`
5. `npm run build`
6. Deploy a Vercel Preview: `vercel deploy` (no `--prod`)
7. Run the write-enabled regression suite against the Preview URL
8. Fix and repeat from step 2 until green
9. Deploy to production: `vercel deploy --prod`
10. Run the read-only production smoke suite

## Environments

| Environment | Vercel | Supabase project | Data |
| --- | --- | --- | --- |
| Development | local `next dev` | staging | disposable |
| Preview | preview deployment | staging | disposable |
| Production | production deployment | production | real customer records |

Vercel Preview environment variables point at the staging Supabase project;
Production environment variables point at the production project. The two sets
never overlap.

## Test suites

| Script | Target | Writes |
| --- | --- | --- |
| `npm run test:unit` | none | no |
| `npm run test:public` | production | no |
| `npm run test:auth:smoke` | production | no |
| `npm run test:smoke` | production | no |
| `npm run test:e2e:staging` | Preview + staging | yes |

`test:public` and `test:auth:smoke` are smoke tests. They confirm
availability, authentication, route rendering and critical read operations.
They must never create, edit or delete business data.

`test:e2e:staging` exercises the full customer, visit, loyalty, event and
communication lifecycles. It creates uniquely identified fixtures and removes
them afterwards, and only ever runs against staging.

## Running the staging regression

```bash
PLAYWRIGHT_BASE_URL="https://<preview-deployment>.vercel.app" \
CRM_E2E_ALLOW_WRITES=true \
CRM_E2E_ENVIRONMENT=staging \
npm run test:e2e:staging
```

The suite refuses to start unless all three of the following hold:

1. `CRM_E2E_ALLOW_WRITES` is exactly `true`
2. `CRM_E2E_ENVIRONMENT` is exactly `staging`
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
