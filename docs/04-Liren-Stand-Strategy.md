# 04 — Liren Stand: Strategy v0

**V0 · April 2026 · INTERNAL**
*Working name: "Liren Stand" — TBD, alternatives: Liren Workspace, Liren Hub.*
*Revises: 90-day plan in `02-Agent-Catalog.pdf` §Phase 1–3.*
*Aligns with: `01-Brand-Kit.pdf` (voice + visual), `03-Content-Strategy.pdf` (channels + cadence — unchanged).*

---

## 1. Apa yang berubah, dan kenapa

Versi awal: jualan tiga agent spesialis (Meeting / Lamaran / LinkedIn) langsung sebagai produk, harga 500-750k IDR.

Versi baru: bangun **Liren Stand** — platform managed-Hermes per pelanggan dengan harga masuk 199k IDR, lalu jual tiga agent spesialis sebagai *Specialised Trained Agent* di Marketplace platform. Pelanggan tetap dapat hasil yang sama, tapi pintu masuknya lebih lebar dan funnel-nya lebih dalam.

**Kenapa pivot ini OK** (walaupun Brand Kit hard-constraint bilang "no mid-phase pivots"):

- Phase 1 belum selesai (masih content bootstrap, belum launch agent). Pivot di Phase 1 = belum ada pelanggan yang dijanjikan sesuatu, jadi belum melanggar trust.
- Tiga agent spesialis nggak hilang — mereka pindah etalase dari "1-on-1 sales" ke "Marketplace install."
- Brand thesis (立人 — help others stand) lebih cocok dengan platform yang membantu mereka *membangun*, daripada produk jadi.

**Yang TIDAK berubah:**

- Brand Kit (`01-Brand-Kit.pdf`) — voice, visual, tagline tetap.
- Content Strategy (`03-Content-Strategy.pdf`) — IG-first, 4 pillar, 5 post/minggu, semua tetap.
- Tiga agent (Meeting / Lamaran / LinkedIn) tetap, harganya tetap, tech stack tetap.
- Hard constraints: no paid ads, no hiring, no enterprise custom work.

---

## 2. Decisions locked

| # | Keputusan | Pilihan |
|---|-----------|---------|
| 1 | LLM access strategy | **Hybrid** — prepaid credits IDR via Xendit |
| 2 | Tier launch | **2 tier** (Starter + Pro) |
| 3 | Brand | **Liren Labs** (satu brand, produk masuk ke dalam) |
| 4 | VPS provider | **IDCloudHost** |
| 5 | Onboarding target | **≤ 5 menit** dari bayar sampai agent hidup |
| 6 | Delivery channel | **Telegram** (sama seperti productized agents) |

---

## 3. Pricing structure

### Subscription tier

| Tier | Harga/bulan | VPS spec | Starter credits include | Marketplace access |
|------|-------------|----------|--------------------------|---------------------|
| **Liren Stand Starter** | Rp 199.000 | 1 vCPU / 4 GB RAM / 50 GB NVMe | ~50 prompt Claude Haiku | Free skill only |
| **Liren Stand Pro** | Rp 399.000 | 2 vCPU / 8 GB RAM / 100 GB NVMe | ~200 prompt Claude Sonnet 4.6 | Free + 1 premium skill/bulan |

Tier Max + Ultra ditambahkan di Phase 2 setelah ada signal pelanggan minta resource lebih besar.

### Margin math (IDCloudHost, BYOK + credit markup)

Asumsi: VPS Rp 145k (Starter), Rp 185k (Pro); Xendit fee 2%; 50/200 starter credits = ~$1.5/$8 Claude API cost.

| Tier | Revenue | VPS | Credits cost | Xendit | **Margin** | **%** |
|------|---------|-----|--------------|--------|-------------|-------|
| Starter | 199k | 145k | 24k | 4k | **26k** | **13%** |
| Pro | 399k | 185k | 130k | 8k | **76k** | **19%** |

Margin awalnya tipis karena kita kasih starter credits gratis. Profit utama dari **top-up credits + marketplace + Specialised Agent** (lihat §4).

### Top-up credits (revenue stream utama)

| Pack | Bayar | Dapat (USD equivalent) | Markup kamu |
|------|-------|--------------------------|--------------|
| Pulsa Kecil | Rp 50.000 | $3 credits | ~25% |
| Pulsa Standar | Rp 100.000 | $6.50 credits | ~30% |
| Pulsa Besar | Rp 250.000 | $17 credits | ~33% |
| Pulsa Pro | Rp 500.000 | $35 credits | ~35% |

**Cara kerja:** pelanggan top-up via Xendit (QRIS / GoPay / OVO / transfer bank). Kamu pakai akun Anthropic kamu sendiri, distribusikan credits ke akun pelanggan di platform. Margin top-up jauh lebih sehat dari margin subscription.

**Logika:** subscription itu *land*; top-up credits itu *expand*. Subscription nutup biaya VPS; top-up jadi profit utama.

---

## 4. Marketplace structure

Tiga lapis konten di Marketplace, semua bisa di-install ke VPS pelanggan dengan satu klik.

### Lapis 1 — Free Skills (top of funnel)

Skill ringan, gratis untuk semua tier. Tujuan: lead magnet + demonstrasi platform.

Contoh starter skill (10 untuk launch):

- WhatsApp Auto-Reply
- Daily News Digest (Bahasa)
- Telegram Reminder Bot
- Email Triage (top 5 inbox tiap pagi)
- Meeting Notes ke Notion
- Translation Helper (BI ↔ EN)
- Calendar Cleanup
- Receipt OCR ke Spreadsheet
- Twitter/X Drafter
- Quick Research (1-paragraph summary)

### Lapis 2 — Premium Skills (revenue)

Skill yang butuh setup atau model yang lebih mahal. Beli sekali, install permanent ke VPS pelanggan.

Range harga: Rp 50.000 – Rp 250.000 sekali bayar.

Contoh premium skill:

- Voice Cloning Reply (50k)
- LinkedIn Auto-Engagement (150k)
- Invoice Generator (75k)
- Browser Automation Pack (200k)
- Code Review Assistant (250k)

### Lapis 3 — Specialised Trained Agent (top revenue)

Inilah tempat tiga agent spesialis dari `02-Agent-Catalog.pdf` hidup di platform.

| Agent | Harga | Tipe |
|-------|-------|------|
| **Agent Meeting** | Rp 500.000 | One-time install (launch Rp 400k, first 20) |
| **Agent Lamaran** | Rp 750.000 | One-time install |
| **Agent LinkedIn** | Rp 500.000 setup + Rp 150.000/bulan | Setup + subscription |

Bundles dari Agent Catalog (Career Starter, Personal Brand Pro, Full Stack) tetap berlaku di Phase 3 sebagai bundle install di Marketplace.

**Distribution mechanic.** Pelanggan masuk Starter 199k → coba 5 free skill → top-up credits → di akhir bulan pertama, kamu push notif: *"Workflow kamu cocok buat Agent Lamaran. Coba gratis 7 hari."* Konversi ke Specialised Agent terjadi setelah trust dibangun, bukan di hari pertama.

---

## 5. Hybrid credits system — detail teknis

### Flow pelanggan

1. Pelanggan klik "Beli Credits" di dashboard.
2. Pilih pack (50k / 100k / 250k / 500k).
3. Xendit checkout (QRIS / GoPay / OVO / transfer bank).
4. Webhook Xendit → Supabase trigger → credits ditambahkan ke akun pelanggan.
5. Notifikasi Telegram: *"Credits kamu sekarang $X. Selamat berkarya."*

### Flow internal (kamu)

1. Akun Anthropic kamu pegang **API key induk**.
2. Pelanggan pakai Hermes di VPS mereka → Hermes call Claude pakai API key induk via proxy.
3. Proxy log usage per pelanggan ke Supabase.
4. Tiap pelanggan punya *credit balance* yang berkurang sesuai usage.
5. Kalau credit habis → Hermes berhenti, Telegram notif: *"Credits habis. Top up biar agent kamu lanjut."*

### Pencegahan abuse

- Hard rate limit per pelanggan (misal: max $10 credit usage/jam).
- Max session length (misal: 60 menit per agent run).
- Auto-pause kalau usage spike abnormal.
- Subscription tier nggak include unlimited fair-use di Phase 1 — semua usage debet credit balance.

### Tech components

- **Proxy:** Cloudflare Worker atau simple Node.js Express di Mac Mini. Forward Anthropic call, log usage.
- **Database:** Supabase (sudah dipakai per `02-Agent-Catalog.pdf`).
- **Payment:** Xendit (QRIS, e-wallet, virtual account).
- **Webhook handler:** Supabase Edge Function.

---

## 6. Onboarding flow — target ≤ 5 menit

**Surface:** Telegram bot `@LirenStandBot` (sama seperti delivery channel, biar nggak ada surface baru).

### Step-by-step

| Step | Durasi | Aksi |
|------|--------|------|
| 1 | 30 detik | Klik "Mulai" di lirenlabs.ai → pilih tier (Starter / Pro) → Xendit checkout |
| 2 | 30 detik | Xendit success → redirect ke Telegram bot dengan one-time code |
| 3 | 60 detik | Bot tanya: nama, target use case (3 chip multi-select dari 8 preset), bahasa output |
| 4 | 90 detik | Backend trigger: IDCloudHost API → spin up VPS → Docker pull Hermes image → setup environment |
| 5 | 30 detik | Bot konfirmasi: *"Agent kamu hidup. Coba ketik /halo buat sapa dia."* |
| 6 | 60 detik | Pelanggan ketik perintah pertama → Hermes respon via proxy → credit balance turun |

**Total: ~4.5 menit** (tergantung speed VPS provisioning IDCloudHost — perlu di-test).

### Yang ditunda ke pasca-onboarding

- Voice/preference calibration → calibrasi via thumbs feedback setelah 3-5 interaksi pertama.
- Calendar OAuth, LinkedIn OAuth, dll → install via Marketplace, bukan upfront.
- Skill selection → default 3 free skill pre-installed, sisanya browse di Marketplace.
- API key custom (untuk power user yang mau BYOK) → fitur Phase 2.

---

## 7. Tech stack

### Layer

```
[Pelanggan: Telegram] 
       ↓
[Liren Stand Dashboard: lirenlabs.ai/stand] (Next.js, Vercel)
       ↓
[Onboarding Bot: @LirenStandBot] (Telegram Bot API + Supabase)
       ↓
[Provisioning Service: Mac Mini] (Node.js, IDCloudHost API)
       ↓
[VPS Pelanggan: IDCloudHost KVM] (Ubuntu 24.04 + Docker + Hermes container)
       ↓
[LLM Proxy: Cloudflare Worker] (forward ke Anthropic, log usage ke Supabase)
       ↓
[Anthropic Claude Sonnet 4.6 / Haiku]
```

### Komponen baru (dibanding Agent Catalog v0)

- **IDCloudHost API integration** — untuk auto-provision VPS.
- **LLM Proxy** — untuk credit metering.
- **Marketplace UI** — di lirenlabs.ai/stand/market.
- **Credit top-up flow** — Xendit integration.
- **Multi-VPS orchestrator** — Mac Mini jadi control plane, bukan compute (compute pindah ke IDCloudHost VPS pelanggan).

### Komponen yang sama

- Hermes sub-agent (ARIA, GHOST, ICARUS) — sama seperti Agent Catalog v0, tapi sekarang container Docker yang di-deploy ke VPS pelanggan, bukan jalan di Mac Mini.
- Telegram delivery — sama.
- Supabase — sama, tambah tabel: `customers`, `credits`, `usage_log`, `vps_instances`, `marketplace_installs`.

### Provisioning script (skeleton)

```typescript
// /provisioning/spin-up.ts
import { IDCloudHostAPI } from './idcloudhost'
import { TelegramBot } from './telegram'
import { supabase } from './supabase'

export async function provisionCustomer(customerId: string, tier: 'starter' | 'pro') {
  const vpsSpec = tier === 'starter' 
    ? { vcpu: 1, ram: 4, disk: 50 }
    : { vcpu: 2, ram: 8, disk: 100 }

  // 1. Spin up VPS
  const vps = await IDCloudHostAPI.createVPS({
    name: `liren-${customerId}`,
    spec: vpsSpec,
    region: 'jakarta',
    os: 'ubuntu-24.04'
  })

  // 2. Wait for VPS to be ready
  await IDCloudHostAPI.waitForReady(vps.id)

  // 3. SSH in, install Docker, pull Hermes image
  await ssh.exec(vps.ip, [
    'curl -fsSL https://get.docker.com | sh',
    'docker pull lirenlabs/hermes:latest',
    `docker run -d --name hermes \
      -e CUSTOMER_ID=${customerId} \
      -e LLM_PROXY=https://proxy.lirenlabs.ai \
      -e TELEGRAM_TOKEN=${process.env.TELEGRAM_TOKEN} \
      lirenlabs/hermes:latest`
  ])

  // 4. Save VPS info to Supabase
  await supabase.from('vps_instances').insert({
    customer_id: customerId,
    vps_id: vps.id,
    ip: vps.ip,
    tier,
    status: 'live'
  })

  // 5. Notify customer via Telegram
  await TelegramBot.send(customerId, 
    `Agent kamu hidup. Coba ketik /halo buat sapa dia.`
  )
}
```

**Estimasi total time:** 90-180 detik (bottleneck = VPS provisioning IDCloudHost). Test dulu sebelum janji 5-menit ke pelanggan.

---

## 8. 90-day plan v2

### Phase 1 — Days 1–14: Foundation + Stand Beta

**Goal:** Build platform infra + onboard 5 beta pelanggan gratis. Content tetap jalan.

| Track | Deliverable |
|-------|-------------|
| Content | Tetap sesuai `03-Content-Strategy.pdf` — 5 post/minggu, IG-first |
| Build | IDCloudHost API integration, LLM proxy, Telegram onboarding bot, Stand dashboard skeleton |
| Beta | 5 beta pelanggan (free), 1-1 onboarding by Richie, gather friction data |

**Gate Phase 1:**
- 500 IG followers
- 3 reel dengan 5k+ views
- 10 DM inquiry
- 5 beta pelanggan aktif di Liren Stand minimal 1 minggu
- Onboarding ≤ 5 menit ter-validasi

### Phase 2 — Days 15–45: Public Stand launch + Specialised Agent

**Goal:** Buka Stand ke public dengan harga 199k/399k. Drop Specialised Agent (Meeting dulu) di Marketplace.

| Track | Deliverable |
|-------|-------------|
| Content | Tetap, plus 2 demo reel khusus Liren Stand |
| Build | Marketplace v1 (10 free skill + 5 premium skill), credit top-up live, Agent Meeting di Marketplace |
| Sales | 10 paying Stand subscriber + 10 Agent Meeting install (Rp 400k launch price) |

**Gate Phase 2:**
- 10 paying Stand subscriber (recurring)
- 10 Agent Meeting install
- Day-30 retention check ≥ 70%
- Top-up rate ≥ 2x subscription value (signal: pelanggan benar-benar pakai)

### Phase 3 — Days 46–90: Full ladder

**Goal:** Tambah Agent Lamaran + LinkedIn ke Marketplace. Bundles. MRR tracking.

| Track | Deliverable |
|-------|-------------|
| Content | Tetap, plus founder note tentang journey |
| Build | Agent Lamaran + Agent LinkedIn di Marketplace, bundles (Career Starter, Personal Brand Pro, Full Stack), referral system |
| Sales | 25 total paying customers, 10 LinkedIn subscriber (MRR signal) |

**Gate Phase 3:**
- 25 total paying customers
- 10 Agent LinkedIn subscriber (real MRR)
- Marketplace install rate ≥ 1.5/customer/bulan (signal: pelanggan eksplor)
- Clear winner agent untuk Month 4 fokus

### Hard constraints (sama seperti v0)

- No paid ads
- No hiring
- No hardware mention (OIC's roadmap, not Liren's)
- No enterprise custom work
- No mid-phase pivot **dari struktur ini**

---

## 9. Brand compliance checklist

Setiap halaman, copy, atau email yang ship harus lewat checklist ini sebelum publish.

### Voice (per `01-Brand-Kit.pdf`)

- [ ] Bahasa Indonesia primary (subtitle EN kalau perlu)
- [ ] `kamu`, bukan `Anda` atau `lo/gue`
- [ ] One idea per sentence, max 2-sentence paragraph
- [ ] Zero exclamation mark di body copy, max 1 per caption
- [ ] Tagline pakai whitelist: *"Liren. Stand taller."* / *"AI yang membantu kamu berdiri lebih tinggi."*
- [ ] Banned words tidak muncul: *basically, kind of, honestly, pretty much, literally, just, revolutionary, disrupt, 10x, game-changer, next-level*

### Visual (per `01-Brand-Kit.pdf`)

- [ ] Liren Blue #0047FF sebagai sole accent
- [ ] Canvas #FAF9F5 (never pure white)
- [ ] Inter Display untuk headline, Inter 400/500 untuk body (never bold/black)
- [ ] Noto Serif SC untuk 立人 accent
- [ ] Chrome gradient hanya di logo
- [ ] Mascot = chrome iridescent teardrop pin (object, not character)

### The one filter question

Sebelum ship apa pun: **"Would someone I respect in Jakarta save this, or scroll past?"** Kalau scroll, jangan publish. No-publish > mediocre-publish.

---

## 10. Open items / next decisions

Hal-hal yang belum bisa diputuskan tanpa data atau test:

1. **Nama produk final.** "Liren Stand" working name. Alternatif: Liren Workspace, Liren Hub. Decide setelah landing page draft.
2. **IDCloudHost API maturity.** Perlu test apakah API bisa auto-provision VPS dalam ≤ 90 detik. Kalau nggak, fallback ke Vultr Jakarta atau pakai Hostinger sementara dengan migrasi plan.
3. **Hermes Docker image.** Belum ada. Perlu di-package dari Hermes sub-agent yang sekarang jalan di Mac Mini.
4. **LLM proxy implementation.** Cloudflare Worker vs Express di Mac Mini — depend on volume. Start dengan Mac Mini, pindah CF Worker kalau >50 customer.
5. **Marketplace skill spec format.** Format YAML/JSON untuk skill manifest perlu diputuskan sebelum third-party skill (Phase 3+).
6. **Refund policy.** Indonesia consumer law butuh policy yang clear. Tulis sebelum public launch.
7. **Hosting page Bahasa.** Halaman pricing replika MyClaw — perlu di-design pakai aesthetic Liren, bukan tiru visual MyClaw.

---

## 11. Next concrete steps

Urutan kerja yang saya rekomendasi (dari sekarang):

1. **Test IDCloudHost API.** 1 hari kerja. Validate provisioning time + reliability.
2. **Package Hermes Docker image.** 2-3 hari. Container yang bisa di-spawn di VPS apa saja.
3. **Build LLM proxy.** 1-2 hari. Express server + Supabase logging.
4. **Design Liren Stand pricing page.** 2 hari. HTML/Next.js, aesthetic Liren, bukan MyClaw.
5. **Build Telegram onboarding bot.** 3-4 hari. Surface utama pelanggan masuk.
6. **Internal end-to-end test.** 1 hari. Onboard diri sendiri sebagai pelanggan, ukur waktu, fix friction.
7. **Onboard 5 beta gratis.** Minggu ke-2. Real data, real friction.

Total estimasi build pre-public: **~2 minggu** kerja Richie + Hermes, paralel dengan Content Phase 1.

---

*Last updated: 2026-04-25 · Author: Richie + Hermes*
*Next review: setelah 5 beta pelanggan onboarded.*
