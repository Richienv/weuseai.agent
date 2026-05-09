# Phase 4.5: Optional automated bot creation — Spec (DEFERRED 2026-05-09)

> **Status:** DEFERRED 2026-05-09. Document only — not in any active phase.
> **Trigger to ship:** signal from first 50 paying customers that BotFather walkthrough is high-friction (≥30% drop-off at onboarding Step 2, OR ≥5 customer support tickets requesting "set up the bot for me").
> **Builds on:** `fix/pair-flow-bot-per-customer` Option A (manual BotFather walkthrough), shipped Pair-flow Day 1-3 in commits 2aaac57 → d53ce2d → (PR #).
> **Reference:** `docs/bugs/2026-05-09-pair-flow-investigation.md` (Option A architecture), [Telegram MTProto docs](https://core.telegram.org/api).

---

## Why this might exist

**Pair-flow Option A (current production):** Customer creates a Telegram bot via `@BotFather` during onboarding. ~60s of manual setup. Aligns with CLAUDE.md "Pelanggan kasih bot token sendiri saat onboarding."

**Friction signal we'd need to see before shipping 4.5:**
- ≥30% of paying customers drop off at Step 2 (BotFather walkthrough). Tracked via Supabase analytics: ratio of `validate-bot-token` calls to `complete-onboarding` calls.
- ≥5 customer support tickets requesting platform-managed bot setup.
- Founder concierge time on per-customer "stuck at BotFather" exceeds 5 hours per 10 customers.

If the friction signal stays low, **don't ship Phase 4.5.** Manual BotFather is the simpler architecture; only build automation when there's evidence the manual step is a real funnel-leak.

---

## Customer choice at onboarding (Phase 4.5 design)

Onboarding Step 2 gains a fork:

```
┌─────── Step 2: Bot Telegram ───────┐
│                                    │
│  ◯ Setup otomatis (rekomen)         │
│    Kami buat bot kamu via Telegram  │
│    user account. ~30 detik. Bot     │
│    di-manage platform.              │
│                                    │
│  ◯ Setup manual (BYO bot)           │
│    Kamu buat sendiri via @BotFather │
│    (~2-3 menit). Token + bot 100%   │
│    milik kamu, kami tidak ikut akses│
│    setting bot.                     │
│                                    │
└────────────────────────────────────┘
```

**Default:** Auto-setup (recommended). Customer can switch to manual at any time.

**Routing:**
- Auto-setup → MTProto bot creation flow (this spec).
- Manual → existing BotFather walkthrough (Pair-flow Option A as shipped).

After either branch, downstream flow is identical: pairing screen (Step 3) → expectations (Step 4).

---

## MTProto bot creation flow

[MTProto](https://core.telegram.org/api) is Telegram's user-account protocol (different from the Bot API we use today). It allows a **user account** to programmatically interact with `@BotFather` exactly as a human would.

### Architecture

```
┌─── Phase 4.5 platform service: weuseai-bot-factory ───┐
│                                                        │
│  • Telegram user account (phone number registered to   │
│    platform — owned by founder for Phase 1).           │
│  • MTProto session stored in Supabase Vault (encrypted │
│    long-term auth tokens).                             │
│  • Rate-limited bot creation queue.                    │
│                                                        │
│  POST /create-bot { customer_id, requested_handle? }   │
│    ↓                                                   │
│  1. Resolve handle (customer_<short>_bot or               │
│     <requested_handle>_bot — append _bot suffix per     │
│     Telegram requirement).                             │
│  2. Open MTProto chat with @BotFather.                 │
│  3. Send /newbot → wait for "Alright, a new bot..."     │
│  4. Send display name (e.g. "Customer ABC's agent").   │
│  5. Send handle (e.g. customer_abc_bot).                │
│  6. Receive token in BotFather reply.                   │
│  7. Store token via existing encrypt_bot_token() RPC    │
│     (same path as manual flow).                         │
│  8. Set webhook on the new bot (same as manual flow's   │
│     validate-bot-token-handler step).                   │
│  9. Return { bot_username } to onboarding page.         │
└────────────────────────────────────────────────────────┘
```

### Why MTProto instead of Bot API for creation

The Telegram Bot API does NOT include "create a bot" — `@BotFather` is the only way, and it's a user-facing chat. To automate, we need a user account, not a bot account. That's MTProto.

### Library choice

- **`mtcute`** (TypeScript / Node, MIT) — modern, actively maintained, async-first.
- **`gramjs`** (TypeScript / Node, MIT) — older, larger community, more docs.
- **`telethon`** (Python) — most mature, but adds a Python service to our TS stack.

**Default:** `mtcute` (TS-native, fits our monorepo). Migrate to `telethon` only if MTProto session management proves unstable in Node.

---

## Risks (non-trivial)

### 1. Telegram account ban

If our platform's MTProto user account triggers anti-spam heuristics (too many bot creations / suspicious patterns), Telegram bans the account. **All platform-managed bots break simultaneously** because the bots' creator account is gone — Telegram doesn't transfer ownership.

**Mitigations:**
- Rate limit: max 5 bot creations per hour, max 30 per day.
- Detection avoidance: realistic delays between MTProto messages (3-10s, jitter).
- Multiple platform user accounts (founder + 2 employees) sharded by customer ID hash. Adds operational complexity.
- Heartbeat monitoring: ping `getMe` on the platform user account every 15min; alert founder Telegram on ban.

**Risk level:** High. Telegram's anti-spam is opaque and changes without notice. Plan for "ban happens, recover within 24h" rather than "ban never happens."

### 2. Customer doesn't own the bot

In auto-setup mode, the bot is owned by the platform's MTProto user account, NOT the customer. Implications:
- Customer can't access bot's BotFather settings (can't change avatar, description, commands list themselves).
- If customer churns / requests data export, we have to programmatically delete the bot. Failure = orphan bot pollution.
- Brand surface: bot username is auto-generated (e.g. `customer_abc_bot`), not customer-chosen. Worse than manual flow's customer-chosen name.

**Mitigations:**
- Offer "transfer ownership" flow as part of off-boarding. MTProto `messages.startBot` + `bots.setBotInfo` aren't sufficient; ownership transfer requires the human-only `/transferbot` flow in BotFather. **No clean automation.** Flag this as known limitation.
- Customer can request handle override (`requested_handle` param). Platform validates uniqueness + appends `_bot`.

### 3. Compliance / UU PDP

Per CLAUDE.md, UU PDP basic compliance applies. Auto-setup means we hold the bot token AND control the bot. The customer's Telegram chat content is processed via OUR bot, not theirs. Material privacy distinction.

**Mitigations:**
- Auto-setup TOS surfaces: "Bot ini di-manage platform; kalau kamu mau full ownership, pilih setup manual."
- Document in privacy policy.
- Phase 4.5 design includes opt-in transfer (future Phase 5).

### 4. MTProto session compromise

If our MTProto session token leaks (key in Supabase Vault is somehow compromised), an attacker can:
- Create new bots impersonating our platform.
- Access all platform-managed bots' chat history (bots can read messages sent to them; user account that owns the bots can introspect via BotFather).

**Mitigations:**
- Vault-only storage with access audit logs.
- Rotate MTProto session every 30 days.
- 2FA on the platform user account.
- Phone number for platform user account = a SIM owned by founder, not a virtual number (virtual numbers correlate to abuse patterns).

---

## Implementation phases (when shipping)

### 4.5-1: Bot factory service skeleton (~3 days)
- New `services/bot-factory/` workspace.
- MTProto session management via `mtcute`.
- POST /create-bot endpoint, rate-limited, captures token + webhook setup.
- Integration with existing `customers.telegram_bot_token` (pgcrypto) + `customers.telegram_bot_username`.

### 4.5-2: Onboarding fork UI (~1 day)
- Step 2 gains radio toggle (auto-setup vs manual).
- Auto-setup branch posts to /create-bot, then jumps to Step 3 (pairing).
- Manual branch unchanged from Pair-flow Option A.

### 4.5-3: Operational safety (~2 days)
- Heartbeat + ban detection.
- Failover to manual mode when auto-setup unavailable (rate-limited / ban detected).
- Customer-facing "service degradation" banner.

### 4.5-4: Off-boarding hooks (~1 day)
- Bot deletion script for churned customers.
- TOS update + privacy policy update.

**Total: ~7 working days post phase activation.**

---

## Out of scope (explicit)

- **Custom bot avatar / description** at creation time. Defer to Phase 5 if customers ask.
- **Multi-language BotFather automation.** English-only is sufficient (BotFather respects user account language; we set platform user account to English).
- **Bot ownership transfer to customer.** No clean MTProto path; documented as known limitation. Phase 5+ if Telegram ships an API.

---

## Decision criteria — when to ship Phase 4.5

Ship 4.5 ONLY if:
1. ≥10 paying customers AND ≥30% drop-off at manual BotFather Step 2 (signal that the friction is real, not founder anxiety).
2. Founder bandwidth available for the ~7-day implementation + ongoing operational monitoring.
3. Customer NPS feedback explicitly requests "do this for me."

Otherwise:
- Improve manual BotFather Step 2 copy (better screenshots, clearer instructions, optional video walkthrough).
- Offer concierge bot setup via WhatsApp support (founder-handled, ~5 min per customer) as a stop-gap.

---

## Reference

- Pair-flow Option A RCA + design: `docs/bugs/2026-05-09-pair-flow-investigation.md`.
- Manual BotFather walkthrough copy: `onboarding.html` Step 2 panel (post-Pair-flow PR).
- Telegram MTProto: https://core.telegram.org/api
- Telegram anti-spam patterns (community-aggregated): https://github.com/topics/telegram-spam-ban
