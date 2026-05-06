# NEXT.md — Task queue (kerjain urut)

**Updated:** 2026-05-07 (production live — dark/red landing + onboarding backend merged)

---

## Status: PRODUCTION LIVE

**As of 2026-05-07** — `feat/onboarding-flow` merged into `main`. The
launch bundle is live on `weuseai-agent.vercel.app`:

- Dark/red halftone landing (DottedVideo Canvas-2D, ChatVsAgent
  comparison, community skill grid, Pajak DIY UnicornStudio)
- Pricing v1.1 LOCKED: Starter Rp 399rb, Pro Rp 1,29jt, Studio Rp 5,9jt
  (strike-through Rp 699rb / 2,5jt / 10,9jt)
- Onboarding backend: welcome.html + onboarding.html, Edge Functions
  (create-invoice, xendit-webhook, complete-onboarding,
  telegram-bot-webhook, rotate-pairing-code), pairing-code pattern
- Provisioning: services/provisioning on Fly.io, IDCloudHost VPS spawn,
  SSH-pivot setup script, OpenRouter per-customer key minting, Hermes
  Agent install via upstream `install.sh` + systemd unit
- Live verification: Xendit staging Pro tier returns invoice for
  Rp 1.398.723 (1.290.000 setup + 99.000 hosting + 9.723 QRIS 0.7%)

**Test coverage:** 87/87 passing across handlers, renderer, sanitizer,
pairing-code, end-to-end mock.

**Deferred (Jakarta trip):** Halo end-to-end verification with real
Telegram from a second account.

---

## Hermes runtime model — locked notes (Day 4b, 2026-05-06)

**TL;DR: Hermes is a Telegram-polling bot, NOT an HTTP server. There's
no `/health` endpoint, no listening port, no firewall hole needed.
"Health" = `systemctl status hermes-gateway`.**

How it actually runs on customer VMs:

| Concern | Answer |
|---|---|
| Process model | systemd unit at `/etc/systemd/system/hermes-gateway.service` |
| ExecStart | `python -m hermes_cli.main gateway run --replace` (long-poll Telegram) |
| User | `weuseai` (via `--run-as-user weuseai` flag at install time) |
| Restart policy | `Restart=always`, RestartSec=60, MaxDelay=300, Steps=5 |
| Boot start | yes — `multi-user.target.wants/hermes-gateway.service` |
| Listen port | none — outbound long-poll to api.telegram.org only |
| Firewall | only port 22 (SSH) is open externally |

How to install correctly (locked into setup-script.ts, do NOT regress):

```bash
# Run as root (script runs via `sudo bash -s` over SSH).
hermes gateway install --system --run-as-user weuseai   # creates unit
hermes gateway start --system                            # actually starts it
```

Common mistakes that look like they work but don't:
- `hermes gateway install` (no flags) → installs USER-level unit, no boot
- `hermes gateway setup --telegram` → not a real flag, fails silently
- Just `gateway install` without `gateway start` → unit dead, bot offline

Diagnostic on a customer VM:
```bash
ssh liren@<vm-ip> 'systemctl is-active hermes-gateway && systemctl is-enabled hermes-gateway'
# Expected: active enabled
```

Test coverage: `tests/setup-script.spec.ts` has three regression guards
(2026-05-06):
- `gateway install uses --system --run-as-user (not user-level service)`
- `gateway start --system runs after install (otherwise unit sits dead)`
- `omits invalid 'gateway setup --telegram' (Day 4b: not a real flag)`

---

## Phase 2C — post-launch optimizations (do these next)

**Owner:** Claude Code
**Trigger:** real customer signal (perf complaint, drop-off in
analytics, support tickets) — don't pre-optimize.

- **Video asset re-encode for FCP.** `/assets/new-hero.mp4` (2.6 MB) and
  `/assets/ascii-wave.mp4` (1.3 MB) eat ~3.9 MB of mobile bandwidth on
  first paint. Re-encode at lower bitrate / shorter duration / poster-
  frame fallback. Target: mobile FCP <1.8s, Lighthouse perf ≥80.
- **DOM trim on #filosofi.** Section has 761 nodes (24 use-case cards ×
  ~30 internal nodes). Total page DOM = 1905 nodes (Lighthouse warns
  above 1500). Either lazy-render off-viewport cards via
  IntersectionObserver, or simplify card markup.
- **Retry worker for failed provisioning jobs.** When IDCloudHost spawn
  or Hermes install fails mid-flight, the customer's payment is taken
  but no VM exists. Currently: founder gets paged via Supabase logs.
  Build: cron-driven retry queue scanning `customers` for
  `provisioning_status='failed'` rows and re-running setup.
- **Onboarding polling cadence (3s → realtime).** Approved at 3s for
  launch (~600 reads/customer over 30-min wait). Switch to Supabase
  realtime subscription on `customers` if quota or per-customer
  minute-spend gets noisy at scale.
- **Pairing code lifetime (30 min → 60 min).** Bump if expiry-out rate
  >5% in support tickets.
- **Welcome page polling auth (anon UUID → signed JWT).** Phase 1 ships
  with `?cid=<uuid>` polling against `subscriptions` via anon key + RLS
  `anon_read_own_subscription_status`. UUIDs unguessable + status
  non-sensitive, MVP acceptable. Phase 2C swap:
  - `create-invoice` mints short-lived JWT encoding customer_id
  - New Edge Function `GET /functions/v1/welcome-status?token=<jwt>`
    verifies JWT, does subscription read on user's behalf
  - RLS on `subscriptions` flips to `USING (false)` for anon role
  - Spec lives in `docs/plans/2026-05-06-welcome-page-spec.md`
    ("Open questions" section)
- **React `key` prop warning in Hero.** framer-motion list child without
  unique key — non-fatal but flagged in console. Fix when touching
  Hero anyway.
- **E2E redirect-chain smoke test.** Don't trust direct URL access
  alone — exercise the full Xendit redirect path. The 2026-05-07 hotfix
  shipped because preview smoke tested `/welcome.html?cid=…` directly,
  not `/welcome?cid=…` via Xendit's `success_redirect_url`. Add a CI
  check that:
  1. POST to `create-invoice` Edge Function with a fake plan
  2. Extract `success_redirect_url` from the Xendit invoice response
  3. `curl -L` that URL on production → assert HTTP 200
  Fail loud if the redirect chain breaks. Cheap insurance against
  customer-facing 404s.
- **Vercel alias auto-promote investigation.** `weuseai-agent.vercel.app`
  did not auto-promote on either main push (2026-05-07: production
  launch + cleanUrls hotfix). Manual `vercel alias set` required both
  times. Either Vercel project setting drift or the production-branch
  mapping is broken. Investigate; failing to auto-promote means real
  customers see stale code until someone notices.

---

## Phase 3 — roadmap (when 10+ paying customers ask)

- **WhatsApp Business API channel.** Phase 1 is Telegram-only. Add WA
  via Twilio / 360dialog when customers ask. Hermes already has channel
  abstraction; new bot wrapper + provisioning flag.
- **BYOK LLM at scale.** Customers paste own OpenRouter / OpenAI /
  Anthropic / DeepSeek key in dashboard, replace per-customer mint.
  Currently Pro/Studio require this; Starter uses provisioned $5 cap.
- **Customer dashboard.** Self-serve UI for: pause/resume agent, swap
  LLM key, view usage, change Telegram bot, download skill metadata.
  Currently all manual via Telegram + founder.
- **Multi-region.** Single jakarta region for now. Add cyc01 + global
  failover when latency complaints surface.
- **Skill marketplace UI.** Phase 1 hardcodes skills in the Hermes
  install. Phase 3 lets customers browse / install / publish.
- **Audit log + daily backup + auto-update.** Skipped in Phase 1.

---

## Decision points — locked

- [x] Final pricing — Starter Rp 399rb, Pro Rp 1,29jt, Studio Rp 5,9jt
  (Business Model v1.1, locked 2026-04-28)
- [x] Domain — `weuseai-agent.vercel.app` (live, production deploy)
- [x] Provisioning service host — Fly.io
- [ ] Refund policy text (founder write, Claude Code paste)
- [ ] ToS + Privacy Policy text (basic Phase 1)

---

## When to pick this back up

- A real customer signal lands (support ticket, payment failure,
  perf complaint, churn) → fix root cause, write a test.
- Founder back from Hangzhou trip → run Halo end-to-end verification
  with second Telegram account.
- 5+ paying customers → revisit Phase 2C in priority order above.
- 10+ paying customers → consider Phase 3.

Reference history: `NEXT.md.platform` (archived pre-merge plan).

---

*Last updated: 2026-05-07 by Claude (production launch).*
