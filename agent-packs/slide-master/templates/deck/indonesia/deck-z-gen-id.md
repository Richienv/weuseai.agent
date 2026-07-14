# Template — Deck Z-Gen Indonesia

Audience: Z-Gen Indonesia (lahir 1997-2012). Use case: presentasi kampus, pitch internship, kampanye brand Gen-Z, lomba mahasiswa, presentasi UKM kampus. Visual ngikut konvensi meme TikTok-id, pacing slide 7 detik per ide, copy casual BI ("nggak", "banget", "lagi viral", "gercep") tapi tetap tanpa exclamation marks dan tanpa banned words.

Beda dari deck korporat: pacing cepat (7-10 detik per slide ide), visual references TikTok-id (jump cut, text overlay tebal, color block neon yang terkontrol), copy register casual tanpa formalitas Pak/Ibu, dan struktur narasi lebih ke hook → context → twist → CTA.

## Variables

- `{{topic}}` — topik presentasi
- `{{presenter_name}}` — nama presenter
- `{{audience_kampus}}` — nama kampus atau acara (contoh: "BEM FEB UI", "Pekan Inovasi Binus", "Internship Day Telkom University")
- `{{hook_one_liner}}` — kalimat hook 5-7 kata yang bikin penasaran
- `{{context_setup}}` — setup konteks 2-3 kalimat casual
- `{{insight_punch}}` — insight utama satu kalimat
- `{{proof_3}}` — 3 bukti atau data point (sebut sumber Indonesia kalau ada)
- `{{twist_takeaway}}` — twist atau pembalikan yang bikin "oh gitu"
- `{{cta_action}}` — action item konkret untuk audience
- `{{closing_line}}` — penutup yang quotable

## Template

```
---
template: deck-z-gen-id
audience: z-gen-indonesia
duration_minutes: 5
slide_count: 10
language: id
register: casual
---

# Slide 1 — Hook (cold open)
**Title:** {{hook_one_liner}}
**Visual:** Background satu warna solid (hitam atau merah-signal), teks display sans-serif tebal 80pt minimum, center anchor. Tidak ada logo, tidak ada nama presenter. Pure hook.
**Speaker note:** Tahan 3 detik. Jangan jelasin. Biarin audience baca dan kepo. Slide ini berfungsi kayak first frame TikTok — kalau nggak nahan attention dalam 3 detik, sisa deck mati. ~7 detik.

# Slide 2 — Kenalin Diri (singkat banget)
**Title:** Halo, gue {{presenter_name}}
**Visual:** Foto presenter setengah body + nama + 1 baris konteks (kampus / role / project terbaru). Layout asymmetric — foto di kanan, teks di kiri.
**Speaker note:** 5 detik intro. Sebut nama, kampus / kerja, satu hal yang bikin kamu kredibel buat ngomongin {{topic}}. Skip ceremonial "selamat pagi semuanya, perkenalkan nama saya..." — itu Z-Gen scroll-past. ~10 detik.

# Slide 3 — Context Setup
**Title:** Jadi gini ceritanya
**Visual:** Split layout — left side ilustrasi atau emoji besar, right side {{context_setup}} dalam 2-3 kalimat casual
**Speaker note:** Setup konteks dengan tone ngobrol, bukan presentasi formal. "Lagi viral nih topik X di TikTok," atau "Coba lo cek deh di Threads, lagi rame banget soal Y." Pakai referensi platform yang Z-Gen pakai. ~20 detik.

# Slide 4 — Data Drop
**Title:** Datanya begini
**Visual:** 3 angka besar sejajar dari {{proof_3}}, masing-masing dengan label pendek dan source line ringkas (contoh: "Sumber: Populix 2025" atau "Sumber: We Are Social Indonesia Digital Report 2026")
**Speaker note:** Sebut angka cepat, satu napas per data point. Source line wajib supaya nggak dianggap ngarang. Z-Gen Indonesia sensitif sama klaim tanpa data — mereka grew up dengan fact-check culture. ~25 detik.

# Slide 5 — Insight Punch
**Title:** Yang gue nggak duga
**Visual:** Quote-style layout dengan {{insight_punch}} dalam tipografi besar, di-tag dengan attribution kalau quote orang lain
**Speaker note:** Ini puncak slide narrative. Tahan 5 detik supaya audience proses. Jangan over-explain. Insight yang bagus speaks for itself. ~15 detik.

# Slide 6 — Why It Matters
**Title:** Kenapa ini penting buat lo
**Visual:** Direct address layout — teks "Lo" di tengah dengan 3 implikasi yang spread radial
**Speaker note:** Bridge dari insight ke audience. "Kalau lo lagi cari magang," atau "Kalau lo lagi mikirin skripsi topik X." Make it personal. ~20 detik.

# Slide 7 — Twist / Counter-narrative
**Title:** Tapi tunggu
**Visual:** Background flip ke warna kontras (kalau slide sebelumnya hitam, slide ini merah-signal). Visual disruption untuk reinforce twist
**Speaker note:** {{twist_takeaway}} — pembalikan yang bikin audience re-evaluate. Z-Gen Indonesia respond ke nuance. Hindari hot-take satu sisi yang gampang dibantah di kolom komen. ~25 detik.

# Slide 8 — Apa yang Bisa Lo Lakuin
**Title:** Yang lo bisa coba sekarang
**Visual:** Checklist 3 item dengan checkbox, masing-masing action item konkret (bukan abstrak)
**Speaker note:** {{cta_action}} dalam bentuk 3 langkah konkret. Bukan "be the change" — tapi "buka aplikasi X, klik Y, share ke teman Z." Z-Gen Indonesia respond ke tactical action, bukan inspirational fluff. ~25 detik.

# Slide 9 — Closing Quote
**Title:** {{closing_line}}
**Visual:** Closing line dalam tipografi besar, satu kalimat quotable yang bisa di-screenshot dan di-share. Nama presenter + handle social di footer kecil
**Speaker note:** Tahan 5 detik. Quote yang screenshotable adalah cara Z-Gen Indonesia "save" presentasi ke memory mereka. Make it tweetable. ~10 detik.

# Slide 10 — Outro & Connect
**Title:** Stay connected
**Visual:** Handle Instagram, TikTok, LinkedIn presenter + QR code yang langsung ke link tree. Tidak ada email — Z-Gen nggak akan email.
**Speaker note:** Sebut platform pilihan ("DM gue di IG kalau mau diskusi"). Skip "thank you for your attention" — closing slide cukup. ~8 detik.
```

## Tone guide

- Casual BI register OK: "nggak", "banget", "lagi viral", "gercep", "lo/gue", "kayak", "gimana". Tetap zero exclamation marks dan tetap zero banned words (basically, just, literally, honestly, kind of, pretty much, revolutionary, disrupt, 10x, game-changer, next-level).
- Pacing wajib cepat. Total deck 5 menit, 10 slide, rata-rata 30 detik per slide. Slide hook dan outro lebih pendek (7-10 detik).
- Visual ngikut konvensi TikTok-id: jump cut antar slide (color flip, layout flip), text overlay tebal yang dominan, foto candid bukan stock photo formal, emoji terkontrol (max 1 per slide).
- Color palette: monochrome base (hitam #0a0a0a, putih #f5f5f5) dengan satu accent neon yang konsisten (merah-signal #E5322D, atau kuning electric #FFD400, atau hijau cyber #00E676). Pilih satu accent dan stick to it.
- Tipografi: display sans-serif tebal untuk hook dan quote (Inter Bold 80pt+, atau ABC Diatype Bold). Body teks lebih kecil dan ringkas.
- Source line wajib untuk klaim data. Z-Gen Indonesia fact-check di Google sambil lo presentasi. Klaim tanpa source = kredibilitas mati.
- Referensi platform yang Z-Gen pakai: TikTok, Instagram, Threads, Discord, X, BeReal, LinkedIn (untuk profesional). Skip Facebook (Gen-X/Boomer platform di Indonesia).
- Quote yang screenshotable di slide closing — Z-Gen "save" presentasi via screenshot, bukan PDF.
- Tetap tanpa exclamation marks. Casual register nggak berarti excited register.
