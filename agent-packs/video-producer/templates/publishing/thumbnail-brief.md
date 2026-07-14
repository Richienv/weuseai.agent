# Template — Thumbnail design brief

Brief untuk thumbnail YouTube atau cover Reels / TikTok. Subject utama jelas, emosi tunggal, teks overlay maksimal 4 kata, palet 2-3 warna, plus reference image. Thumbnail yang **mengundang klik**, bukan thumbnail yang berusaha terlalu keras.

---

## Variables

- `{video_title}` — judul kerja
- `{platform}` — youtube | reels-cover | tiktok-cover
- `{aspect_ratio}` — 16:9 (YouTube) atau 9:16 (Reels / TikTok cover)
- `{main_subject}` — siapa atau apa yang jadi fokus thumbnail
- `{emotion}` — satu kata: shock, curious, calm, confident, worried, knowing
- `{video_topic_short}` — topik inti dalam 1-2 kata
- `{brand_palette}` — daftar 2-4 warna utama brand (hex)

---

## Template

```
THUMBNAIL BRIEF — {video_title}
Platform: {platform}
Aspect: {aspect_ratio}

────────────────────────────────────────
MAIN SUBJECT
────────────────────────────────────────
{main_subject}
Position in frame: <left-third / right-third / center>
Scale: <tight crop, head-and-shoulders, full body>
Direction of gaze (kalau ada wajah): <ke kamera, ke teks overlay, atau off-frame>

────────────────────────────────────────
EMOTION (single — jangan campur)
────────────────────────────────────────
{emotion}
Reference: <satu reference image, link atau filename>
Anti-emotion: <emosi yang harus DIHINDARI di frame ini, biar nggak kabur>

────────────────────────────────────────
TEXT OVERLAY
────────────────────────────────────────
Words: "<≤4 kata, bukan ulang title>"
Why these words: <kenapa ini melengkapi judul, bukan mengulang>
Font weight: <ultra-bold / bold / regular>
Position: <opposite to main subject — biar balance>
Size: <large — readable di mobile preview 1.5cm>

────────────────────────────────────────
COLOR PALETTE
────────────────────────────────────────
Primary:    <hex> — <fungsi: background, fill subject, atau accent>
Secondary:  <hex> — <fungsi>
Accent:     <hex> — <fungsi: text contrast atau detail>
Brand ref:  {brand_palette}

Rule:
- 60% primary
- 30% secondary
- 10% accent
- Cek contrast antara teks dan background — minimum WCAG AA

────────────────────────────────────────
REFERENCE IMAGES (1-3)
────────────────────────────────────────
1. <link / filename>     — <apa yang di-borrow: komposisi, palet, atau emotion>
2. <link / filename>     — <apa yang di-borrow>
3. <link / filename>     — <apa yang di-borrow>

(Reference bukan untuk dijiplak. Borrow 1 elemen per reference, bukan keseluruhan.)

────────────────────────────────────────
MOBILE PREVIEW TEST
────────────────────────────────────────
Scale thumbnail ke 320×180 px (YouTube) atau 200×356 px (Reels / TikTok).
- [ ] Subject masih jelas dikenali?
- [ ] Teks masih terbaca?
- [ ] Emosi masih nyampe?
- [ ] Klik-able tanpa context (bayangkan di scroll feed)?

Kalau ada 1 jawaban "tidak," revisi sebelum publish.

────────────────────────────────────────
ANTI-PATTERN (jangan dilakuin)
────────────────────────────────────────
- Teks > 4 kata — pasti susah baca di mobile
- 3+ subject di frame — mata nggak tahu fokus ke mana
- Multiple emotions — kabur, klik-rate turun
- Saturated rainbow color — terlihat clickbait murah
- Arrow + circle + red border — visual cliche, mid-2026 sudah saturated
- Open mouth shock face — saturated, kecuali brand-mu memang itu identity-nya
- Title repeated di thumbnail — wasted real estate

────────────────────────────────────────
DELIVERY
────────────────────────────────────────
Format: PNG atau JPG, < 2MB (YouTube cap)
Resolution: 1280×720 (YouTube), 1080×1920 (Reels / TikTok cover)
Variants: 2-3 untuk A/B test di YouTube (pakai YouTube native A/B tool kalau ada akses)
```

---

## Tone guide

- Thumbnail **bukan poster**. Tujuannya satu: bikin orang yang scroll feed berhenti dan klik. Setiap elemen di frame harus support tujuan itu.
- Satu subject, satu emosi. Kalau brief minta "shock dan curious dan happy," balik dulu — pilih satu.
- Teks overlay **complement title, bukan repeat**. Title + thumbnail teks = full message. Kalau dua-duanya bilang hal sama, satu wasted.
- 4 kata adalah ceiling. 2 kata sering lebih kuat. Cek selalu di mobile preview 320px.
- Color palette dibatasi. 2-3 warna utama, 60/30/10. Lebih dari itu = visual noise, lebih sedikit klik.
- Reference image untuk **borrow elemen**, bukan jiplak komposisi penuh. Sebut spesifik apa yang di-borrow di brief.
- Anti-pattern section ada di brief sengaja — designer (atau kamu sendiri) sering tergoda pakai visual cliche yang udah saturated.
- Producer's-eye discipline: kalau brief thumbnail-mu lebih panjang dari ringkasan video, kemungkinan kamu compensating untuk video yang hook-nya belum tajam. Balik ke skrip.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark di brief.
