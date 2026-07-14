# integration-preflight (developer-facing)

Shared SKILL.md scaffold every third-party integration uses. Edit `SKILL.md` in this directory to evolve the standard handshake; all per-integration SKILL.md files reference it via `/integration-preflight`.

## Why a shared preflight

Each integration (Xendit, WhatsApp, OnlinePajak) needs the same three steps before its core operation:

1. **Check credential status** — `GET /integration-credentials/<integration>`
2. **Onboard if missing** — `POST /integration-credentials/<integration>`
3. **Call the proxy** — `POST /integration-proxy-<integration>`

Without the shared scaffold, every integration would re-invent the Bahasa copy for "credential not configured" / "credential revoked" / "credential invalid." The shared file pins the copy + the priority order, so the per-integration SKILL.md only has to document its own operations.

## Auth model

Both `/integration-credentials/<integration>` and `/integration-proxy-<integration>` enforce:
- `X-CID` header equal to body's `customer_id` field
- `Authorization: Bearer <hmac_customer_token>` where token = `hex(HMAC_SHA256(customer_id, HERMES_INSTANCE_HMAC_KEY))`

Same pattern as `customer-progress-proxy` + `customer-readiness` post-Sesi-D-pass-3 (PR #93).

## Credential storage

Server-side, plaintext API keys are encrypted with AES-256-GCM (key derived from `INTEGRATION_ENCRYPTION_KEY` Supabase secret) and stored in the `integration_credentials` table. The customer's Hermes VPS never sees raw credentials. Decryption happens only inside the integration-proxy Edge Function, just before the third-party API call.

## Audit

Every successful operation logs one row to `audit_log` via `logIntegrationCall` (`supabase/functions/_shared/integration-audit-log.ts`). Meta is sanitized for PII before write.

## Onboarding UX in Telegram

The skill collects the API key by asking the customer to paste it directly in Telegram. This is acceptable because:
- The customer's Telegram channel is end-to-end-encrypted between them and Telegram BotAPI
- The bot is the customer's own bot (per-customer token at provisioning time)
- The skill calls `POST /integration-credentials/<integration>` immediately and discards the plaintext
- Server-side validates the key against the third-party service before persisting (e.g. Xendit `GET /balance` smoke-test)

If the validation call fails, the API key is rejected without persistence and a Bahasa error is shown.

## Revocation

`DELETE /integration-credentials/<integration>` sets `revoked_at`. Idempotent. Re-add by calling `POST` again — the unique constraint on `(customer_id, integration)` is enforced as upsert behaviour server-side (`revoked_at = NULL` on re-add).

## Files

- `SKILL.md` — the customer-facing skill scaffold (this is what Hermes reads)
- `README.md` — this file; developer-facing rationale
