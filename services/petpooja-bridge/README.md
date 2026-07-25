# PetPooja Local Bridge

A small, isolated Node service that runs **on the café machine** (the one with
PetPooja installed) and mediates between the cloud CRM and the on-premise
PetPooja local/intranet service. It is deliberately separate from the Next.js
web app.

```
Mobile / browser CRM  ──▶  Cloud CRM/API  ──▶  Local PetPooja Bridge  ──▶  PetPooja local service
```

The bridge is **not** a generic proxy. It exposes exactly one authenticated
operation endpoint (`POST /v1/op`) plus an unauthenticated liveness check
(`GET /health`), and it only performs operations on a fixed allowlist.

## Safety properties

- **No secrets in git.** All config comes from the environment (see `.env.example`).
- **Authenticated.** Every operation is HMAC-signed by the CRM; unauthenticated,
  stale, or replayed requests are rejected. The server refuses to start without
  `BRIDGE_AUTH_KEYS`.
- **Allowlisted.** Only the operations in `src/allowlist.ts` are accepted; there
  is no arbitrary-route pass-through to PetPooja.
- **Read-first.** Only the two evidenced PetPooja endpoints are wired
  (`check_sync_code`, `inner_item_listing`), both idempotent reads. Order and
  customer writes are **not** implemented yet and report `not_supported`.
- **Redacted logs.** Secrets and sensitive headers never reach the logs.
- **No guessed version.** `PETPOOJA_SERVER_VERSION` is configuration, never a
  hard-coded value.

## Setup

```bash
cp services/petpooja-bridge/.env.example services/petpooja-bridge/.env
# edit .env with the local PetPooja URL, sync code and a bridge auth secret
```

## Commands (run from the repo root)

```bash
npm run petpooja:probe    # READ-ONLY capability report against the local PetPooja
npm run petpooja:bridge   # start the bridge (needs BRIDGE_AUTH_KEYS)
npm run petpooja:test     # unit tests
npm run petpooja:check    # typecheck + tests
```

## Capability discovery

`npm run petpooja:probe` never writes to PetPooja. It reports reachability,
version compatibility, restaurant identity and which operations are
`CONFIRMED` (demonstrated live), `DISCOVERED` (seen in the extracted source but
unvalidated) or `UNKNOWN`. Point it at the extracted source with
`PETPOOJA_SOURCE_DIR` to surface likely routes.
