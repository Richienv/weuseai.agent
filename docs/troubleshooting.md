# Troubleshooting

Masalah umum + langkah cek dari sisi kamu. Kalau tetep buntu, kontak support@weuseai.id dengan customer id kamu (dari URL dashboard) — admin punya tool diagnosa internal.

---

## Onboarding stuck di "VPS provisioning"

**Gejala:** halaman onboarding stay di "Setup VPS sedang berjalan..." >10 menit.

**Cek:**

1. **Tunggu 12 menit total.** Cloud-init Hermes pertama install ~6-8 menit (download Hermes binary + dependencies). Kadang network IDCloudHost lagi padat.
2. **Reload halaman.** Polling kadang stuck di sisi browser meski VPS udah ready.
3. **Lihat dashboard `/dashboard`.** Kalau tier subscription kamu udah `active` di sini tapi onboarding belum lanjut, ada bug — kontak support.

**Resolve:** kalau lewat 15 menit dan masih stuck, kemungkinan IDCloudHost API hiccup. Kontak support — kita re-trigger provisioning manual (gratis, tagihan kamu tetap satu setup fee).

---

## Bot Telegram nggak bales pairing code

**Gejala:** kamu DM 6-digit code ke bot, nggak ada bales.

**Cek:**

1. **Kamu DM bot yang benar?** Bot kamu ada di hasil pencarian Telegram dengan nama yang kamu set di @BotFather. Cek satu lagi — gampang typo username.
2. **Pairing code masih valid?** Code expire 15 menit setelah generate. Klik "Rotate code" di halaman onboarding untuk yang baru.
3. **Token bot benar?** Buka @BotFather, ketik `/mybots`, pilih bot kamu, klik "API Token." Bandingin dengan yang kamu paste di onboarding. Kalau beda, paste ulang.
4. **Bot kamu di-block?** Cek di Telegram → kamu pernah `/stop` bot ini? Klik "Restart" di chat.

**Resolve:** kalau token salah dan kamu udah submit onboarding, dashboard punya field "Update Telegram bot token" — paste yang benar di sana.

---

## Agent balas dengan "LLM error" atau diam total

**Gejala:** kamu chat agent, balasan error atau zero response.

**Cek:**

1. **API key valid?** Login ke provider kamu (DeepSeek / OpenRouter / dll), cek key masih aktif dan ada balance.
2. **Provider lagi outage?** Cek status page provider:
   - DeepSeek: [status.deepseek.com](https://status.deepseek.com)
   - OpenAI: [status.openai.com](https://status.openai.com)
   - Anthropic: [status.anthropic.com](https://status.anthropic.com)
3. **Tier Starter trial credit habis?** Tagihan Rp 0 di dashboard credit log = credit habis. Paste DeepSeek key kamu sendiri di dashboard `/llm-key`.

**Resolve:** ganti LLM provider dari dashboard. VPS Hermes pickup config baru ~1 menit (next message).

---

## VPS tiba-tiba stop / paused

**Gejala:** dashboard nunjukin VPS status `stopped` atau `paused`.

**Cek:**

1. **Auto-suspend kena?** Idle >30 hari = auto-pause untuk hemat cost. Kalau kamu mau aktif lagi, klik "Resume hosting" di dashboard. Boot 1-2 menit.
2. **Hosting fee belum kebayar?** Subscription invoice failed = hosting suspended otomatis. Cek email + dashboard billing — bayar invoice yang pending, hosting auto-resume.
3. **Always-On di-disable?** Kalau kamu sebelumnya pakai Always-On lalu cancel, auto-suspend rule aktif lagi.

**Resolve:** untuk skip auto-suspend permanent, enable Always-On (+Rp 49rb/bulan) di dashboard.

---

## Dashboard `/dashboard` blank atau error

**Gejala:** halaman dashboard load tapi data kosong.

**Cek:**

1. **Login token expired?** Logout-login ulang dari halaman utama.
2. **Customer id di URL benar?** Format harus uuid (8-4-4-4-12 hex). Kalau kamu paste manual dari email, pastiin nggak ada whitespace.
3. **Browser cache?** Hard reload (Cmd-Shift-R / Ctrl-Shift-F5).

**Resolve:** kontak support kalau persistent — kita lookup customer id kamu via email.

---

## Skill tertentu nggak muncul di agent

**Gejala:** kamu minta agent jalanin skill tertentu, dia bilang "Skill itu belum tersedia."

**Cek:**

1. **Tier kamu support skill ini?** Cek `docs/agent-guide/<persona>.md` — kolom "Tier" di tiap skill. Kalau Studio-only dan kamu Pro, butuh upgrade.
2. **Bundle udah ke-pull?** Dashboard ada section "Bundle status." Kalau status `failed`, ada masalah di sisi VPS pull. Kontak support.
3. **Skill versi lama?** Kalau policy kamu `pin`, kamu stuck di versi yang ke-install pertama. Ganti policy ke `latest` dari dashboard untuk auto-update.

**Resolve:** untuk graduate seed skill (Phase 4-3 DRAFT), butuh founder Autobrowse capture session. Reach out kalau urgent — biasanya kita batch graduate per minggu.

---

## Notifikasi Telegram tidak masuk meski agent kerja

**Gejala:** dashboard nunjukin agent reply tercatat di `usage_log`, tapi kamu nggak terima notifikasi di Telegram.

**Cek:**

1. **Telegram app punya internet?** Trivial tapi sering kelewat.
2. **Bot kamu di-mute di chat?** Tap nama bot di Telegram → "Notifications" → pastiin On.
3. **chat_id kamu re-paired ke device baru?** Kalau kamu pindah handphone, Telegram chat_id biasanya tetep — tapi kalau kamu bikin akun Telegram baru, chat_id berubah dan pairing perlu ulang.

**Resolve:** klik "Re-pair Telegram" di dashboard untuk dapat pairing code baru, pair ulang.

---

## Aku salah pilih persona di onboarding

**Gejala:** kamu udah onboard tapi sadar persona pilihan kurang cocok.

**Resolve:** dashboard `/persona` ada tombol "Switch persona" (tier Pro / Studio). Tier Starter cuma 1 persona aktif — untuk ganti, kontak support, kita migrate manual (gratis).

Catatan: switch persona regenerate SOUL.md kamu dengan input onboarding sebelumnya. Kalau kamu mau update jawaban kontekstual (fokus bisnis, batasan, dll), edit di halaman onboarding lalu klik "Regenerate SOUL.md."

---

## Aku mau migrasi data ke self-host

**Gejala:** kamu mau cabut tapi keep persona dan history.

**Resolve:** dashboard `/export` (Phase 2 roadmap) generate tarball berisi:

- `SOUL.md` kamu
- Bundle skill metadata (pinned versions)
- Chat history dari `usage_log` (json export)

Sementara Phase 1, kontak support — kita kirim manual via email setelah verify customer id.

---

## Kontak support

- Email: support@weuseai.id
- Telegram: [@weuseai_support](https://t.me/weuseai_support)
- Sertakan customer id (uuid dari URL dashboard) dan deskripsi masalah singkat.

Response time: <24 jam business day. Critical issue (VPS down / akun ter-block) prioritas — usually <2 jam.
