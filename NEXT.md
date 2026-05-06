# NEXT.md — Task queue (kerjain urut)

**Updated:** 2026-05-06 (Day 4b — Hermes binding model documented)
**Target launch:** 2 minggu setelah Day 4-5 end-to-end provisioning verified

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

## Current state

- Landing live di `weuseai-agent.vercel.app` (root HTML files: `liren-v3.html`, `checkout.html`, `use-cases.html`)
- `services/*` punya 5 ports: provisioning, proxy, hermes, payment, test-idcloudhost
- `tests/end-to-end-mock.spec.ts` = 3 integration tests passing dengan mock adapters
- Supabase project created, schema apply pending
- Xendit sandbox active, secret key di `.env`
- IDCloudHost auth validated, top-up pending

Reference history sebelum merge: `NEXT.md.platform` (archived).

---

## Phase 2B revisit list (don't build now)

- **Welcome page polling auth (signed JWT).** Phase 1 ships welcome.html
  with `?cid=<uuid>` polling against `subscriptions` via the anon key
  + RLS `anon_read_own_subscription_status` (added in migration
  `20260506130000_anon_read_subscription_status.sql`). UUIDs are
  unguessable + status text is non-sensitive, so MVP is acceptable. **In
  Phase 2B, swap to:**
  - `create-invoice` mints a short-lived JWT encoding the customer_id
    (e.g. 24h expiry) and returns it as `?token=<jwt>` in the redirect
    URL instead of `?cid=<uuid>`
  - New Edge Function `GET /functions/v1/welcome-status?token=<jwt>`
    verifies the JWT and does the subscription read on the user's
    behalf (service role)
  - RLS policy on `subscriptions` flips to `USING (false)` for the anon
    role, locking out direct browser reads
  - Spec lives in `docs/plans/2026-05-06-welcome-page-spec.md` ("Open
    questions" section)
- **Onboarding pairing-code expiry.** If customers report `pairing_code_expired`
  more than 5% of the time, bump the expiry from 30 min → 60 min in
  `services/.../onboarding-store-supabase.ts`.

---

## Phase 0: Founder setup (status check)

Per founder report:

- [x] IDCloudHost developer account + API key (auth validated)
- [x] Xendit sandbox secret key
- [x] Supabase project + URL + service role key
- [ ] IDCloudHost top-up (pending — perlu untuk Day 4-5 spawn test)
- [ ] Apply `supabase/schema.sql` di Supabase SQL editor
- [ ] Telegram bot via @BotFather (founder personal bot untuk Day 6 test)
- [ ] Isi `.env` per service dari `.env.example` di root

---

## Day 1 — Audit checkout.html (Xendit integration map)

**Owner:** Claude Code
**Goal:** understand cara `checkout.html` saat ini integrate ke Xendit, identify gaps untuk wire ke provisioning service.

**Task:**
1. Baca `checkout.html` end-to-end
2. Map: bagaimana customer click "Subscribe" → Xendit invoice dibikin?
3. Cek: ada server endpoint di balik checkout, atau call Xendit langsung dari frontend?
4. Cek: webhook handler ada belum? Di mana tujuannya?
5. List integration gaps: apa yang missing untuk wire payment-success → spawn VPS → run Hermes

**Verify:** Tulis report singkat (`docs/checkout-audit.md` atau inline reply) covering: current Xendit flow, missing pieces, recommendation untuk Supabase Edge Function design.

**Stop dan lapor founder sebelum lanjut Day 2.**

---

## Day 2 — Build Supabase Edge Function `xendit-webhook`

**Owner:** Claude Code
**Prereq:** Day 1 audit done + founder approves design.

**Task:** buat `supabase/functions/xendit-webhook/index.ts` yang:
- Verify Xendit signature (X-CALLBACK-TOKEN)
- Parse paid invoice payload
- Insert subscription record di Supabase (`subscriptions` table per `schema.sql`)
- POST ke `services/provisioning` `/spin-up` endpoint dengan `customerId` + `tier`
- Return 200 OK

**Verify:**
- Local test pakai `supabase functions serve` + Xendit sandbox webhook
- `npx tsc --noEmit` clean
- Mock test passing (extend `tests/end-to-end-mock.spec.ts` kalau perlu)

**Stop dan lapor founder sebelum lanjut Day 3.**

---

## Day 3 — IDCloudHost top-up + provision spin test

**Prereq:** Founder top-up IDCloudHost. Kalau belum, STOP.

**Task:**
```bash
cd services/test-idcloudhost
npm install
npm run test
```

**Expected:** Verdict `✓ PASS` dengan total time create+running ≤ 180 detik.

**If PASS:** lanjut Day 4.
**If FAIL:** lihat decision tree di `NEXT.md.platform` (180-300s warning, >300s STOP, auth error STOP).

---

## Day 4-5 — Wire end-to-end: payment → spawn → Hermes alive

**Owner:** Claude Code
**Prereq:** Day 1-3 done.

**Task:**
1. Deploy `services/provisioning/` server (Mac Mini atau Railway free tier)
2. Wire Edge Function `xendit-webhook` → provisioning `/spin-up`
3. Provisioning spawn VPS via IDCloudHost (kode existing di `customer-flow.ts`)
4. Cloud-init: install upstream Hermes via `install.sh`, write `.env`, enable systemd unit
5. Hermes start, listen Telegram, kirim welcome message

**Verify:**
- Self-test: bayar via Xendit sandbox, VPS spawn, Hermes Telegram message dalam ≤5 menit
- Time setiap step di log
- Cleanup VPS setelah test (jangan ada VM ketinggal)

**Stop dan lapor founder sebelum lanjut Day 6.**

---

## Day 6 — Verify Hermes install pattern di VPS test

(Detail di `NEXT.md.platform` Day 6 — copy-paste task list ke sini kalau Day 4-5 pass.)

---

## Day 7 — Internal end-to-end test (founder self-onboard)

(Detail di `NEXT.md.platform` Day 7.)

**Target:** ≤5 menit Subscribe → Telegram welcome, zero retry.

---

## Day 8-14 — Beta onboard 5 pelanggan gratis

(Detail di `NEXT.md.platform` Day 8-14.)

---

## Decision points yang harus founder confirm

- [ ] Final pricing — Starter Rp 299k confirmed, Pro Rp 1.2jt confirmed, Studio Rp 4.9jt confirmed (per CLAUDE.md Business Model v1.1)
- [ ] Domain — `weuseai.agent` confirmed (live di `weuseai-agent.vercel.app`)
- [ ] Mac Mini IP/access untuk provisioning service deploy
- [ ] Refund policy text (founder write, Claude Code paste)
- [ ] ToS + Privacy Policy text (basic Phase 1)

---

*Last updated: 2026-04-30 by Claude (post-merge handoff)*
