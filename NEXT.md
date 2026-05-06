# NEXT.md — Task queue (kerjain urut)

**Updated:** 2026-04-30 (post-merge liren-stand → weuseai.agent monorepo)
**Target launch:** 2 minggu setelah Day 4-5 end-to-end provisioning verified

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
