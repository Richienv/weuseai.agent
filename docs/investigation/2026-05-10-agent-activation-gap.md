# 2026-05-10 — Agent activation gap (Phase 1 investigation)

> **Status:** Phase 1 read-only investigation. NO code changes shipped.
> Awaiting founder review before authorising Phase 2 (fix cascade).

## TL;DR

Customer e282ce25 paid, paired their bot, completed onboarding step 4
end-to-end — yet Hermes never greets them. Three distinct bugs stack:

1. **Welcome page button is hardcoded** to `https://t.me/` (fixable in
   ≤30 min, ship as a quick win).
2. **Bot's Telegram-side webhook is still ours** — `safeDeleteWebhook`
   in `complete-onboarding-handler` step 8b either failed silently or
   the webhook re-asserts. Effect: every customer message gets the
   "kamu sudah pair" canned reply from `pair-customer-bot-webhook`.
3. **VPS config is stale by architectural design** — when `complete-
   onboarding` calls `provisioning.spinUp()` for a customer whose VPS
   already exists, provisioning returns the existing record without
   updating `.env`. Customer e282ce25's VPS was created **2026-05-06,
   3 days BEFORE the per-customer-bot architecture (Pair-flow Option
   A) shipped on 2026-05-09**. The customer's current bot token
   (`@testaiagentrenbot`) was never written to the VPS. Hermes is
   polling Telegram for whatever bot was configured at first VPS
   spin-up (likely empty / shared @weuseaibot).

Bug #3 is the root cause and is **architectural, not a missed wire**.
Bug #2 is a downstream consequence — even if .env were fresh, Hermes
can't long-poll while a webhook is set on the bot.

## Evidence

### Customer e282ce25 row (post-onboarding)

```
display_name           = "Sarah Test"           (set by Track 3 PR #57)
email                  = "kidnovell.richie@…"   (set at checkout)
whatsapp_number        = "082154902561"
telegram_chat_id       = "6805409051"           (set by step 3 /pair)
telegram_bot_username  = "testaiagentrenbot"    (set by step 2 validate-bot-token)
telegram_bot_token     = <encrypted, present>
soul_md_text           = <full SOUL.md, "The Pro" persona, 2.5KB>
pairing_code           = null
pairing_code_expires_at = null
```

All step-4 requirements met (chat_id, soul_md_text, subscription
status), so complete-onboarding ran fully today.

### Subscriptions

3 active rows, all `tier=pro`, `status=active`, `hosting_active=true`.
Earliest started 2026-05-09 23:54; latest 2026-05-10 03:12. Founder
paid multiple times during testing.

### customer_persona_audit

Single row, `id=9`, `generated_at=2026-05-10 06:30:46 UTC` —
confirms `complete-onboarding-handler` step 5 ran today
(audit insert is line 152 of `complete-onboarding-handler.ts`).

### vps_instances

```
id                  = b3fcd11f-310e-4ec9-a7fa-46aefb2e744a
customer_id         = e282ce25-…
vps_id              = 967550cd-4979-4989-9de8-830d3fa8334a   ← matches URL job=
idcloudhost_vps_id  = 967550cd-…
provider            = idcloudhost
ip_address          = 27.112.79.139                          ← real Jakarta IP
region              = jkt01
status              = "running"
created_at          = 2026-05-06 17:13:59 UTC                ← 4 days old
```

VPS reachability probe (just now):

```
ssh:22  → OPEN              (machine alive)
http:80 → 301               (something HTTP listening)
http:7777 → timeout/refused (Hermes gateway default, NOT listening publicly)
```

VPS is alive. Hermes gateway port not exposed to public, which is
expected (Hermes is a long-poller, doesn't need to listen).

### Bot webhook state

Direct verification (Telegram `getWebhookInfo`) blocked: requires
decrypting `customers.telegram_bot_token` with `BOT_TOKEN_ENC_KEY`,
which is a Supabase Edge Function secret not exposed to my local env.

**Indirect confirmation** — founder reports bot replies "Bot kamu
sudah dipasangkan. Tutup tab onboarding dan tunggu pesan halo dari
agent." to ALL messages post-pair. That string is `REPLY_ALREADY_PAIRED`
at `pair-customer-bot-webhook-handler.ts:57`, returned only when
Telegram delivers a message to OUR webhook AND `customer.telegram_chat_id`
is already set. Therefore: **the customer's bot webhook is still
pointed at our `pair-customer-bot-webhook`**. `safeDeleteWebhook`
in `complete-onboarding-handler.ts:225` must have failed silently
(it swallows all errors per its "best-effort" docstring).

## Expected vs actual flow

### Expected (per code as written + Pair-flow Option A docs)

```
1. Customer pays                → xendit-webhook → provisioning.spinUp()
                                                   → VPS created, Hermes
                                                     installed with empty
                                                     bot config
2. Customer onboards step 1     → save-onboarding-profile (Track 3 PR #57)
                                  → display_name + email + whatsapp saved
3. Customer onboards step 2     → validate-bot-token
                                  → bot token encrypted into customers row
                                  → setWebhook on customer's bot pointing
                                    at /functions/v1/pair-customer-bot-
                                    webhook?cid=…
4. Customer onboards step 3     → /pair <code> on their bot
                                  → pair-customer-bot-webhook fires
                                  → telegram_chat_id captured
                                  → "Pairing berhasil" reply
5. Customer onboards step 4     → complete-onboarding-handler
                                  → SOUL.md generated
                                  → LLM key minted
                                  → provisioning.spinUp() — EXPECTED to
                                    update VPS .env with new bot token +
                                    SOUL.md (DOES NOT in current code)
                                  → safeDeleteWebhook on customer's bot
                                  → subscription flipped active
6. Hermes polls Telegram        → receives /start, /chat, etc.
                                  → reads SOUL.md, replies via per-customer
                                    bot token
                                  → "Pagi, Sarah. Aku The Pro …"
```

### Actual (this customer)

```
1. May 6: customer paid         → VPS created with empty bot config
                                  (per-customer arch didn't exist yet)
2. May 10: customer pays again  → xendit-webhook calls spinUp →
                                  customer-flow.ts:124 finds existing
                                  VPS → returns existing without re-config
3. step 1 ran                   → display_name = "Sarah Test"
4. step 2 ran                   → validate-bot-token wrote bot token
                                  to DB AND set webhook on @testaiagentrenbot
                                  pointing at our pair-customer-bot-webhook
5. step 3 ran                   → /pair captured chat_id, bot replied
                                  "Pairing berhasil"
6. step 4 ran                   → complete-onboarding generated SOUL.md
                                  (matches DB), called provisioning.spinUp
                                  → SAME idempotent return, no re-config
                                  → safeDeleteWebhook failed silently OR
                                    succeeded but Telegram still routes
                                    to our webhook (race / Telegram
                                    propagation lag)
7. Customer's bot               → STILL on our webhook → REPLY_ALREADY_PAIRED
8. Hermes on May-6 VPS          → polling Telegram with stale / empty bot
                                  token → never sees @testaiagentrenbot
                                  messages → silent
9. Welcome page state C2        → "Buka Telegram" button → href hardcoded
                                  https://t.me/ → telegram.org generic
```

## Where the gap is (file:line evidence)

### Bug #1 — Welcome page button (TRIVIAL FIX)

**File:** `welcome.html:501`

```html
<a
  href="https://t.me/"   ← HARDCODED, never replaced
  class="btn-primary focus-ring"
  target="_blank"
  rel="noopener noreferrer"
>
  Buka Telegram
  <span aria-hidden="true">→</span>
</a>
```

The state-C2 render block has no `${customer.telegram_bot_username}`
interpolation. There's no fetch of the customer's bot username on
welcome.html either. The page knows `cid` (URL param) but never
looks up the bot.

**Fix shape:** add a `fetchBotUsername(cid)` helper that hits
`/rest/v1/customers?id=eq.${cid}&select=telegram_bot_username` with
the X-CID header (Sesi D P0-2 pattern), set `href = `https://t.me/${u}``
when state C2 renders. Estimated 30 min including a drift test.

### Bug #2 — Bot webhook still ours (RUNTIME FAILURE, NOT WIRING)

**File:** `complete-onboarding-handler.ts:225` calls
`safeDeleteWebhook(deps.telegram, customerBotToken)`. The helper
(line 224, "best-effort: failure here doesn't block onboarding")
swallows all errors silently. If the call fails (rate-limit, network
blip, wrong token, Telegram API error), the webhook stays set.

`pair-customer-bot-webhook-handler.ts:57` defines the canned reply
that fires when chat_id is already set:

```ts
const REPLY_ALREADY_PAIRED =
  'Bot kamu sudah dipasangkan. Tutup tab onboarding dan tunggu pesan halo dari agent.'
```

`pair-customer-bot-webhook-handler.ts:122-128`:

```ts
if (customer.telegram_chat_id) {
  await safeReply(deps.telegram, botToken, message.chat.id, REPLY_ALREADY_PAIRED)
  return ok({ replied: 'already_paired' })
}
```

This is the path founder is hitting. Confirmation is mechanical:
the literal string the bot returned is REPLY_ALREADY_PAIRED.

**Fix shape options:**
- (a) Make `safeDeleteWebhook` non-silent — surface the result,
  retry on failure, alert on permanent failure.
- (b) Move webhook deletion onto a background worker that retries.
- (c) Have Hermes call `deleteWebhook` defensively on boot (the
  setup-script comment at line 215 of `cloud-init.ts` claims it
  does — but I haven't verified upstream Hermes does this).

Estimated: ~2-4 hours for option (a) + alert + retry.

### Bug #3 — Stale VPS .env (ARCHITECTURAL)

**File:** `services/provisioning/src/customer-flow.ts:124-134`

```ts
// ── Idempotency ──
const existing = await deps.store.findActiveVPSByCustomer(opts.customerId)
if (existing) {
  log(`Already exists: ${existing.vps_id} (status: ${existing.status})`)
  return {
    vpsId: existing.vps_id,
    ip: existing.ip_address ?? null,
    status: existing.status === 'running' ? 'running' : 'provisioning',
    done: Promise.resolve(),
  }
}
```

Idempotency check returns the existing VPS without:
- Re-running the setup script
- Updating .env (TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, SOUL.md)
- Restarting `hermes-gateway` to pick up new env

**This is by design** — the existing comment block in `setup-script.ts`
acknowledges customer can paste a token later via the dashboard
(line 290-293):

```ts
// Telegram env block — only when bot token present. Customer pastes
// token via dashboard later → we re-run a smaller "telegram-activate"
// script then (Phase 2). For now: no token → no Telegram channel.
```

The "Phase 2 telegram-activate script" was never built. Per-customer
bot architecture (Pair-flow Option A, 2026-05-09) shipped without
the corresponding "update existing VPS config" path.

**No `/update-config` or `/refresh-env` route on provisioning**:

```bash
$ grep -nE "app\.post|app\.put" services/provisioning/src/index.ts
67:app.post('/spin-up', async (req, res) => {
86:app.post('/tear-down', async (req, res) => {
106:app.post('/tier-bump', async (req, res) => {
```

Only 3 routes. `/spin-up` is idempotent-no-op for existing VPS.
`/tear-down` deletes. `/tier-bump` updates tier-related env via SSH
(which COULD be templated to update bot token too).

The closest existing pattern to update env on a running VPS is
`tier-bump` (line 145+ of `customer-flow.ts`), which SSHes in,
modifies `.env`, restarts `hermes-gateway`. A `bot-token-update`
endpoint following the same pattern would close the gap.

**Fix shape:** new `POST /update-customer-bot` route on provisioning
service that:
1. Looks up customer's existing VPS
2. SSHes in (using fleet SSH key — same as tier-bump)
3. Updates `TELEGRAM_BOT_TOKEN` in `/home/weuseai/.hermes/.env`
4. Restarts `hermes-gateway` systemd unit
5. Returns 200 / 5xx

Plus a corresponding call from `complete-onboarding-handler` step 8
when `existing-VPS` is detected (not just "spin up new"). Plus
ideally a `customer-bot-update` Edge Function that admin can fire
manually for stuck customers like e282ce25.

Estimated: ~1-2 days. Touches:
- `services/provisioning/src/customer-flow.ts` — new function
- `services/provisioning/src/ssh-provisioner.ts` — env-update helper
- `services/provisioning/src/index.ts` — new route
- `supabase/functions/_shared/onboarding-provisioning-client.ts` —
  new method `updateCustomerBot()`
- `supabase/functions/_shared/complete-onboarding-handler.ts` —
  call updateCustomerBot when spinUp returns existing VPS
- `supabase/functions/admin-customer-bot-refresh/` — new admin fn for
  manually rescuing stuck customers
- Tests at every layer

## Scope assessment

| Bug | Severity | Effort | Phase 2 disposition |
|---|---|---|---|
| #1 — Welcome button hardcoded `t.me/` | Cosmetic but customer-facing | ≤30 min + test | **Quick win, ship in this cascade** |
| #2 — Webhook delete fails silently | Customer-blocking when triggered | ~2-4 hours (surface + retry + alert) | **Founder approval, ship in cascade** |
| #3 — Stale VPS .env / no refresh path | Customer-blocking architectural | ~1-2 days (new route + ssh helper + handler wire + admin fn + tests) | **Founder scope decision: ship now vs queue separately** |

## Welcome-page button bug (full fix shape)

```js
// New helper in welcome.html
async function fetchBotUsername(cid) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?id=eq.${encodeURIComponent(cid)}` +
      `&select=telegram_bot_username`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'X-CID': cid,
      },
    }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0]?.telegram_bot_username ?? null;
}

// In renderState() case 'C2', before innerHTML assignment:
const botUsername = await fetchBotUsername(cid);
const tgHref = botUsername
  ? `https://t.me/${encodeURIComponent(botUsername)}`
  : 'https://t.me/';   // fallback for missing username (shouldn't happen
                       // post-step-2 but defends against race)
```

Plus a drift test asserting state-C2 renders an href that's not the
bare `https://t.me/`.

## Recommended phasing

### Phase 2A — quick win (this cascade)
Ship Bug #1 fix today. Trivial, low-risk, customer-visible.

### Phase 2B — founder approval needed
Bug #2 + Bug #3 stack to fix the activation path properly. Order:
1. Add `safeDeleteWebhook` retry / alert (Bug #2 surface).
2. Add `/update-customer-bot` route on provisioning + wire into
   `complete-onboarding-handler` (Bug #3 architectural fix).
3. Add admin Edge Function for manual rescue of customers stuck
   pre-fix (e282ce25 + any others).
4. Manual rescue customer e282ce25 by calling the new admin fn.

Total estimated: 1.5-2.5 days work. Founder may want to:
- Approve the full stack and ship as one big PR cascade
- Approve only bug-#2 (webhook surface), defer bug-#3 to next phase
- Approve only manual-rescue script for e282ce25 specifically, defer
  the architectural fix until more paying customers exist (current
  blast radius is 1 customer, the founder)

### Out of scope until founder signal
- DeepSeek $3-5 starter credit flow (per CLAUDE.md tech stack —
  Pro/Studio tier is BYOK, customer pastes their own LLM key in
  dashboard). I did NOT investigate this path; it's a separate
  question from "agent ever activates."
- BotFather walkthrough screenshots / video demo — Track 5 from
  prior cascade, still queued.

## What I did NOT touch

- Did not curl any provisioning service mutation endpoints
- Did not SSH into customer VPS
- Did not call IDCloudHost API
- Did not decrypt the bot token (BOT_TOKEN_ENC_KEY not in my env)
- Did not modify any source files
- Did not deploy anything

## Stop / hand-off

Ready for founder review. Awaiting Phase 2 authorisation:

- **Yes, ship Bug #1 only** → I'll do it in ≤30 min, single PR.
- **Yes, ship the full stack (Bugs #1 + #2 + #3 + manual rescue)** →
  ~1.5-2.5 days; want a written plan first or just go?
- **Defer #3 — ship #1 + #2 only** → ~3-4 hours, founder decides
  rescue separately.
- **Hold everything until I see this report** → no action.
