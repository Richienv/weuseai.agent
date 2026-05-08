# Pair-flow bug — root-cause analysis (2026-05-09)

> **Severity:** P0 — production-blocking. First concierge customer onboarding cannot complete pairing without manual founder intervention.
> **Reported:** 2026-05-09 by founder.
> **Investigation status:** Root cause identified. Fix-path recommendation pending founder decision.

---

## Symptoms (reproduced from founder's report)

1. After payment success, `/welcome.html?cid=...` shows state C with the "Lengkapi profil agent saya" CTA.
2. Click CTA → opens `/onboarding.html?cid=...`.
3. **~1s later, the page jumps directly to the pairing screen** showing a 6-digit code (e.g. `977841`). User never sees the WhatsApp confirmation form (Step 1) or the agent expectations textarea (Step 3).
4. User opens Telegram, sends `/pair 977841` to `@weuseaibot`.
5. **Bot replies: `Unknown command /pair`** instead of completing pairing.
6. Refreshing `/onboarding.html` and retrying returns the **same code** (e.g. `977841` again, not a new code).

Net effect: pairing never completes; `customers.telegram_chat_id` stays `NULL`; the polling loop in `onboarding.html` never resolves; user is stuck.

---

## Two distinct bugs in one symptom set

The report bundles two independent issues. Address them separately:

### Bug 1 (UX): Auto-jump past Step 1 and Step 3

**Where:** `onboarding.html` lines 952–962 — the boot resume rules.

```js
if (customer.telegram_chat_id && customer.whatsapp_number) {
  setStep('3');                  // already paired + WA known → jump to expectations
} else if (customer.telegram_chat_id) {
  setStep('1');                  // paired but missing WA → confirm WA
} else if (customer.whatsapp_number) {
  setStep('2');                  // ◄── HERE: WA already known, no pairing → JUMP TO PAIRING
} else {
  setStep('1');                  // fresh, start at Step 1
}
```

**Why this fires today:** the customer's `whatsapp_number` is already populated server-side at checkout time (Xendit pre-fill or earlier flow). The boot logic interprets "WA known + not paired" as "resume pairing in progress" and skips Step 1 entirely. There's no animation or transition — Step 2 just renders ~1s after page load (one round-trip to fetchCustomer).

**Founder's mental model mismatch:** founder expects `Welcome → Profile completion form → Pairing`. Current flow is `Welcome → Step 1 (WA confirm) → Step 2 (Pairing) → Step 3 (Expectations) → Submit`, AND the resume rule above can skip Step 1 entirely.

**Severity:** UX-blocking but not data-loss. Customer sees pairing without context; harder to interpret.

### Bug 2 (architectural): Webhook silently overridden by Hermes long-poll

**Where:** Conflict between two consumers of the same Telegram bot token (`@weuseaibot`):
- **Our Supabase Edge Function** `telegram-bot-webhook` (configured via `setWebhook` to receive `/pair` commands).
- **Upstream NousResearch/hermes-agent** running on founder's test VPS, which uses **long-polling** (`getUpdates`) for its Telegram integration. Per CLAUDE.md "Kita pakai NousResearch/hermes-agent — bukan custom build" — Hermes' built-in Telegram skill auto-calls `deleteWebhook()` on boot to ensure clean polling.

**Telegram Bot API rule:** a bot can have either a webhook OR an active long-poll, not both. Whichever consumer last called `setWebhook` (with URL) or `deleteWebhook` (or the first `getUpdates` after `deleteWebhook`) wins.

**Reproduction sequence:**
1. Founder runs `setWebhook` → URL points to Supabase Edge Function. ✓
2. Founder boots Hermes test VPS with `TELEGRAM_BOT_TOKEN=<weuseaibot_token>` in `/home/weuseai/.hermes/.env`.
3. Hermes Telegram integration startup calls `deleteWebhook` (standard hygiene) and starts `getUpdates` long-poll loop.
4. Now Hermes consumes ALL `@weuseaibot` messages, including `/pair <code>`.
5. Hermes' built-in command parser does NOT recognize `/pair` (it's a Hermes runtime, not our pairing handler) → replies `Unknown command /pair`.
6. Our Supabase webhook never fires; `customers.telegram_chat_id` stays `NULL`.

**Verification step (founder must run, since we don't have the bot token):**
```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo" | jq
```
Expected output if conflict is active:
```json
{
  "ok": true,
  "result": {
    "url": "",                              ← empty = webhook disabled
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_synchronization_error_date": ...,
    "max_connections": 40,
    "ip_address": "..."
  }
}
```
Expected output if webhook intact:
```json
{
  "ok": true,
  "result": {
    "url": "https://gtjgsligllbjcisiyrah.supabase.co/functions/v1/telegram-bot-webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    ...
  }
}
```

If `result.url` is empty, the conflict is confirmed. Founder action required to verify.

**Severity:** P0 — pairing cannot complete without founder manually re-setting the webhook AFTER stopping Hermes on the test VPS, then sending `/pair` AND THEN restarting Hermes. Not a viable customer flow.

### Non-bug: "same code returned on refresh"

This is intentional, NOT a bug. Per `rotate-pairing-code-handler.ts` lines 78–90 (and confirmed by the spec comment "important UX detail per the spec"):

```js
// Reuse case: a fresh, unexpired code already exists. Return it
// without rotating — saves a round-trip + keeps the code stable
// across tab reloads ...
```

The 30-min TTL is the rotation cadence; refreshing within the TTL window returns the same code. The founder's expected behavior says "fresh code per session, 30 min TTL" — these are subtly different. Recommend: keep current behavior (stable code per TTL window), since rotating per session-load would invalidate codes the user might have already typed into Telegram.

---

## Architecture: where the architectural conflict comes from

Today's design (Phase 1):

```
                  ┌─── Customer's Telegram client ───┐
                  │                                  │
         /pair 977841 messages                   /any other text
                  │                                  │
                  ▼                                  ▼
        ┌──────────────────── @weuseaibot bot ────────────────┐
        │  TELEGRAM_BOT_TOKEN owned by founder                │
        └────────────────────────┬────────────────────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
   setWebhook to Supabase           deleteWebhook + getUpdates
   (our pairing handler)            (Hermes runtime on customer VPS)
                  │                             │
                  ▼                             ▼
   handleTelegramBotWebhook    Hermes built-in Telegram skill
   in supabase/functions/      (does NOT know about /pair)
   telegram-bot-webhook/
```

**The single bot is shared between two consumers with mutually-exclusive Telegram delivery modes.** This works fine for ONE customer's VPS (the founder's test) only when no webhook is set; it breaks immediately when N customers' Hermes runtimes all try to long-poll the same bot.

For N customers, this design doesn't scale at all — Telegram only allows ONE long-poll consumer per bot. So even if we fixed Bug 1 perfectly, customer 2's Hermes would block customer 1's Hermes.

This is the deeper issue: **Phase 1 architecture assumed a single shared bot for both pairing AND customer-runtime Telegram delivery.** That's incompatible with the model "each customer has their own Hermes on their own VPS."

---

## Fix-path options

### Option A — Per-customer bot (RECOMMENDED for production)

**Architecture:**
- `@weuseaibot` becomes **pairing-only**. We always own this token. Webhook permanently registered to our Supabase Edge Function. No customer Hermes ever long-polls it.
- During onboarding (between Step 1 and Step 2 of `onboarding.html`), customer creates their own bot via `@BotFather` → gets a fresh token (e.g. `@andyfounder_agent_bot`).
- Customer pastes the new token into a NEW field in onboarding (Step 1.5 or Step 3 prompt).
- complete-onboarding-handler stores the customer's bot token in `customers.telegram_bot_token` (encrypted column).
- Provisioning service writes the customer's bot token (NOT `@weuseaibot`'s token) into `/home/weuseai/.hermes/.env` on their VPS.
- Customer's Hermes long-polls THEIR bot. No conflict with ours.

**Flow:**
1. User pays → welcome page → onboarding → Step 1 (WA confirm).
2. Step 2: "Buat bot Telegram kamu sendiri (60 detik)" — visual walkthrough of `@BotFather` `/newbot`. Customer pastes token.
3. Step 3: `/pair <code>` to OUR `@weuseaibot` (still our pairing-only bot). Webhook captures, links chat ID + customer's bot token to customers row.
4. Step 4: Expectations textarea, submit.
5. Provisioning: customer's VPS gets THEIR bot token, runs `Restart=always`, customer chats with their own bot.

**Trade-offs:**
- ✓ Cleanly scales to N customers
- ✓ Each customer has their own brand surface (custom bot name)
- ✓ Pairing handler can stay simple (single-bot webhook)
- ✓ No proxy/gateway layer
- ✗ One extra step in onboarding flow (BotFather walk-through). Adds ~60s to onboarding.
- ✗ Customer needs to understand "your own bot" concept. Document well.
- ✗ Customer who deletes their bot or revokes the token = silent breakage. Need monitoring.

**Implementation effort:** ~3 working days.
- Day 1: Schema migration (`customers.telegram_bot_token` encrypted column) + new onboarding step UI + BotFather walkthrough copy.
- Day 2: Update `complete-onboarding-handler` to require bot token; update provisioning to inject customer's token into VPS env.
- Day 3: Migration for existing test customers (founder's VPS) + runbook for token rotation + smoke test.

### Option B — Webhook-forwarding gateway

**Architecture:**
- Build a proxy service that receives the webhook on `@weuseaibot`.
- Routes `/pair <code>` commands → our Supabase pairing handler.
- All other messages → customer's Hermes via "long-poll-on-demand" (proxy holds a virtual long-poll queue per customer chat ID).

**Flow:**
1. Customer chats with `@weuseaibot` (our shared bot).
2. Webhook hits proxy.
3. Proxy reads message text. If `/pair X`, forward to Supabase. Otherwise, look up `chat_id → customer_id → vps_endpoint` and POST to customer's Hermes inbound endpoint.

**Trade-offs:**
- ✓ Customer onboarding stays one fewer step (no BotFather)
- ✓ Brand consistency: every customer talks to `@weuseaibot`
- ✗ Proxy is a single point of failure. If it crashes, ALL customer Telegram delivery breaks.
- ✗ Hermes' Telegram skill expects long-poll OR webhook; making it accept inbound POST from a proxy requires Hermes-side patches OR a stub long-poll source.
- ✗ Adds infra: a new always-on service (Fly machine, scaling, monitoring).
- ✗ Latency: every message round-trips through our proxy.
- ✗ Conflicts with CLAUDE.md "Kita nggak fork, nggak modifikasi kode upstream Hermes" — accepting inbound from proxy likely needs upstream patch.

**Implementation effort:** ~7-10 working days.

### Option C — `/pair` skill in Hermes default bundle (QUICK-FIX)

**Architecture:**
- Add a `/pair <code>` skill to the per-agent bundle library.
- Hermes recognizes `/pair` command on long-poll → calls our pairing-completion endpoint directly (NOT via webhook, just authenticated REST).
- Webhook stays disabled (Hermes long-poll wins, as today).

**Flow:**
1. Customer pays → onboarding shows pairing code.
2. Customer's Hermes is already long-polling `@weuseaibot`.
3. `/pair 977841` → Hermes /pair skill invoked → POST to Supabase `pair-complete-handler` (NEW Edge Function) with `{customer_id, code, telegram_chat_id_from_message}`.
4. Pair-complete validates code, links chat ID, replies success.

**Trade-offs:**
- ✓ Minimal code change. ~2 working days.
- ✓ No customer onboarding change.
- ✗ Same architectural problem at N customers: only ONE Hermes can long-poll `@weuseaibot`. Customer 2's Hermes will block Customer 1's.
- ✗ Couples Hermes runtime to our pairing logic — but per CLAUDE.md, we ship Hermes upstream as-is. We'd need to add the `/pair` skill via the per-agent bundle pull at boot, which is fine — but only if the bundle pull happens before the customer's first Telegram message.
- ✗ During pairing window the customer's Hermes-on-VPS hasn't booted yet (VPS is still being provisioned!). So there's a race condition: customer can send `/pair` before their Hermes is up. The webhook approach is what handles this race today.

**Verdict on Option C:** Doesn't actually solve the problem because **at pairing time, the customer's VPS isn't running yet.** Pairing happens BEFORE provisioning completes. So Hermes long-poll on customer's VPS can't handle `/pair` — the message has to land somewhere else. Option C is not viable.

---

## Recommendation

**Adopt Option A (Per-customer bot) for production.**

Rationale:
1. **Only option that actually scales.** B has SPOF + Hermes patch risk. C doesn't work due to the boot-order race.
2. **Lowest infrastructure overhead.** No new services, no proxy, no gateway. Just one column + one onboarding step.
3. **Aligns with CLAUDE.md "Kita nggak fork upstream Hermes"** — customer's bot just plugs into Hermes' standard `TELEGRAM_BOT_TOKEN` env. Zero modification.
4. **3 days of effort vs 7-10 for Option B.**
5. **Better customer brand surface** (their own bot name).

**Sequence to ship Option A:**

```
Day 0 (immediately): Founder confirms approval; founder runs getWebhookInfo to verify the conflict diagnosis.

Day 1: Schema + UI
  - migration: ALTER TABLE customers ADD COLUMN telegram_bot_token text
    (use Supabase Vault or pgsodium for at-rest encryption)
  - onboarding.html: insert "Buat bot Telegram kamu" step between current Step 1 and Step 2
    (visual walkthrough: open BotFather → /newbot → name → username → paste token)
  - regex validate: token format `^\d+:[A-Za-z0-9_-]+$`

Day 2: Backend
  - complete-onboarding-handler: require telegram_bot_token in body, persist
  - provisioning service: write customer's token to /home/weuseai/.hermes/.env
    (replaces today's hardcoded weuseaibot token)
  - rotate-pairing-code-handler: unchanged (still uses our @weuseaibot)
  - telegram-bot-webhook-handler: unchanged (still receives /pair on @weuseaibot)

Day 3: Migration + smoke
  - One-shot script: for existing test customers (founder), rotate their bot token to a per-customer one
  - Smoke: provision a fresh customer end-to-end with new flow
  - Founder runs getWebhookInfo post-deploy to verify @weuseaibot webhook is still set

Bug 1 (UX auto-jump) ALSO fixes naturally in Option A:
  - The new BotFather step lives between Step 1 and pairing
  - The boot rule "if WA known, jump to Step 2" no longer applies — the boot now needs to check
    "does customer have telegram_bot_token AND whatsapp AND telegram_chat_id?" — three booleans,
    so resume rules read more naturally and Step 1 always shows for fresh customers.
```

**If launch deadline pressure forces a 1-day shortcut: don't ship Option C (boot-race issue).** Instead ship just the Bug-1 UX fix (force boot to always start at Step 1 even if WA exists) + manually re-set the webhook on @weuseaibot after every Hermes restart. This is brittle but unblocks demo onboarding for the founder's first concierge customer while Option A ships in parallel.

---

## Bug-1 UX standalone fix (independent of Option A/B/C, ship anyway)

Even after the architectural fix, the resume-rule auto-jump is an unrelated UX bug. Fix:

```diff
--- a/onboarding.html
+++ b/onboarding.html
@@ -952,12 +952,16 @@
-      // Resume rules:
-      //   - telegram_chat_id set + whatsapp known → jump to Step 3
-      //   - telegram_chat_id set + whatsapp missing → jump to Step 1
-      //     (need WA before submit; Step 1 submit will skip Step 2)
-      //   - whatsapp_number set + chat_id null → jump to Step 2
-      //   - otherwise Step 1
+      // Resume rules (revised 2026-05-09 — bug-1 fix):
+      //   - telegram_chat_id set + whatsapp set → jump to Step 3 (true resume from
+      //     completed pairing; user just needs expectations)
+      //   - otherwise → always start at Step 1
+      //
+      // Previous behavior auto-jumped to Step 2 if WA was already populated
+      // server-side (e.g. from Xendit checkout). That skipped the WA confirm
+      // screen and made the pairing screen appear ~1s after CTA click — confusing.
+      // New rule: always confirm WA first, then route from Step 1 submit.
       if (customer.telegram_chat_id && customer.whatsapp_number) {
         setStep('3');
-      } else if (customer.telegram_chat_id) {
-        setStep('1');
-      } else if (customer.whatsapp_number) {
-        setStep('2');
       } else {
         setStep('1');
       }
```

The `step1-form` submit handler at line 668 already does the right routing after Step 1:
```js
if (customer.telegram_chat_id) setStep('3');
else setStep('2');
```
So removing the boot-time auto-jump is safe — Step 1 submit takes over.

---

## Open questions for founder

**Q-Bug-1:** Approve the standalone UX fix (always start at Step 1, regardless of WA presence)? Independent of Option A/B/C.

**Q-Bug-2:** Approve **Option A** (per-customer bot via BotFather) as the production fix-path? Reject Option B (gateway) and Option C (Hermes /pair skill, not viable due to boot-race).

**Q-Bug-3:** Founder runs `getWebhookInfo` and confirms whether `result.url` is empty (conflict confirmed) or still set to Supabase (different cause to investigate).

**Q-Bug-4:** Launch deadline pressure: do you need a 1-day shortcut, or can we ship Option A in 3 days?

---

## Files investigated

- `welcome.html` (lines 268–305): State C and C2 CTAs.
- `onboarding.html` (lines 514–605, 678–795, 912–973): boot logic, resume rules, pairing flow, polling.
- `supabase/functions/_shared/telegram-bot-webhook-handler.ts` (137 lines): pairing webhook handler — implementation correct.
- `supabase/functions/_shared/rotate-pairing-code-handler.ts` (lines 78–90): code reuse logic — intentional, not a bug.
- `supabase/functions/_shared/pairing-code.ts`: 6-digit + 30min TTL — matches founder's mental model.
- `supabase/functions/_shared/complete-onboarding-handler.ts`: requires `telegram_chat_id` before submit — architectural constraint that pairing must complete before final submit.
- `services/hermes/src/adapters/telegram-broker.ts`: our service is send-only; the long-poll happens in upstream NousResearch/hermes-agent on customer VPS.

---

## Test plan after fix lands

- [ ] Provision a fresh test customer end-to-end. Confirm pairing completes via webhook.
- [ ] Verify `/welcome.html?cid=...` → click "Lengkapi profil agent saya" → `/onboarding.html` lands at Step 1 (WA confirm), NOT Step 2.
- [ ] Verify Step 1 submit → Step 2 (BotFather token field, in Option A).
- [ ] Verify Step 2 submit → Step 3 (pairing).
- [ ] Verify `/pair <code>` to `@weuseaibot` → bot replies success message; `customers.telegram_chat_id` populates within 3s; page polling detects + auto-advances to Step 4 (expectations).
- [ ] Verify expectations submit → `complete-onboarding-handler` succeeds → redirect to welcome page state C2.
- [ ] Concurrent test: provision 2 customers in parallel. Confirm both can pair without one blocking the other (validates Option A scaling claim).
- [ ] Founder runs `getWebhookInfo` post-deploy: confirms webhook URL still set to Supabase (no Hermes-side `deleteWebhook` racing).
