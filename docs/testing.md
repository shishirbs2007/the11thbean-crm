# Testing

## Philosophy

Tests here exist to catch things review does not. Almost every real defect
found in this codebase was found by a test doing something a human would not
have thought to try: rebuilding the database from nothing, running a seed
twice, pointing the suite at a populated environment, or reading a page the
way a screen reader does.

Two rules follow from that:

1. **Test against a database built from the migration history**, never one
   built by hand. A schema that only exists because somebody clicked something
   in a dashboard is not reproducible, and the tests are what prove it.
2. **Never assert against shared aggregate state.** A test that expects revenue
   to equal ₹2,500 passes on an empty database and fails the moment anyone
   seeds one. Assert your own fixture's contribution instead.

## The suites

| Command | What it covers | Writes | Target |
| --- | --- | --- | --- |
| `npm run test:guards` | Environment safety, fails closed | no | none |
| `npm run test:unit` | Pure logic: scoring, wording, parsing | no | none |
| `npm run test:e2e:local` | Full lifecycles through the UI | yes | local stack |
| `npm run test:e2e:staging` | The same, against hosted staging | yes | staging |
| `npm run test:smoke` | Availability, auth, route rendering | **no** | production |
| `npm run validate` | Everything local, in order | yes | local only |

`npm run validate` is the gate. If it passes, the change is mergeable.

## What is where

```
tests/
  guards/           environment safety, plain bash
  unit/             pure functions, vitest, no database
  e2e/
    smoke/          read-only, safe against production
    lifecycle/      write-enabled, never against production
    support/        the environment guard and fixtures
```

The split between `smoke/` and `lifecycle/` is load-bearing, not cosmetic.
`playwright.production.config.ts` can only see `smoke/`; the write-enabled
configs can only see `lifecycle/`. A write-enabled test physically cannot be
run against production by the production config.

## The production write guard

Every write-enabled suite calls `assertWritesAllowed()` before it can obtain a
database client. Three conditions must all hold:

1. `CRM_E2E_ALLOW_WRITES` is exactly `true`
2. `CRM_E2E_ENVIRONMENT` is `local` or `staging`
3. `NEXT_PUBLIC_SUPABASE_URL` is not a production project

It fails closed: an empty or unrecognised target is refused, not assumed safe.
The check runs in Playwright's `globalSetup`, so a misconfigured run aborts
before a browser starts, and again inside `stagingAdminClient()`, so no fixture
can reach the database by another route.

Setting both flags while leaving production credentials in place still refuses.
That is the case that matters, and `tests/guards` covers it explicitly.

## Writing a lifecycle test

```ts
import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();          // unique per run, so parallel runs
                                       // and reruns never collide
test.describe.serial("Thing", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient(); // guarded; throws if misconfigured
    // seed fixtures named `Thing${timestamp}`
  });

  test.afterAll(async () => {
    // delete everything you created, children first
  });
});
```

**Scope assertions to your own fixture.** Use
`.getByRole("listitem").filter({ hasText: \`Thing${timestamp}\` })` rather than
a page-wide `getByText`. The environment legitimately contains other data.

**Fixtures need contact details.** `people` carries a
`people_phone_or_email` check constraint, so an insert without one fails.

**Flash messages render twice** (toast plus inline). Asserting on a success
message is a strict-mode violation; assert the resulting state change instead.

## Accessibility

`tests/e2e/lifecycle/accessibility.spec.ts` checks that each page has exactly
one `h1`, a `main` landmark and navigation; that every form control has an
accessible name; that images carry alt text; and that nothing scrolls sideways
at 390px.

It found that all 49 dropdowns in the application were unlabelled. Staff use
this on a phone behind a counter, one-handed, in a hurry.

## Continuous integration

`.github/workflows/quality.yml` runs four jobs:

- **verify** — guards, lint, types, unit, build
- **migrations** — resets a blank stack from the migration history, applies
  migrations twice, seeds twice, and fails if committed database types are
  stale
- **e2e** — the full write-enabled suite against a local stack
- **audit** — dependency audit, failing on high or critical

The migrations job is the one that matters most: it proves the repository can
rebuild its own database. That check would have caught the missing role grants
that made the schema unreproducible for weeks.

CI never deploys production.

## Coverage

`npm run test:coverage` reports against a 20% threshold. That number is low on
purpose: most of the intelligence lives in SQL, where line coverage of the
TypeScript would be misleading. The lifecycle suites are what actually exercise
the scoring, audience and recommendation logic, and they run against a real
database.
