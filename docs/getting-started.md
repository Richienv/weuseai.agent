# Getting started

Panduan setup awal weuseai.agent — dari bayar setup fee sampai agent kamu siap balas DM Telegram pertama.

Estimasi waktu: 10 menit kalau bot Telegram sudah siap, 20 menit kalau belum.

---

## Apa yang kamu dapat

Satu agent personal yang jalan di VPS sendiri (Indonesia, jakarta region), pakai LLM key kamu, dibungkus persona pilihan kamu. Telegram jadi channel utama — kamu chat agent lewat bot kamu sendiri.

Kontrol sepenuhnya di tangan kamu:

- VPS atas nama kamu di IDCloudHost.
- LLM cost ditagih ke akun kamu (pelanggan Starter dapat $3-5 trial credit dari kita untuk cobain).
- Bisa pause kapan saja dari dashboard. Hosting fee turun ke storage-only (~Rp 17rb/bulan) saat di-pause >30 hari.

---

## Sebelum mulai

Yang perlu kamu siapin (10-20 menit, gratis):

- **Email aktif** — buat invoice + login dashboard.
- **Akun Telegram pribadi** — kamu yang chat agent.
- **Bot Telegram baru** — bikin di [@BotFather](https://t.me/BotFather) dengan command `/newbot`. Simpan token yang dikasih (format: `123456789:AAH...`).
- **API key LLM** untuk tier Pro / Studio — opsi populer:
  - [DeepSeek](https://platform.deepseek.com) — paling murah untuk Bahasa.
  - [OpenRouter](https://openrouter.ai) — single key untuk akses banyak model.
  - [Z.ai (GLM)](https://z.ai) — alternatif domestik Asia.
  - OpenAI / Anthropic juga bisa kalau kamu punya credit di sana.

Tier Starter dapat $3-5 trial credit dari kita yang routed via DeepSeek — bisa langsung pakai tanpa API key sendiri di awal.

---

## Langkah 1: Bayar setup fee

Buka [weuseai-agent.vercel.app](https://weuseai-agent.vercel.app), pilih tier, klik checkout.

Pilihan tier (satu kali bayar setup, lalu Rp 99rb/bulan hosting):

| Tier | Setup | Cocok buat |
|---|---|---|
| Starter | Rp 299rb | Cobain pertama, satu persona, light use |
| Pro | Rp 1,2jt | Multi-persona, daily driver |
| Studio | Rp 4,9jt | Cofounder mode (Phase 5+) — Master Agent + 5 department pack |

Bayar via Xendit — QRIS, e-wallet, atau virtual account semua jalan.

---

## Langkah 2: Lengkapi onboarding

Setelah bayar, kamu di-redirect ke `/onboarding`. Form ini ngumpulin:

1. **Nama display kamu** — yang dipakai agent saat menyapa.
2. **Pilihan persona** — 10 specialist tersedia (lihat `docs/agent-guide/`). Bisa pilih lebih dari satu kalau tier Pro / Studio.
3. **Bot Telegram token** — paste yang kamu dapat dari @BotFather.
4. **API key LLM** — paste dari provider pilihan (skip ini kalau tier Starter dengan trial credit).
5. **Beberapa pertanyaan kontekstual** — fokus bisnis, gaya komunikasi, batasan yang harus agent hindari. Jawaban kamu dipakai untuk generate SOUL.md (file persona kustom).

Setelah submit, di belakang layar:

- Provisioning service spawn VPS baru di IDCloudHost (Jakarta region), 5-10 menit.
- VPS booting jalanin upstream Hermes installer + tulis SOUL.md kamu ke `/home/weuseai/.hermes/.env`.
- Hermes pull bundle skill yang sesuai persona pilihan kamu dari edge function kita.
- Halaman onboarding kasih kamu **6-digit pairing code**.

---

## Langkah 3: Pair Telegram bot

Buka chat ke bot kamu sendiri di Telegram (cari nama bot yang kamu bikin di @BotFather). Kirim 6-digit pairing code dari halaman onboarding.

Bot bales dengan greeting persona kamu. Pairing selesai — chat_id kamu kerekam di DB, dan semua chat selanjutnya di-route ke agent kamu di VPS.

Kalau pairing code kadaluarsa (15 menit), klik "Rotate code" di halaman onboarding untuk dapat code baru.

---

## Langkah 4: Pesan pertama

Setelah bot bales greeting, kamu siap. Coba pesan pertama:

- **The Pro:** "Briefing pagi aku, dong"
- **Doc Expert:** "Bikin invoice buat klien X, item: jasa konsultasi 5 jam Rp 500rb/jam"
- **Trade Pro:** "Recap IDX hari ini"

Agent akan call LLM kamu, balas via bot Telegram. Setiap message tercatat di `usage_log` — kamu bisa lihat status di dashboard.

---

## Pertanyaan lanjutan

- **FAQ umum:** [`docs/faq.md`](./faq.md)
- **Sesuatu rusak?** [`docs/troubleshooting.md`](./troubleshooting.md)
- **Detail per persona:** [`docs/agent-guide/`](./agent-guide/)

---

## Yang berikutnya

- **Dashboard:** view status hosting, pause / resume agent, lihat usage log.
- **Always-On (+Rp 49rb/bulan):** skip auto-suspend setelah 30 hari idle. Cocok kalau kamu pakai harian.
- **BYOK API key rotation:** ganti LLM provider kapan saja dari halaman dashboard.
