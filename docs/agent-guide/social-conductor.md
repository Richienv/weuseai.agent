# Social Conductor

Content engine social media. Calendar lintas platform, post drafting per-platform, voice-consistency checker, engagement log. **Tidak scraping, tidak auto-post** — kamu yang submit ke platform.

**Tier:** Pro, Studio.

---

## Apa yang kamu dapat

- **Voice locker** — lock brand voice profile dari 20+ sample writing kamu. Reference yang dipakai semua draft skill untuk fit-score.
- **Content calendar builder** — slot terjadwal di local DB kamu (bukan platform 3rd-party). Export ke `.ics` atau Google Calendar manual.
- **Post drafter per platform** — caption length-adjusted: TikTok ~150 char, Reels ~125, X ~280, LinkedIn ~700. Voice-fit scored.
- **Engagement log** — tracking comment / DM yang masuk + draft balasan dalam voice kamu.

---

## Sample tasks

- "Lock brand voice aku dari 20 caption Instagram terakhir [paste 20 caption]" — voice profile saved, nilai reference untuk semua draft.
- "Susun content calendar 4 minggu untuk TikTok + LinkedIn, ratio 70/30 educational/promotional" — kalender slot di local DB.
- "Draft 3 caption TikTok untuk post besok tentang launch produk baru" — 3 variant, voice-fit score per variant.
- "Komentar masuk hari ini dari fans X: '[paste comment]'. Drafkan reply dalam voice gw" — reply draft ready review.

---

## Skill list

| Skill | Tier | Penjelasan |
|---|---|---|
| `voice-locker` | Pro+ | Lock brand voice dari 20+ sample |
| `content-calendar-builder` | Pro+ | Cross-platform calendar di local DB |
| `post-drafter` | Pro+ | Per-platform caption (length + voice) |
| `engagement-logger` | Pro+ | Tracking + draft reply |

---

## Voice locker mechanics

Kamu paste 20+ sample writing kamu (caption, post, email panjang — yang authentically suara kamu). Voice locker extract:

- Sentence length distribution
- Vocab signature (kata yang sering dipakai, kata yang kamu hindari)
- Emoji usage pattern
- Rhythm (paragraph break frequency)
- Tone marker (casual / formal / playful / serious split)

Profile disimpan di `voice-profile.md` di VPS kamu. Setiap draft skill (post-drafter, engagement-logger) reference profile ini untuk score fit. Score <80% = warning, kamu bisa request rewrite atau accept.

---

## Limitasi

- **Tidak scraping** — analytics platform (TikTok views, X impressions) bukan tarikan otomatis. Kamu paste atau export manual untuk dianalisis.
- **Tidak auto-post** — draft selesai, kamu copy-paste ke platform. Decision keep di kamu untuk hindari kebijakan platform yang melarang automation.
- **Phase 1:** integration calendar Google belum live. Export `.ics` lalu import manual di Google Calendar / Apple Calendar.

---

## Kapan switch ke persona lain

- Kalau kamu butuh **video content (tidak hanya caption)** → [Video Producer](./video-producer.md).
- Kalau kamu butuh **landing page atau website pendukung** → [Web Master](./web-master.md).
- Kalau kamu butuh **dokumen panjang (article, ebook)** → [Doc Expert](./doc-expert.md).
