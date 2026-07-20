# Integrations

## The rule

The CRM never learns a provider's name. It asks for a **capability** —
"something can send email", "something can import orders" — and configuration
decides which adapter carries it. Swapping PetPooja for another till, or one
email provider for another, is a row and an adapter module, not a change to any
feature.

## Capabilities

| Capability | Meaning |
| --- | --- |
| `orders.import` | Pull completed orders and items into visits |
| `customers.sync` | Match external customer records to people |
| `email.send` | Deliver an email |
| `whatsapp.send` | Deliver a WhatsApp message |
| `sms.send` | Deliver a text message |
| `push.send` | Deliver a push notification |
| `calendar.sync` | Publish events to a calendar |
| `delivery.webhook` | Accept delivery, open and click callbacks |

## Registered adapters

All ship **disabled**. Enabling one without its credentials leaves it treated
as absent rather than failing at send time.

| Adapter | Vendor | Capabilities | Required environment |
| --- | --- | --- | --- |
| `petpooja` | PetPooja | orders.import, customers.sync | `PETPOOJA_API_KEY`, `PETPOOJA_RESTAURANT_ID` |
| `generic_pos` | — | orders.import | none (CSV) |
| `resend` | Resend | email.send, delivery.webhook | `RESEND_API_KEY` |
| `whatsapp_cloud` | Meta | whatsapp.send, delivery.webhook | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` |
| `twilio_sms` | Twilio | sms.send, delivery.webhook | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| `google_calendar` | Google | calendar.sync | `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` |

**Credentials are never stored in the database.** `integration_adapters`
records only the *names* of the variables an adapter needs.

## Adding an adapter

1. Insert a row into `integration_adapters` with its capabilities and required
   environment variable names.
2. Implement `IntegrationAdapter` in `src/lib/integrations/`.
3. Register it with `registerAdapter()`.
4. Supply its environment variables and enable it at `/integrations`.

No feature code changes. Features resolve capabilities through
`resolveCapability()` and never name a vendor.

## Current state

**No adapter is implemented yet.** The contract, registry, resolution and
failure handling are complete and tested; the concrete provider modules are
not written. Until one exists:

- Campaigns draft, reason, review and approve normally.
- Automations queue messages with status `queued`.
- `sendVia()` returns a typed refusal — *"No messaging provider is
  configured"* — rather than pretending a message was delivered.

That refusal is deliberate. A café must never believe a message went out when
it did not.
