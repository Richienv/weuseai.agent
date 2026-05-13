# Sesi R — Indonesian integrations cascade implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every capability — red, then green, then commit.

**Goal:** Ship shared integration infrastructure (Phase 0) + Slot 1 Xendit end-to-end (Phase 1) + stub SKILL.md scaffolding for Slot 2 (Meta WhatsApp Cloud API) and Slot 3 (OnlinePajak PJAP) + Tokopedia explicit-skip note + closeout report. Built on the locked decisions from research doc `docs/research/2026-05-13-indonesian-tools-integration.md`.

**Architecture:** **Proxy model.** Customer's Hermes VPS sends `{operation, params}` to our Supabase Edge Function with `X-CID` header + HMAC bearer token. The Edge Function decrypts the customer's BYO credential (stored in `integration_credentials` table, AES-256-GCM at rest), calls the third-party API, logs the outcome to `audit_log` (no PII), maps errors to Bahasa, and returns the response. Credentials never leave Supabase. Revocation is immediate (single `revoked_at` column).

**Tech stack:** TypeScript on Supabase Edge Functions (Deno runtime) + Node 20 tests (tsx --test). Web Crypto API for AES-GCM and HMAC (works in both runtimes — no npm deps). Supabase migrations via Mgmt API. Existing skill scaffolding pattern at `agent-packs/<slug>/SKILL.md`.

**Discipline (from founder brief, repeated for clarity):**
- TDD red-then-green throughout (PR #95 discipline).
- Premium Bahasa Indonesia in all customer-facing strings — no SaaS jargon, no backend tech names visible. Match weuseai.agent voice (calm-premium, dark theme `#0a0a0a` / signal-red `#E5322D`).
- Multiple commits sized for review, no bundling.
- Don't touch Sesi A's hardening scope (welcome.html, checkout.html, /welcome trust signals, telemetry, IDCH cleanup).
- Pass-3 regression suite (`tests/pass-3-regression-suite.spec.ts`) must stay green after every commit.
- BYO credentials only — we never host third-party services ourselves.
- Customer can revoke any integration at any time (`revoked_at` column).
- All third-party API calls audit-logged.

**Locked decisions from research doc:**
- D1: Slot order = Xendit → Meta WhatsApp Cloud API → OnlinePajak PJAP.
- D2: PJAP partner = OnlinePajak (only PJAP with self-serve OpenAPI).
- D3: WhatsApp model = Cloud API protocol (Meta direct); BSP recommendation for non-technical customers = AiSensy.
- D4: Shopee credentials = founder submitting Open Platform application in parallel; 2-4 week review clock — NOT in this cascade.
- D5: Tokopedia = skipped for v1; explicit-skip doc only.

---

## Phase 0 — Shared integration infrastructure (5 commits)

All three integrations build on this. Ship before any per-integration work.

### Task 0.1 — Schema migration: `integration_credentials` table

**Files:**
- Create: `supabase/migrations/20260513010000_sesi_r_integration_credentials.sql`

**Step 1 — Migration SQL.** New table with AES-256-GCM ciphertext + IV + auth-tag columns, customer-scoped, RLS enabled, unique constraint `(customer_id, integration)` for one-credential-per-pair. Soft-delete via `revoked_at`.

**Step 2 — Drift test.** `tests/integration-credentials-schema-static.spec.ts` reads the migration file at test time and asserts: table exists, RLS enabled, unique constraint, `revoked_at` nullable, `last_validated_at` nullable, `key_version` defaults to 1.

**Step 3 — Apply via Supabase Mgmt API.** (Founder action OR documented in closeout for founder to run.)

**Step 4 — Commit.**

```bash
git add supabase/migrations/20260513010000_sesi_r_integration_credentials.sql \
        tests/integration-credentials-schema-static.spec.ts
git commit -m "feat(supabase): integration_credentials table for BYO third-party creds"
```

### Task 0.2 — Credential encryption helper (`integration-credential-crypto.ts`)

**Files:**
- Create: `supabase/functions/_shared/integration-credential-crypto.ts`
- Create: `tests/integration-credential-crypto.spec.ts`

**Design:** AES-256-GCM. Key derived from `INTEGRATION_ENCRYPTION_KEY` env (32-byte hex, NEW secret distinct from `HERMES_INSTANCE_HMAC_KEY`). 12-byte random IV per ciphertext. 16-byte auth-tag. Output base64. `encryptCredential(plaintext: object) → { ciphertext, iv, auth_tag, key_version }`. `decryptCredential({ ciphertext, iv, auth_tag, key_version }) → object`. Throws on tag mismatch (tampering).

**Tests:**
- Round-trip: encrypt + decrypt = original.
- Wrong key fails with `decryption_failed`.
- Tampered ciphertext fails with `decryption_failed`.
- Tampered auth_tag fails with `decryption_failed`.
- Missing INTEGRATION_ENCRYPTION_KEY env throws `encryption_key_unset`.
- key_version is preserved through round-trip.

### Task 0.3 — Bahasa error-mapping pattern (`integration-error-mapper.ts`)

**Files:**
- Create: `supabase/functions/_shared/integration-error-mapper.ts`
- Create: `tests/integration-error-mapper.spec.ts`

**Design:** Per-integration error catalog. Maps `(integration, status_code | error_code) → { code, message_bahasa, suggested_action }`. Defaults to "Layanan sementara tidak tersedia. Coba lagi dalam beberapa menit." for unmapped errors.

Initial Xendit catalog (extracted from Xendit's error docs):
- `401` / `INVALID_API_KEY` → `"Akun Xendit kamu tidak valid. Periksa API key di pengaturan integrasi."`
- `402` / `INSUFFICIENT_BALANCE` → `"Saldo Xendit kamu tidak mencukupi untuk transaksi ini."`
- `403` / `FORBIDDEN` → `"Akun Xendit kamu belum punya izin untuk operasi ini."`
- `404` / `DATA_NOT_FOUND` → `"Data tidak ditemukan di Xendit."`
- `429` / `API_VALIDATION_ERROR` (rate limit) → `"Permintaan ke Xendit terlalu sering. Tunggu beberapa detik lalu coba lagi."`
- `500` / `SERVER_ERROR` → `"Layanan Xendit sedang gangguan. Kami coba ulang otomatis."`
- `503` / `SERVICE_UNAVAILABLE` → same as above.
- `DUPLICATE_PAYMENT_REQUEST` → `"Invoice dengan referensi yang sama sudah ada. Cek riwayat invoice kamu."`
- `EXPIRED_API_KEY` → `"API key Xendit kamu sudah kadaluarsa. Ganti dengan key baru di pengaturan."`

**Tests:**
- Each error code maps to a Bahasa string (no banned words, no exclamation marks, no English jargon).
- Unmapped codes return fallback.
- Function is pure (no side effects).
- Bahasa strings pass brand-voice check (no `basically`, `just`, `literally`, etc.).

### Task 0.4 — Integration audit-log helper

**Files:**
- Create: `supabase/functions/_shared/integration-audit-log.ts`
- Create: `tests/integration-audit-log.spec.ts`

**Design:** Thin wrapper around the existing `audit_log` table. `logIntegrationCall({ customer_id, integration, operation, outcome: "ok" | "error", meta? })` inserts with `action = "${integration}.${operation}"`, `target = customer_id`, `result = outcome`, `meta = { ...meta, no_pii_sweep_passed: true }`. Meta-sanitizer strips known PII keys (`api_key`, `phone`, `email`, `name`, `address`, `nik`, `npwp`) before write.

**Tests:**
- Inserts row with right shape.
- PII sweep strips banned keys from meta.
- Outcome enum validation.
- DB error doesn't crash caller (logged + swallowed — audit is best-effort, not blocking).

### Task 0.5 — Skill scaffolding template + preflight check pattern

**Files:**
- Create: `agent-packs/_shared/skills/integration-preflight/SKILL.md`
- Create: `agent-packs/_shared/skills/integration-preflight/README.md` (developer-facing only)

**Design:** Reusable SKILL.md template documenting the standard preflight handshake every integration follows: (1) call `GET /integration-credentials/<integration>` with X-CID + HMAC bearer → 200 if credential live, 404 if not configured, 410 if revoked. (2) If not configured/revoked, surface Bahasa-friendly onboarding link. (3) If live, proceed with the operation via `POST /integration-call/<integration>` proxy.

Standard Bahasa fallback copies for the 3 preflight outcomes (configured / not_configured / revoked).

---

## Phase 1 — Xendit integration end-to-end

**Skill slug:** `/xendit`

### Task 1.1 — Xendit integration-proxy Edge Function

**Files:**
- Create: `supabase/functions/_shared/integration-proxy-xendit-handler.ts`
- Create: `supabase/functions/integration-proxy-xendit/index.ts` (Deno entrypoint)
- Create: `tests/integration-proxy-xendit-handler.spec.ts`

**Design:** Single Edge Function `/integration-proxy-xendit` accepting `POST { operation, params }`. Routes to per-operation handlers (`invoice.create`, `invoice.get`, `refund.create`, `balance.get`, ...). Auth: X-CID header + Authorization Bearer HMAC token (same pattern as existing customer-progress-proxy / customer-readiness). Loads credential via `integration_credentials` table, decrypts via `integration-credential-crypto`. Calls Xendit. Logs via `integration-audit-log`. Maps errors via `integration-error-mapper`.

**Tests:** Standard handler test pattern. Mock Xendit fetch client. Verify: X-CID enforcement (403 on mismatch), HMAC bearer enforcement (401 on bad token), credential-not-configured (404 / Bahasa copy), revoked credential (410 / Bahasa copy), happy-path operation routing, error-mapping, audit-log write.

### Task 1.2 — Capability 1: `invoice.create`

TDD red→green for: minimal valid invoice creation with Bahasa product description + IDR amount + 24-hour expiry default. Returns `{ id, invoice_url, status, expiry_date }`. Real Xendit sandbox integration test (deferred to founder smoke step in closeout).

### Task 1.3 — Capability 2: `invoice.get` (status check)

TDD red→green for: status fetch by Xendit invoice id. Returns `{ status, paid_at?, paid_amount?, payment_method? }`. Bahasa-mapped status enum.

### Task 1.4 — Capability 3: `refund.create`

TDD red→green for: full or partial refund. Validates refund amount ≤ original. Returns `{ id, status, refund_amount, refund_reason }`. Xendit refund-specific error codes mapped to Bahasa (`REFUND_NOT_SUPPORTED_BY_CHANNEL` for Indomaret OTC, etc.).

### Task 1.5 — Capability 4: `balance.get`

TDD red→green for: balance enquiry for `account_type = CASH`. Returns `{ balance_idr, account_type, available_at }`. Single Xendit endpoint; trivial wrapper.

### Tasks 1.6-1.8 — Deferred to follow-on cascade

The remaining Phase 1 capabilities are deferred to the **next** cascade so the first ship is reviewable in one sitting:

- 1.6 — `invoice.send_link` via Telegram (requires Telegram-bot integration; depends on existing per-customer bot token).
- 1.7 — Xendit webhook receiver + customer notification routing.
- 1.8 — Sandbox smoke test (founder runs against own Xendit sandbox account).

Closeout report (Phase 5) documents these as next-cascade triggers.

### Task 1.9 — `/xendit` SKILL.md

**Files:**
- Create: `agent-packs/xendit/SKILL.md`
- Create: `agent-packs/xendit/manifest.json`

**Design:** SKILL.md instructs the Hermes LLM:
- When to activate (user mentions: buat invoice, kirim tagihan, cek pembayaran, refund, saldo).
- Required preflight: call `GET /integration-credentials/xendit` first.
- API surface: 4 capabilities mapped to proxy endpoints.
- Required customer onboarding flow when credential missing: agent asks for Xendit API key via Telegram, validates via `POST /integration-credentials/xendit/validate`, stores encrypted.
- Voice signature: calm-premium, Bahasa-first, signal-red brand.

### Task 1.10 — Credential onboarding handler

**Files:**
- Create: `supabase/functions/_shared/integration-credential-handler.ts`
- Create: `tests/integration-credential-handler.spec.ts`

**Design:** Endpoints:
- `GET /integration-credentials/:integration` — returns `{ configured: boolean, label?, last_validated_at?, revoked: boolean }` (NEVER returns ciphertext / plaintext).
- `POST /integration-credentials/:integration` — accepts `{ api_key, label }`, validates against the third-party service (Xendit: `GET /balance` to confirm key works), encrypts, stores. Returns `{ configured: true, last_validated_at }`.
- `DELETE /integration-credentials/:integration` — sets `revoked_at = now()`. Idempotent.

All three: X-CID + HMAC bearer auth. Audit-logged.

---

## Phase 2 — Meta WhatsApp Cloud API stub (NOT a build)

**Files:**
- Create: `agent-packs/whatsapp-cloud-api/SKILL.md`
- Create: `agent-packs/whatsapp-cloud-api/manifest.json` (minimal — slot 2 deferred)
- Create: `agent-packs/whatsapp-cloud-api/README.md` (developer-facing rationale + deferred trigger)

**Documents:**
- Integration target = Meta Cloud API protocol (D3 lock).
- Customer onboarding paths: Meta direct (technical) OR AiSensy reseller (recommended easy path).
- Required credentials: WABA ID, phone number ID, access token (system user or AiSensy-issued).
- Capabilities planned per research doc: `message.send_text`, `message.send_template`, `message.send_media`, `webhook.receive`, `conversation.history`.
- Why deferred: pending first paying customer feedback on Xendit. Trigger to ship Slot 2 = first paying customer asks for WA broadcast OR Slot 1 stable for 14+ days.

---

## Phase 3 — OnlinePajak PJAP stub (NOT a build)

**Files:**
- Create: `agent-packs/onlinepajak/SKILL.md`
- Create: `agent-packs/onlinepajak/manifest.json`
- Create: `agent-packs/onlinepajak/README.md`

**Documents:**
- Integration target = OnlinePajak Reseller API (D2 lock).
- Customer onboarding: requires PKP registration confirmation + EFIN + sertifikat elektronik (.p12) upload (one-time founder-touch).
- Required credentials: OnlinePajak API key (reseller-scoped).
- Capabilities planned: `faktur.create`, `faktur.list`, `spt.file`, `spt.status`, `bpe.retrieve`.
- Why deferred: narrower subset audience (PKP businesses only). Trigger = first PKP customer signs up OR explicit founder strategic call to ship as moat play.
- Liability gate (per research doc §5): every submission MUST surface explicit "taxpayer reviews and authorizes" step before calling OnlinePajak — preserves bright-line tax liability.

---

## Phase 4 — Tokopedia explicit-skip doc

**Files:**
- Create: `docs/integrations/tokopedia-deferred.md`

**Documents:**
- Decision: skipped for v1 (D5 lock).
- Reason: post-TikTok-Shop migration creates rewrite risk; Shopee Open Platform covers 54% of the same audience with cleaner partner-approval path; SIUP + manual approval gate adds 2-6 week founder-touch cost without proportional unlock.
- Re-evaluation triggers: (a) paying customer explicitly requests Tokopedia AND is willing to wait through integration cost, OR (b) TikTok Shop Partner Center migration stabilizes (no schema changes for 90 days) AND we have spare implementer-bandwidth.

---

## Phase 5 — Closeout report

**Files:**
- Create: `docs/audit/2026-05-13-sesi-r-cascade-closeout.md`

**Documents:** Standard cascade closeout — what shipped, what's deferred, founder verification path, test count delta, next-cascade triggers.

---

## Test count baseline

Pre-cascade: ~1400 tests (per CLAUDE.md). Target post-cascade: +30-50 new tests across Phase 0 + Phase 1. Pass-3 regression suite (`tests/pass-3-regression-suite.spec.ts`) must remain green.

## Verification before each commit

```bash
npm run test           # tsx --test tests/*.spec.ts
npm run typecheck:all  # all workspace TS configs
```

## Open dependencies on founder

1. Apply Supabase migration (Task 0.1) via Mgmt API — automated in this cascade IF Mgmt API token is available; otherwise founder one-step.
2. Set `INTEGRATION_ENCRYPTION_KEY` Supabase secret — `openssl rand -hex 32` → `supabase secrets set INTEGRATION_ENCRYPTION_KEY=<hex>`.
3. (Phase 1 verification only) Provide Xendit sandbox API key for one-time smoke test, OR confirm cascade closes with documented next-step instead.
