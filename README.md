# The11thBean-CRM

Foundation for The 11th Bean's hospitality CRM and integration platform.

## Generated modules

- People and external identities
- Visits and item-level order history
- Preferences and role-aware notes
- Communities and memberships
- Events and registrations
- Consent records
- Integration runs and errors
- Provider-neutral integration ledger
- Staff roles with Row Level Security

## Integration approach

External systems such as a POS, WhatsApp, email and payments should be added later as isolated connectors. The CRM foundation remains independent of any single vendor.

## Local development

```bash
cp .env.example .env.local
npm run dev
```

Never commit `.env.local`, access tokens, database passwords or service-role keys.
