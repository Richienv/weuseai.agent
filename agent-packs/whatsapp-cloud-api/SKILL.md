# WhatsApp (Meta Cloud API) — STUB (Slot 2, deferred)

> **Status:** Stub. Build deferred pending first paying customer feedback on Xendit (Slot 1). See `docs/research/2026-05-13-indonesian-tools-integration.md` §4 for full rationale.

## Locked decisions (D3)

- **Integration protocol:** Meta WhatsApp Cloud API direct (NOT Telkomsel-reseller, NOT Twilio-as-primary).
- **Customer onboarding paths:**
  - **Technical customers** → Meta direct embedded signup. Customer authorizes our Tech Provider Meta Business Account to manage their WABA.
  - **Non-technical customers (recommended path)** → **AiSensy** Indonesian BSP reseller. AiSensy handles Meta verification UX. We integrate AiSensy's REST API on the customer's behalf.
- **Pricing pass-through:** Meta Indonesia per-conversation rates (July 2025+): Rp 597 marketing / Rp 367 utility / Rp 367 auth / service free.

## Required credentials (per customer)

- `WABA ID` (WhatsApp Business Account ID)
- `phone_number_id` (the WABA's allocated phone number)
- `access_token` — System User token (Meta direct) OR AiSensy-issued API key (reseller path)

All three encrypted via `integration-credential-crypto` and stored in `integration_credentials` table with `integration = 'whatsapp_cloud_api'`.

## Capabilities planned

| Operation | Purpose | Notes |
|---|---|---|
| `message.send_text` | Send free-text message (within 24h customer window only) | Service messages are free |
| `message.send_template` | Send pre-approved template (marketing / utility / auth) | Per-conversation pricing applies |
| `message.send_media` | Image / video / document attachments | Supported in templates + 24h window |
| `webhook.receive` | Inbound message + status webhook | Separate Edge Function `/integration-webhook-whatsapp` |
| `conversation.history` | Recent message thread for a customer-of-customer | Subject to Meta's 24h policy |

## Why deferred

Slot 2 ships after Slot 1 (Xendit) is stable and we have **first paying customer feedback**. Reasons:

1. **Validation feedback loop.** Xendit is the foundational broker primitive — we want to learn from real customer usage (preflight UX, error messaging, audit-log coverage) before extending to a second integration.
2. **Meta WABA onboarding requires founder-touch.** Each tenant's WABA needs Meta Business Manager verification (~3-7 days). Hard to scale without validated demand.
3. **AiSensy partnership timing.** Indonesian-context BSP relationships are quote-based; founder negotiates pricing per customer-tier first.

## Trigger to ship Slot 2

Either of:
- First paying customer asks for WhatsApp broadcast / template sending OR
- Slot 1 stable in production for 14+ days with zero rollbacks AND founder confirms via checkpoint

## When this skill is built

The SKILL.md will follow the same shape as `/xendit/SKILL.md`:
- Preflight via `_shared/skills/integration-preflight`
- Operations documented inline with required params + Bahasa response copy
- Bahasa error catalog (added to `integration-error-mapper.ts` under `whatsapp_cloud_api` entry)
- Standalone Edge Function `/integration-proxy-whatsapp` mirroring `/integration-proxy-xendit` shape

## Compliance

- Meta WABA usage governed by Meta Platform Terms + Indonesian UU PDP processor relationship
- Marketing templates require explicit opt-in per Meta policy
- Quality rating impacts deliverability; per-tenant quality monitoring TBD
