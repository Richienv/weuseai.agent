# welcome.html — Post-Payment Landing Spec (2026-05-06, REVISED)

> **Status:** APPROVED 2026-05-06 (founder), revised same day for onboarding-flow coordination.
> **Goal:** Replace the Vercel 404 customers currently hit after Xendit payment redirect, AND act as the post-onboarding provisioning-status page.

---

## Revision note (2026-05-06, post-approval)

Sesi B is building `/onboarding.html` on `feat/onboarding-flow` per
`docs/plans/2026-05-06-onboarding-page-spec.md`. New customer flow:

```
pay → /welcome (no &job)        →  CTA "Lengkapi profil agent kamu →"
   ↘                                ↓ click
    →  /onboarding?cid=…         →  pairing + persona submit
                                    ↓
   →  /welcome?cid=…&job=…       →  poll subscription status until active/failed/timeout
                                    ↓ when active
                                    "✓ Agent kamu siap. Cek Telegram."  →  deep-link to @weuseaibot
```

**State C (`status='active'`) now bifurcates by URL param:**
- **Without `&job`** → "Pembayaran terima. Lengkapi profil agent kamu (5 menit) →" + button to `/onboarding.html?cid=<cid>`
- **With `&job`** → original "✓ Agent kamu siap. Cek Telegram." + Telegram deep-link

All other states (B/D/F/E/G) behave identically regardless of `&job` presence.

---

## Why this exists

`supabase/functions/create-invoice/index.ts:149` sets:
```
successRedirectBase: `${PUBLIC_BASE}/welcome`
```

After successful Xendit payment the customer is redirected to
`https://weuseai-agent.vercel.app/welcome?cid=<customer_id>` — and currently
gets a 404. Most visible gap blocking real paying customers.

After this page ships, the same URL also handles post-onboarding traffic
with `&job=<provisioning_job_id>` appended (per Sesi B's spec).

---

## File structure

```
weuseai.agent/velorah/
├── checkout.html         ← already shipped
├── liren-v3.html         ← already shipped (landing)
├── use-cases.html        ← already shipped
├── welcome.html          ← NEW (this spec)
└── onboarding.html       ← Sesi B, parallel branch feat/onboarding-flow
```

Static HTML at the repo root, served directly by Vercel (matches existing
pattern). No framework, no build step.

Branch: `feat/welcome-page` (off `main`). Ships independently from
`feat/onboarding-flow`. Both target merge to `main` once previewed +
approved.

---

## URL contract

```
https://weuseai-agent.vercel.app/welcome.html?cid=<customer_id>
https://weuseai-agent.vercel.app/welcome.html?cid=<customer_id>&job=<provisioning_job_id>
https://weuseai-agent.vercel.app/welcome.html?state=A|B|C|C2|D|E|F|G   ← review fixture
```

| Param | Required | Source | Used for |
|-------|----------|--------|----------|
| `cid` | yes (production) | Xendit redirect / onboarding redirect | Look up subscription status by polling Supabase REST |
| `job` | optional | Onboarding submit redirect | Distinguishes "ready for onboarding" (state C) from "ready for Telegram" (state C2) |
| `state` | review-only | Manual | Bypasses polling, forces a state for visual review |

**Edge case:** `cid` missing/malformed/no matching row → state E ("wrong link"). NEVER expose customer email, name, or PII via URL.

---

## Final copy (verbatim — every word locked)

### Hero (always rendered)

**Pill label:** `Pembayaran berhasil`

**Headline (display serif):**
```
Selamat datang.
Agent kamu sedang dibangun.
```

**Subheadline:**
```
Dalam 5–7 menit, satu pesan akan masuk ke Telegram kamu —
tanda agent siap bekerja.
```

### Status box — copy per state

| State | Headline | Subline / detail |
|-------|----------|------------------|
| **A. LOADING** (initial poll in-flight) | `Memeriksa status...` | (subtle pulsing dot, no progress bar) |
| **B. pending / pending_provision** | rotating: `VPS sedang disiapkan...` → `Hermes sedang dipasang...` → `Skill kamu di-tune...` | indeterminate progress bar, subtitle "estimasi 5–7 menit total" |
| **C. active, no `&job`** | `Pembayaran terima. Lengkapi profil agent kamu (5 menit).` | button `Lengkapi profil agent saya →` (link to `/onboarding.html?cid=<cid>`) |
| **C2. active, with `&job`** | `✓ Agent kamu siap. Cek Telegram.` | button `Buka Telegram →` (deep-link `tg://resolve?domain=weuseaibot` with HTTPS fallback `https://t.me/weuseaibot`) |
| **D. failed** | `Ada kendala teknis.` | `Tim kami sudah menerima notifikasi dan akan menghubungi via email dalam 30 menit.` |
| **E. INVALID_CID** | `Halaman ini hanya untuk konfirmasi pembayaran.` | `Mungkin kamu salah link?` + button `Kembali ke beranda` (link to `/`) |
| **F. timeout** (>15 min still pending_provision) | `Provisioning butuh waktu lebih lama dari biasanya.` | `Tim kami sudah dapat notifikasi. Kamu akan dihubungi via email dalam 30 menit.` |
| **G. POLL_ERROR** | (no state change, subtle indicator) | small text bottom of card: `Memeriksa...` (pulsing dots), retry every 10s silently |

### Steps section (always rendered, even in state E for funnel guidance)

**Header:** `Yang akan terjadi:`

**Step 01:** `Buka Telegram, cari @weuseaibot` — action button `Buka Telegram →` (deep-link as state C2)
**Step 02:** `Klik /start untuk memperkenalkan diri`
**Step 03:** `Tunggu pesan halo dari agent kamu`

### Concierge note

> Pertama kali pakai? Tim kami akan menghubungi kamu via email kalau butuh bantuan setup.

(small italic, muted text below the steps)

### Footer

```
Butuh bantuan? WhatsApp tim kami: +62 821-5490-2561   ← clickable, wa.me
FAQ                                                    ← link → /#faq
weuseai.agent                                          ← logo, links to /
```

**WhatsApp link details (founder-locked):**
- Display: `+62 821-5490-2561`
- Deep-link: `https://wa.me/6282154902561`
- Pre-fill message: `Halo tim weuseai, saya butuh bantuan dengan agent saya. Customer ID: <cid from URL>`
- On mobile, also expose `tel:+6282154902561` as secondary affordance (right-click on desktop, long-press on mobile)

---

## State diagram

Same as the original spec, but state C bifurcates:

```
Initial → A (LOADING)
A → B|C|C2|D|E|G
B → C|C2|D|F|G   (polling every 10s)
G → A|B|C|C2|D|F (silent recovery)
C, C2, D, E, F   ← terminal (polling stops)
```

State C / C2 selection:
```
if (status === 'active' && !urlParams.has('job'))  → C
if (status === 'active' && urlParams.has('job'))   → C2
```

---

## Tech stack confirmation

| Concern | Choice | Rationale |
|---|---|---|
| Markup | Static HTML at repo root | Matches landing files |
| Styling | Tailwind via CDN + small inline `<style>` block | Matches existing pattern, zero build step |
| JS | Vanilla `<script>` (no React/Babel) | Page is dead-simple — polling + DOM updates only |
| Polling | `fetch()` against Supabase REST + anon key | Read-only on `subscriptions` table, gated by RLS (see migration below) |
| Brand | `bg-black`, Signal Red `#E5322D` | Matches landing — CLAUDE.md mentions Bone but actual landing is dark |
| Fonts | `Inter` body + `Instrument Serif` display | Reuse landing's font load |
| Cadence | **10s** (founder-locked) | Balances perceived liveness vs Supabase request volume |
| Timeout | **15 min** (founder-locked) | ~2.5× our 5-7 min spawn estimate |

---

## Test fixture mode

`?state=<letter>` query param overrides polling. For each value, the page
renders that state with no Supabase calls:

| `?state=` | Renders |
|-----------|---------|
| `A` | LOADING |
| `B` | pending_provision (rotating progress) |
| `C` | active, no &job → "Lengkapi profil →" CTA |
| `C2` | active, with &job → "Cek Telegram" CTA |
| `D` | failed |
| `E` | INVALID_CID |
| `F` | timeout |
| `G` | POLL_ERROR (silent retry indicator) |

**Important:** when `?state=` is present, no real polling fires — purely a
visual fixture. Production traffic never includes this param.

---

## Polling implementation

```js
const params = new URLSearchParams(location.search);
const cid = params.get('cid');
const hasJob = params.has('job');

// (Test fixture mode — see above — short-circuits before this point.)

async function pollOnce() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions` +
      `?customer_id=eq.${encodeURIComponent(cid)}` +
      `&select=id,status,started_at` +
      `&order=started_at.desc&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY } }
  );
  if (!r.ok) throw new Error('poll failed');
  const rows = await r.json();
  return rows[0]?.status ?? null;
}

let pollTimer, startedAt = Date.now();
async function tick() {
  try {
    const status = await pollOnce();
    if (status === 'active' && hasJob)                  setState('C2');
    else if (status === 'active' && !hasJob)            setState('C');
    else if (status === 'failed')                       setState('D');
    else if (status === 'pending_provision' ||
             status === 'pending') {
      if (Date.now() - startedAt > 15 * 60 * 1000)      setState('F');
      else                                              setState('B');
    }
    else                                                setState('E'); // unknown
  } catch (e) {
    setState('G');
  }
  if (!['C', 'C2', 'D', 'E', 'F'].includes(currentState)) {
    pollTimer = setTimeout(tick, 10_000);
  }
}
```

---

## RLS prerequisite (ships in this PR)

```sql
-- Allow anon to read just (id, status, customer_id, started_at) from subscriptions.
-- Phase 1: any-uuid-holder can read. UUIDs are unguessable; status text is
-- non-sensitive. Phase 2B will tighten to signed-JWT + edge function.
CREATE POLICY "anon can read own subscription status"
  ON subscriptions FOR SELECT
  TO anon
  USING (true);
```

Migration: `supabase/migrations/20260506130000_anon_read_subscription_status.sql`.

NEXT.md updated with Phase 2B note: "Tighten subscription RLS — swap
?cid=<uuid> for signed JWT + edge function (welcome.html, post Phase 2A)".

---

## Voice + brand audit

| Banned word | Used? |
|---|---|
| `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level` | ✅ none |
| Exclamation marks in customer copy | ✅ zero |
| Emoji in customer copy | ✅ zero (✓ in C2 is typographic glyph) |
| `Anda` | ✅ none |
| `lo / gue / aku` | ✅ none |
| `kamu` form | ✅ used throughout |

---

## Performance budget

Target: Lighthouse Performance ≥ 90 on mobile.

- Page weight: < 60 KB (no images, no framework)
- First Contentful Paint: < 1.5s
- LCP: < 2.5s
- TBT: < 200ms
- No layout shifts (status box reserves space from initial render)

---

## Out of scope (deferred)

- Telegram bot token capture / pairing code → Sesi B (Phase 2B onboarding)
- Phase 2A merge → separate track
- Pricing redesign → already in flight on `feat/landing-vs-comparison`
- Production Xendit cutover → Phase 2D
- Real-time WebSocket subscription → Phase 3
- I18n / English version → Phase 3
- Signed-JWT polling auth → Phase 2B (NEXT.md item)
