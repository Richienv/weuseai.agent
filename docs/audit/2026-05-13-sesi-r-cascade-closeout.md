# Sesi R — Indonesian integrations cascade closeout

**Date:** 2026-05-13
**Branch:** `sesi-r/indonesian-integrations`
**Commits:** 7 logical units (sized for review)
**Test delta:** +72 new Sesi R tests, all green; full suite 1458/1426 pass / 0 fail / 32 skipped (32 = existing skipped, no new skips introduced)
**Spend:** $0.00
**Plan:** `docs/plans/2026-05-13-sesi-r-indonesian-integrations.md`
**Research:** `docs/research/2026-05-13-indonesian-tools-integration.md`

---

## 1. What shipped

### Phase 0 — Shared integration infrastructure (5 commits)

| # | Commit | What | Tests |
|---|---|---|---|
| 1 | `319e071` | `integration_credentials` table migration with RLS deny-all + unique `(customer_id, integration)` + soft-delete via `revoked_at` | 7 schema-drift |
| 2 | `590b796` | AES-256-GCM credential crypto helper (Web Crypto API, works in Deno + Node 20) | 12 round-trip + tamper |
| 3 | `46ccd01` | Bahasa error-mapper (Xendit catalog populated) + integration audit-log helper (PII-sanitized) | 13 + 12 |
| 4 | `a9fb290` | Shared integration preflight SKILL.md scaffold at `agent-packs/_shared/skills/integration-preflight/` | — |
| 5 | (combined in 4) | — | — |

**Architecture decision implemented:** proxy model. Customer's Hermes VPS posts `{operation, params}` to our Edge Function with X-CID + HMAC bearer. The Edge Function decrypts the credential, calls the third-party API, logs the outcome, maps errors to Bahasa, and returns the response. Plaintext credentials never leave Supabase. Revocation is immediate.

### Phase 1 — Xendit integration (3 commits)

| # | Commit | What | Tests |
|---|---|---|---|
| 1 | `4c69329` | Credential onboarding handler (GET/POST/DELETE) with X-CID + HMAC bearer auth | 14 |
| 2 | `28c7dc4` | Xendit proxy handler with 4 operations: `invoice.create`, `invoice.get`, `refund.create`, `balance.get` | 14 |
| 3 | `7df0d48` | TypeScript 5.4 narrowing for `res.json()` / `req.json()` callsites | — |

**Skill scaffolding shipped:** `agent-packs/xendit/SKILL.md` + `manifest.json` — premium Bahasa entrypoint documenting all 4 operations inline with Bahasa response templates + status-enum mapping (PENDING/PAID/SETTLED/EXPIRED).

### Phase 2 — Meta WhatsApp Cloud API stub

- `agent-packs/whatsapp-cloud-api/SKILL.md` — locked decisions documented (Meta direct protocol; AiSensy BSP for non-technical customers; per-conversation pricing Rp 597/367/367)
- `agent-packs/whatsapp-cloud-api/manifest.json` — version `0.0.1-stub`
- Deferred trigger logged

### Phase 3 — OnlinePajak PJAP stub

- `agent-packs/onlinepajak/SKILL.md` — locked decisions documented (OnlinePajak as primary PJAP reseller; liability gate requiring explicit taxpayer authorization before submission; compliance traps under UU PDP Art. 60 + UU KUP Art. 34)
- `agent-packs/onlinepajak/manifest.json` — version `0.0.1-stub`
- Deferred trigger logged

### Phase 4 — Tokopedia explicit-skip doc

- `docs/integrations/tokopedia-deferred.md` — 3-point reasoning + 2 re-evaluation triggers documented

---

## 2. Founder verification path

### Step 1 — Apply schema migration

```bash
# Founder action — apply via Supabase Mgmt API or local CLI.
# Migration file: supabase/migrations/20260513010000_sesi_r_integration_credentials.sql
```

Verifies: `integration_credentials` table exists, RLS enabled, anon-deny policy active.

### Step 2 — Generate + set encryption secret

```bash
openssl rand -hex 32  # → 64-char key
supabase secrets set INTEGRATION_ENCRYPTION_KEY=<hex>
```

This is a NEW secret distinct from `HERMES_INSTANCE_HMAC_KEY`. Principle-of-least-privilege — leak of one doesn't compromise the other.

### Step 3 — Smoke test with Xendit sandbox key

Once Step 1 + 2 done, founder runs (with founder's own Xendit sandbox API key + a real customer_id):

```bash
# A. Onboard
CID="<real-customer-uuid>"
BEARER=$(node -e "/* compute HMAC */")  # using HERMES_INSTANCE_HMAC_KEY

curl -X POST "https://<supabase-url>/functions/v1/integration-credentials/xendit" \
  -H "X-CID: $CID" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -d '{"api_key":"xnd_development_YOUR_KEY","label":"Sandbox"}'
# → 200 { configured: true, last_validated_at }

# B. Status check
curl "https://<supabase-url>/functions/v1/integration-credentials/xendit" \
  -H "X-CID: $CID" -H "Authorization: Bearer $BEARER"
# → 200 { configured: true, label: "Sandbox", ... }  (NO ciphertext)

# C. Create invoice via proxy
curl -X POST "https://<supabase-url>/functions/v1/integration-proxy-xendit" \
  -H "X-CID: $CID" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -d '{"operation":"invoice.create","params":{"external_id":"smoke-001","amount":10000,"description":"Sesi R smoke test"}}'
# → 200 { ok: true, data: { id, invoice_url, status: PENDING } }

# D. Cek status
curl -X POST "https://<supabase-url>/functions/v1/integration-proxy-xendit" \
  -H "X-CID: $CID" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -d '{"operation":"invoice.get","params":{"invoice_id":"<from-step-C>"}}'

# E. Revoke
curl -X DELETE "https://<supabase-url>/functions/v1/integration-credentials/xendit" \
  -H "X-CID: $CID" -H "Authorization: Bearer $BEARER"
# → 200 { ok: true, revoked: true }

# F. Confirm revoke takes effect
curl "https://<supabase-url>/functions/v1/integration-credentials/xendit" \
  -H "X-CID: $CID" -H "Authorization: Bearer $BEARER"
# → 410 { configured: false, revoked_at: <iso> }
```

### Step 4 — Verify audit_log entries

```sql
SELECT action, result, meta, created_at
FROM audit_log
WHERE customer_id = '<real-customer-uuid>'
  AND action LIKE 'xendit.%'
ORDER BY created_at DESC
LIMIT 10;
```

Expected rows: `credential.set` (ok), `invoice.create` (ok), `invoice.get` (ok), `credential.revoke` (ok). Confirm `meta` contains NO `api_key`, NO buyer email, NO PII.

---

## 3. Test count delta

| Component | New tests | Status |
|---|---|---|
| `integration-credentials-schema-static` | 7 | green |
| `integration-credential-crypto` | 12 | green |
| `integration-error-mapper` | 13 | green |
| `integration-audit-log` | 12 | green |
| `integration-credential-handler` | 14 | green |
| `integration-proxy-xendit-handler` | 14 | green |
| **Total** | **72** | **all green** |

Pass-3 regression suite (`pass-3-regression-suite.spec.ts`): green. Pre-cascade invariants (ToS gate / tier gate / X-CID gate) all hold.

Full suite (`npm run test`): 1458 tests / 1426 pass / 0 fail / 32 pre-existing skipped. Typecheck (`npm run typecheck`) clean.

---

## 4. What's NOT in this cascade

### Operations deferred to next-Xendit cascade

- `invoice.send_link` via per-customer Telegram bot — requires telegram-bot wiring, separate scope
- `webhook.receive` — Xendit webhook → notify customer in Telegram. Separate Edge Function `/integration-webhook-xendit`. Decision needed: how to map xendit's webhook signature scheme to our auth model.
- `payout.create` / `disbursement.create` — needs more research on settlement reconciliation per channel (VA T+1 vs Indomaret T+5)
- `recurring.plan_create` — subscription plans, mostly relevant if customers want their own subscription model

### Slot 2 (Meta WhatsApp) — STUB ONLY

Stub SKILL.md + manifest shipped. **Implementation deferred** per locked decision:
- Trigger: first paying customer asks for WA broadcast OR Slot 1 stable 14+ days + founder checkpoint

### Slot 3 (OnlinePajak) — STUB ONLY

Stub SKILL.md + manifest shipped. **Implementation deferred** per locked decision:
- Trigger: first PKP customer signs up + requests tax-filing OR founder strategic call to prioritize moat-play
- Year-2+ optional moat: self-PJAP certification ($50-150k, 12-24 mo, PT + ISO 27001 + Indonesia-domiciled DC + DR + DJP audit + ID-majority ownership)

### Tokopedia — explicitly skipped for v1

Doc shipped at `docs/integrations/tokopedia-deferred.md`. Re-evaluation triggers logged.

---

## 5. Next-cascade triggers

These are the conditions under which a follow-on cascade ships. Sesi A does NOT auto-trigger these — founder confirms via checkpoint.

### Trigger A — Ship Slot 2 (WhatsApp)

ANY of:
- First paying customer explicitly requests WhatsApp broadcast / template messaging
- Slot 1 (Xendit) stable in production for 14+ consecutive days with zero rollbacks AND founder confirms via checkpoint

Cascade scope:
- WhatsApp catalog populated in `integration-error-mapper.ts`
- New Edge Function `/integration-proxy-whatsapp` (mirrors Xendit shape)
- New `agent-packs/whatsapp-cloud-api/SKILL.md` upgraded from stub to live
- AiSensy BSP integration path documented

### Trigger B — Ship Slot 3 (OnlinePajak)

ANY of:
- First PKP-status customer signs up AND requests tax-filing capability
- Founder strategic call: prioritize moat-play over additional revenue surface

Cascade scope:
- OnlinePajak catalog in `integration-error-mapper.ts`
- New Edge Function `/integration-proxy-onlinepajak`
- Two-step submission gate (taxpayer-authorize before DJP call)
- BPE PDF archival in Hermes inbox
- DPA template + counsel review (per Sesi B closeout)

### Trigger C — Ship remaining Xendit operations

When customers explicitly ask for refund-via-Telegram-link OR webhook-driven customer notifications:
- Wire Xendit webhook receiver
- Implement `invoice.send_link` via per-customer Telegram bot
- Add `payout.create` / `disbursement.create`

### Trigger D — DigitalOcean failover adapter

Research doc §5 recommended building DO SGP1 adapter alongside Vultr. Not part of Sesi R scope. Tracked separately.

---

## 6. What this cascade did NOT touch (Sesi A scope preserved)

Per discipline rules:
- ❌ `welcome.html` / `checkout.html` / `/welcome` trust signals — Sesi A Phase 0.5 active
- ❌ Telemetry / observability — Sesi A scope
- ❌ IDCH cleanup — completed in PR #90 (referenced only)

Branch is clean against `main` for these files.

---

## 7. Files added / modified

```
Created (Sesi R):
  docs/plans/2026-05-13-sesi-r-indonesian-integrations.md
  docs/audit/2026-05-13-sesi-r-cascade-closeout.md   (this file)
  docs/integrations/tokopedia-deferred.md
  supabase/migrations/20260513010000_sesi_r_integration_credentials.sql
  supabase/functions/_shared/integration-credential-crypto.ts
  supabase/functions/_shared/integration-credential-handler.ts
  supabase/functions/_shared/integration-error-mapper.ts
  supabase/functions/_shared/integration-audit-log.ts
  supabase/functions/_shared/integration-proxy-xendit-handler.ts
  agent-packs/_shared/skills/integration-preflight/SKILL.md
  agent-packs/_shared/skills/integration-preflight/README.md
  agent-packs/xendit/SKILL.md
  agent-packs/xendit/manifest.json
  agent-packs/whatsapp-cloud-api/SKILL.md            (stub)
  agent-packs/whatsapp-cloud-api/manifest.json       (stub)
  agent-packs/onlinepajak/SKILL.md                   (stub)
  agent-packs/onlinepajak/manifest.json              (stub)
  tests/integration-credentials-schema-static.spec.ts
  tests/integration-credential-crypto.spec.ts
  tests/integration-error-mapper.spec.ts
  tests/integration-audit-log.spec.ts
  tests/integration-credential-handler.spec.ts
  tests/integration-proxy-xendit-handler.spec.ts

Modified: (none — Sesi R is purely additive)
```

---

## 8. Outstanding for founder

Required before live cutover:

1. **Apply migration** via Supabase Mgmt API (~1 min)
2. **Set `INTEGRATION_ENCRYPTION_KEY` secret** (`openssl rand -hex 32`)
3. **Deploy Edge Functions** — `integration-proxy-xendit` + `integration-credentials` (requires `supabase functions deploy` for each). Both implementations live as exported `handle*` functions in `_shared/`; need a thin `supabase/functions/<name>/index.ts` Deno entrypoint wrapping each (~10 LOC per file, follow `xendit-webhook/index.ts` pattern). Defer to founder-approved deploy window OR script as follow-on commit.
4. **Founder smoke test** per Step 3 above with own Xendit sandbox key (~5 min)
5. **Merge `sesi-r/indonesian-integrations` to main** via PR

Optional, no blocker:
- Add `audit_log` query to admin dashboard (per-customer integration usage view) — separate cascade
- Add UI for credential management in customer dashboard — separate cascade (currently credentials added via the agent in Telegram per skill onboarding flow)

---

## 9. Cost discipline check

- ✓ No Vultr / DigitalOcean / Fly mutations
- ✓ No third-party API calls during build (no Xendit account used)
- ✓ No paid signups
- ✓ No new npm dependencies (Web Crypto + Node built-ins only)
- ✓ Spend: $0.00

---

**Sesi R closed.** Awaiting founder review + production deploy authorization.
