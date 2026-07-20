# Security

## Threat model

This system holds the café's memory of its guests: names, phone numbers,
allergies, family details, what they order, when they come in, and private
staff notes about them. A leak is not a compliance incident, it is a betrayal
of people who trusted a café with their details.

The realistic risks, in order:

1. **Accidental exposure of guest data** through a misconfigured environment,
   a test writing to production, or a credential in the repository.
2. **A staff account being over-privileged** — a barista able to export the
   whole customer list.
3. **Unwanted messaging** — the CRM contacting someone who did not consent.
4. **Credential compromise**, particularly the service-role key.

## Row Level Security

Every table has RLS enabled. There are 147 policies. The pattern:

| Role | Can |
| --- | --- |
| `barista` | Read guest records, complete hospitality tasks, record visits |
| `manager` | The above, plus campaigns, audiences, automations, communities |
| `admin` | The above, plus branches, integrations, staff roles |

Roles live in `app_roles`, resolved by `current_app_role()`. Policies call that
function rather than trusting anything the client sends.

**RLS is the boundary, not the UI.** A page that hides a button does not
protect anything; the policy behind it does.

## Grants

`202607200500_role_grants.sql` records the table privileges the production
project received when it was provisioned. Without them, PostgREST rejects every
write even when a policy would allow it.

This migration exists because the schema was not reproducible without it — a
database built purely from the migration history failed. Grants are part of the
schema, not part of the dashboard.

## Consent

Consent is per **channel** and per **purpose**. Permission to send a booking
confirmation is not permission to market.

`has_consent(person, channel, purpose)` is called **inside**
`evaluate_audience()` and `automation_candidates()`, not by their callers. No
screen, campaign or automation can route around it, because there is no code
path that selects recipients without going through those functions.

Purposes requiring an explicit opt-in refuse by default. **Silence is never
taken as a yes.** A suppression on a channel overrides everything.

## Environment safety

The production Supabase project is on a denylist consulted by every script
before it acts. The guard **fails closed**: an empty or unrecognised target is
refused rather than assumed safe.

```
scripts/lib/environment-guard.sh     the denylist and the checks
tests/guards/                        12 cases, including production still
                                     refused when CRM_ENVIRONMENT=staging
```

A structural safeguard reinforces this: **staging lives in a different Supabase
account**. Its access token cannot see the production project at all, so a
misconfigured staging command has nothing to hit.

## Secrets

| Secret | Where it lives | Never |
| --- | --- | --- |
| Supabase anon key | Vercel env, per environment | — |
| Service-role key | Vercel env (Preview), `.env.local`, `.env.staging` | committed, logged, printed |
| Staging access token | `.env.staging` | committed |
| Integration credentials | Vercel env only | in the database |

`.env*` is gitignored except `.env.example` and `.env.staging.example`. The
scripts read secrets but never echo them — `bootstrap:staging` prints
"Keys retrieved. (Values are never printed.)" and means it.

`integration_adapters` stores only the **names** of the environment variables
an adapter needs, never their values.

To rotate the service-role key: rotate in the Supabase dashboard, update the
Vercel variable, redeploy. Nothing in the repository needs to change.

## Authentication

Magic link only. No passwords are stored, so there are no passwords to leak
and no password reset flow to attack. No OAuth providers are configured.

Sessions are Supabase JWTs in cookies, refreshed by middleware. JWT expiry is
one hour with refresh-token rotation.

## What protects guests from the CRM itself

- **Automations ship switched off.** Nothing acts on a guest until somebody
  deliberately enables it having read what it does.
- **No integration adapter is implemented**, and the default refuses to send
  rather than pretending. A café can never believe a message went out when it
  did not.
- **Campaigns cannot leave draft** without a written answer to why these
  guests, why now, why this message, and what outcome is hoped for. Enforced in
  the database, so no screen can bypass it.
- **Every automation run is audited** — what it found, acted on, skipped and
  failed, and the reason each guest qualified.

## Known weaknesses

**Vercel preview deployments are publicly reachable.** SSO protection was
disabled so hosted staging smoke tests could run; Protection Bypass for
Automation requires a paid plan. Staging holds only synthetic data and login
still requires a magic link, but the URL is not secret. Re-enable Deployment
Protection in Vercel project settings to reverse this.

**Two moderate dependency advisories** in Next.js's bundled `postcss`. The only
remedy npm offers is downgrading Next 16 to 9.3.3, which is not a fix. Tracked,
not actioned.

**Free-plan backup retention is limited.** Take manual dumps before
significant changes — see `docs/runbooks.md`.

**Staff can read all guest records.** Appropriate for one café where everyone
serves everyone; wrong for a franchise. Branch-scoped read policies are the
first thing to add when a second site opens.

## Reporting a problem

Anything involving real guest data: stop, do not push, and raise it directly.
Nothing about this system is urgent enough to justify guessing.
