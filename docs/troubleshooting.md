# Troubleshooting

Problems actually encountered, and what they turned out to be. Every entry
here cost real time to diagnose once.

## Local development

### `supabase start` fails: port already allocated

Docker restored containers from a previous session under a different project
id.

```bash
docker ps --format '{{.Names}}'          # find the stale stack
supabase stop --project-id <old-id>
supabase start
```

### Migrations "not found in local migrations directory"

The CLI was run from outside the repository. `supabase/migrations` did not
exist relative to the working directory, so it compared against nothing.

```bash
cd ~/Developer/the11thbean-crm && supabase migration up --local
```

### Every service-role write returns `permission denied for table X`

The database is missing the role grants. This is what
`202607200500_role_grants.sql` exists for.

```bash
npm run reset:local     # rebuilds from the full migration history
```

If it persists on a hosted project, that project was created before the grants
migration existed. Apply it: `supabase db push --linked`.

### Authenticated pages bounce to `/login` locally

The session cookie was set on one host and the redirect landed on another.
Next derives redirect origins as `localhost`, so a suite pointed at
`127.0.0.1` loses its cookie on the first redirect. Use `localhost` throughout
— `playwright.local.config.ts` already does.

## Tests

### A test passes locally and fails on staging

It is almost certainly asserting against shared aggregate state. Revenue,
counts and "drifting regulars" all legitimately include seed data on a
populated environment.

Scope the assertion to your own fixture:

```ts
const row = region.getByRole("listitem").filter({ hasText: `Thing${timestamp}` });
```

### `strict mode violation: resolved to 2 elements`

Usually one of three things:

- Flash messages render twice (toast plus inline). Assert the state change, not
  the message.
- A page `h1` and a `Section` title share text. Rename the section.
- Your fixture matched alongside seeded data. Scope to the fixture.

### Write-enabled tests refuse to run

That is the guard working. It needs all three:

```bash
CRM_E2E_ALLOW_WRITES=true CRM_E2E_ENVIRONMENT=local  # or staging
# and NEXT_PUBLIC_SUPABASE_URL must not be production
```

Use `npm run test:e2e:local` or `npm run test:e2e:staging`, which set these
correctly. If the guard refuses anyway, read the message — it names which
condition failed.

### A server action silently does nothing

A server action bound with a literal value (`action.bind(null, id, true)`) does
not fire. Pass the value through form data instead:

```tsx
<input type="hidden" name="did_attend" value="true" />
```

## Staging

### `supabase projects list` shows the wrong account

The CLI stores one token. Production uses the keychain credential; staging uses
`SUPABASE_ACCESS_TOKEN` from `.env.staging`.

```bash
set -a && source .env.staging && set +a   # staging
unset SUPABASE_ACCESS_TOKEN               # back to production
```

### Seeding hangs with no output

The pooler hostname was wrong — constructed as `aws-0-<region>` when the real
host is `aws-1-`. Fixed: seeding now goes through the Management API and needs
no database connection at all.

### Management API returns 403 with `error code: 1010`

Cloudflare rejected the request for having no user agent.

```bash
curl -H "User-Agent: the11thbean-crm-bootstrap/1.0" ...
```

### Staging API "did not respond" but the app works

`/rest/v1/` requires more than an `apikey` header and returns 401 by design.
That is not a reachability failure. Query an actual table.

### Hosted staging returns 302 on every request

Vercel Deployment Protection. Either disable it for previews, or use a
Protection Bypass token (paid plans only).

## Production

### `supabase db push` hangs or stalls indefinitely

macOS Keychain is prompting for access to the stored Supabase token, and the
prompt is invisible to the terminal. Look for a dialog on screen, or run
`supabase login` once interactively.

### Smoke tests fail after a deploy

Check what actually changed:

```bash
npm run test:report        # opens the Playwright report
```

A heading assertion failing usually means a `Section` title now collides with
the page `h1`. A route failing means the deploy is genuinely broken — roll
back with `vercel rollback`.

## Deployment

### The build succeeds locally and fails on Vercel

Almost always a missing environment variable. `NEXT_PUBLIC_*` values are
inlined at build time, so they must exist in the Vercel environment being
built, not only at runtime.

### Preview points at the wrong database

```bash
vercel env ls              # confirm which environment holds what
```

Vercel redacts pulled values, so verify at runtime instead: run
`npm run test:e2e:staging` and confirm fixtures appear. If the suite passes,
the deployment is reading staging.

## When nothing here helps

```bash
npm run reset:local && npm run validate
```

A clean local rebuild plus the full gate reproduces most problems and rules out
local drift. If that passes and the hosted environment still misbehaves, the
difference is configuration, not code.
