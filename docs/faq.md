# FAQ

Pertanyaan yang paling sering masuk dari pelanggan baru.

---

## Bayar dan tagihan

**Apa bedanya setup fee sama hosting fee?**

Setup fee dibayar sekali — biaya untuk provision VPS baru atas nama kamu, install Hermes runtime, dan generate persona SOUL.md kamu. Hosting fee Rp 99rb/bulan flat menutup ongoing cost VPS, network, dan storage.

**Hosting fee selalu Rp 99rb meski semua tier?**

Ya. Tier (Starter / Pro / Studio) cuma beda di setup fee + skill yang aktif. Hosting cost VPS kurang lebih sama untuk semua tier.

**Bisa pause kalau lagi nggak pakai?**

Bisa. Dashboard punya tombol "Pause hosting." VPS di-stop, storage tetap (data persona dan history aman). Kamu bayar storage-only ~Rp 17rb/bulan selama paused.

**Pause auto?**

Ya. Kalau VPS idle (zero LLM call) >30 hari, kita auto-suspend untuk hemat cost. Resume kapan saja dari dashboard, butuh 1-2 menit boot.

**Always-On gunanya apa?**

Add-on opsional Rp 49rb/bulan — VPS tetap nyala 24/7, skip auto-suspend. Cocok untuk pengguna harian yang nggak mau ada delay boot.

**Kalau aku stop subscription, data aku gimana?**

Data tetap 30 hari setelah unsubscribe. Kalau kamu resume dalam window itu, semua persona setting + history balik. Lewat 30 hari, VPS dihapus permanent.

**Bisa minta refund?**

Setup fee non-refundable setelah VPS di-spawn (kita keluar uang ke IDCloudHost). Sebelum provisioning jalan (sekitar 30 detik setelah bayar), email kita di support@weuseai.id, kita refund 100%.

---

## LLM dan API key

**Kenapa BYOK?**

Dua alasan. Pertama, kamu kontrol full atas LLM cost — kita nggak markup. Kedua, kamu pilih provider sesuai data privacy preference kamu (DeepSeek di China, OpenAI di US, Anthropic, dll).

**Tier Starter trial credit cara kerjanya gimana?**

Kita kasih $3-5 credit yang routed via DeepSeek — kamu nggak perlu paste API key di awal. Setelah credit habis (~50-100 message percakapan normal), kamu paste DeepSeek key sendiri dari dashboard.

**Bisa ganti LLM provider kapan saja?**

Bisa. Halaman dashboard `/llm-key` ada form paste API key baru. Disimpan ter-enkripsi di DB, ditulis ke VPS Hermes config saat next reboot.

**Provider mana yang paling murah untuk Bahasa?**

DeepSeek V3 — sekitar 10× lebih murah dari GPT-4 untuk output Bahasa berkualitas mirip. Default kita rekomenkan ini.

**Kalau LLM provider down, agent aku gimana?**

Agent balas error message dengan retry hint. Kalau provider down panjang, ganti API key ke provider lain dari dashboard — VPS auto-pickup config baru dalam 1 menit.

---

## Persona dan skill

**Berapa persona aku bisa pakai sekaligus?**

- Starter: 1 persona aktif.
- Pro: sampai 3 persona aktif.
- Studio: semua 10 persona + Master Agent (Business Director v3) untuk routing antar persona.

**Bisa custom persona?**

Persona core di-fix (tone, brand voice, skill set), tapi SOUL.md kamu di-generate dari jawaban onboarding kamu — gaya komunikasi, fokus bisnis, batasan yang dihindari, semua reflektif input kamu.

**Skill bisa di-update?**

Ya. Bundle skill ada versioning. Default Starter pin ke versi terinstall (predictable, no surprise change). Pro / Studio default `latest` — auto-pull versi terbaru saat boot.

**Kalau persona tertentu butuh fitur belum ada gimana?**

The Pro punya skill `extend-capabilities` — kasih tau kebutuhan kamu, dia generate skill baru runtime. Eksperimental tapi sering kepakai untuk one-off.

---

## Telegram dan privacy

**Aku harus bikin bot Telegram sendiri?**

Iya. Tiap pelanggan punya bot sendiri (token sendiri) — chat kamu nggak melewati infrastructure kita. Pesan dari Telegram langsung ke VPS kamu via webhook.

**Kenapa nggak satu bot bersama?**

Dua alasan. Pertama, isolasi data — bot token kamu kontrol sepenuhnya. Kedua, brand identity — bot bisa dinamain bebas (`@AgentBudi`, `@TokoDapurAgent`, dst).

**Group chat support?**

Phase 1 fokus 1-on-1 chat. Group support masuk Phase 2+ kalau ada signal pelanggan minta.

**WhatsApp?**

Ditunda Phase 2. Telegram first karena bot API stabil dan free.

---

## VPS dan teknis

**VPS specs?**

1 vCPU, 1 GB RAM, 25 GB SSD. Cukup untuk Hermes + 3 persona aktif. Studio tier dengan 10 persona aktif disarankan upgrade ke 2 GB (tersedia dari dashboard +Rp 50rb/bulan).

**Region?**

Jakarta default (Indonesia), atau cyc01 (Cyprus, untuk pelanggan SEA non-Indonesia). Latency LLM call sama karena LLM provider di luar Indonesia juga.

**Bisa SSH sendiri ke VPS?**

Bisa, tapi jangan modify file Hermes (`/home/weuseai/`) — config di-rewrite tiap dashboard update dan akan menimpa perubahan kamu. Untuk install tools tambahan, tetep bisa di home directory `weuseai` user.

**Backup?**

Phase 1 belum ada auto-backup. Tier Studio dapat manual snapshot trigger dari dashboard. Auto-backup di Phase 3 roadmap.

---

## Lain-lain

**Aku di luar Indonesia, bisa pakai?**

Bisa, tapi product Bahasa-first. Dashboard ada toggle EN/ID. Persona default switch ke English kalau kamu chat in English first.

**Open source?**

Hermes runtime upstream dari NousResearch (MIT, di github.com/NousResearch/hermes-agent). Persona bundle dan platform layer kami proprietary tapi non-locked — kamu bisa export SOUL.md + skill list kapan saja kalau mau migrate.

**Bisa self-host?**

Phase 1 tidak — provisioning + billing nempel di infrastructure kita. Kalau kamu mau full self-host, install Hermes upstream langsung dari [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) dan tulis SOUL.md sendiri.
