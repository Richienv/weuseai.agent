# Template — Script TikTok-ID dengan 7-second-hook structure

Script template untuk TikTok-Indonesia dengan struktur 7-second-hook — kompromi antara hook 3-detik (US TikTok convention) dan attention pacing audience Indonesia yang sedikit lebih sabar di awal video (sekitar 5-7 detik sebelum decision swipe). Cocok untuk konten edukasi-ringan, lifestyle, niche storytelling, dan promo product yang tidak hard-sell.

Register: BI casual TikTok-ID. Bukan formal, bukan alay. Konteks: kamu lagi ngobrol sama temen kerja yang lo respect.

---

## Variables

- `{niche}` — string. Vertical (fintok, kuliner, kecantikan, parenting, karir, dst.).
- `{topic}` — string. Topik spesifik video.
- `{target_persona}` — string. Audience yang dituju, deskripsi singkat (mis. "perempuan 25-32, kerja kantoran Jabodetabek, baru mulai investing").
- `{duration_sec}` — int. 15 / 30 / 60 (default 30 untuk struktur ini).
- `{brand_callout}` — string. Nama brand + 1-line positioning.
- `{cta_intent}` — enum. `save` | `share` | `comment` | `follow` | `link-in-bio`.
- `{creator_voice}` — enum. `playful-conversational` | `calm-educational` | `warm-mentoring` | `dry-witty`.

---

## Production notes

### 7-second hook — kenapa bukan 3-detik

- TikTok US convention: 3-detik hook karena attention span audience trained untuk swipe cepat.
- TikTok Indonesia: audience sedikit lebih **kuratif** di awal — ngasih kesempatan creator untuk setup konteks. Decision swipe terjadi di 5-7 detik, bukan 3.
- Struktur 7-second-hook = 0-2s pattern interrupt + 2-7s setup tension. Audience yang lewatin detik ke-7, lewatin video keseluruhan.
- Reference points: creator edukasi-finansial (Felicia Putri Tjiasaka, Raditya Dika di mode TikTok, content kreator kuliner @kuepukismodal) — semua pakai struktur setup-tension lebih lambat dari TikTok-US.

### BI register TikTok-ID

| Boleh | Hindari |
|-------|---------|
| "Lo wajib tau" / "Kamu wajib tau" (consistent satu video) | Switching `lo` ↔ `kamu` ↔ `Anda` di video yang sama |
| "Eh, ada yang baru nih" | "Halo guys" / "Hai semuanya" (terlalu YouTube intro) |
| "Btw ini gila sih" | "OMG ini amazing banget seriously" |
| "Coba bayangin" / "Kira-kira aja" | "Imagine if" (kalau audience bukan urban-bilingual) |
| Code-switch BI-EN buat term teknis ("workflow", "dashboard", "ROI") | Code-switch berlebihan ("aku really excited banget actually") |
| Slang ringan ("nge-bug", "auto", "vibes-nya beda") | Slang berat tanpa konteks ("anjir", "njir", "wkwk") di brand video |
| Referensi pop-culture lokal (drakor, K-pop juga OK, anime) | Referensi US politik / pop-culture niche tanpa subtitle |
| "Komen 'YA' kalau relate" | "Comment below if you agree" |

### Beat structure 7-second-hook

```
0-2s   : HOOK — pattern interrupt (visual + audio + 1 kalimat)
2-7s   : SETUP — raise the stakes, tension, "kenapa lo harus dengerin sampe abis"
7-15s  : BODY 1 — problem context, biasanya 1 spesifik scenario
15-22s : BODY 2 — answer / framework / solution, paling tajam
22-27s : PAYOFF — sentence yang orang mau screenshot
27-30s : CTA + brand callout
```

Note: untuk 60s video, multiply body section: 0-7s hook+setup, 7-50s body (3 segmen), 50-60s payoff+CTA.

### Visual cue convention

- **Cut frequency**: ~1 cut per 2 detik di body. Cut lambat (1 per 4-5 detik) = audience disengage.
- **On-screen text**: maksimal 6 kata per frame. Font sans-serif tebal (Inter, Helvetica, atau native TikTok font).
- **Caption position**: sisakan ruang **bawah** untuk caption + interface TikTok. Jangan taroh text penting di bottom-third.
- **Color**: hindari pure white text di pure white background — TikTok compression bikin blur. Pakai shadow / outline.

---

## Template

```
SCRIPT TIKTOK-ID — {topic}
Niche: {niche}
Target: {target_persona}
Durasi: {duration_sec}s
Voice: {creator_voice}
CTA intent: {cta_intent}
Brand: {brand_callout}

────────────────────────────────────────
BEAT 1 — HOOK (0:00 – 0:02)
────────────────────────────────────────
On-screen text:   <≤6 kata, pattern interrupt visual. Contoh: "Gaji 5 juta. Tabungan 0.">
VO / on-cam line: <1 baris, baca dalam 1 napas. Contoh: "Tunggu, lo perlu liat ini.">
Visual cue:       <shot type + subject + props. Contoh: "Medium CU, talent direct-to-camera, foreground objek terkait topik">
Audio cue:        <sound + entry. Contoh: "Trending sound 'X' dari beat 1, atau dry sync sound on-cam">
Why this hook:    <1 baris — kenapa beat ini stop-the-scroll untuk {target_persona}>

────────────────────────────────────────
BEAT 2 — SETUP (0:02 – 0:07)
────────────────────────────────────────
VO / on-cam line: <2 kalimat max. Raise stakes — "kenapa ini relevan untuk lo spesifik">
Visual cue:       <cut ke B-roll atau detail shot — break talking-head fatigue>
Audio cue:        <sound continue, atau soft swap>
On-screen text:   <optional, reinforce 1 angka atau 1 kata kunci>

────────────────────────────────────────
BEAT 3 — BODY 1 (0:07 – 0:15)
────────────────────────────────────────
VO / on-cam line: <problem context — 1 scenario spesifik. Contoh: "Bayangin lo lagi mau beli rumah, terus...">
Visual cue:       <re-enactment, screen recording, atau infographic simple>
Audio cue:        <sound continue, atau drop ke beat>
Cut count:        <3-4 cut di segment ini>

────────────────────────────────────────
BEAT 4 — BODY 2 (0:15 – 0:22)
────────────────────────────────────────
VO / on-cam line: <answer / framework / solution. Paling tajam. Contoh: "Caranya ada 3 langkah, dan langkah ke-2 yang biasanya kelewat.">
Visual cue:       <text overlay framework, atau hand gesture counting>
Audio cue:        <slight intensity rise, atau silence accent>
On-screen text:   <kata kunci framework, 1-3 frame>

────────────────────────────────────────
BEAT 5 — PAYOFF (0:22 – 0:27)
────────────────────────────────────────
VO / on-cam line: <sentence yang orang mau screenshot. Distill insight ke 1 kalimat tajam.>
Visual cue:       <return ke talking head close-up — emotional anchor>
Audio cue:        <sound peak, atau drop>
On-screen text:   <quote-able line, large font>

────────────────────────────────────────
BEAT 6 — CTA + BRAND CALLOUT (0:27 – 0:30)
────────────────────────────────────────
VO / on-cam line: <CTA spesifik + brand mention natural. Contoh: "Save buat reminder. Btw ini aku pakai {brand_callout}, link di bio.">
Visual cue:       <direct-to-camera + text overlay CTA>
Audio cue:        <sound outro fade>
On-screen text:   <CTA verb: "Save", "Komen 'YA'", "Share ke teman">

────────────────────────────────────────
PRODUCTION NOTES
────────────────────────────────────────
- Total cuts target: 12-18 untuk video 30s
- B-roll budget: 2× durasi target (60s b-roll untuk 30s video)
- Captions burnt-in: ya, bukan dependent ke auto-caption TikTok
- Vertical aspect: 1080×1920, safe area 1080×1600 (hindari area UI TikTok)
- Risk flag: <kalau ada gray-area, brand-voice tension, atau topic sensitive>
```

---

## Tone guide

- Hook **muscular**: kata kerja aktif, present tense, audience-specific. Generic hook = generic skip rate.
- 7-second window itu **earned attention**, bukan dipaksa. Kalau lo butuh hard-sell di detik ke-5, body lo nggak cukup kuat.
- Konsisten register satu video. Pilih `lo` atau `kamu` di intro, pakai sampai outro. Switching = audience confused.
- Payoff sentence harus **berdiri sendiri**. Kalau payoff cuma masuk akal pas konteks body, payoff belum cukup tajam.
- CTA spesifik > generic. "Save buat reminder pas gajian" mengalahkan "save video ini".
- Brand callout di payoff/CTA, bukan di hook. Brand di hook = audience curiga "ini iklan", skip cepat.
- Pop-culture referensi boleh, tapi cek umur — referensi yang cuma kenal generation tertentu bikin audience lain feel left out.
- Humor boleh, tapi BUKAN soal agama, ras, suku, kelas sosial, fisik orang lain. Itu bukan humor, itu beban legal dan reputasi.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark di body copy. Kalau emosi tinggi, kasih ke visual + audio cue, bukan punctuation.
