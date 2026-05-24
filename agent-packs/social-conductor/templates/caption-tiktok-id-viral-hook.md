# Template — Caption TikTok-id viral hook

> Dipakai `post-drafter` saat platform = `tiktok` dan customer target audience domestik Indonesia. Bukan TikTok global. Ritme TikTok-id beda: hook harus jalan dalam 7 detik attention window, register casual ("nggak", "banget", "lagi viral" boleh), CTA selalu ke "follow buat tips serupa". Hashtag mix Indonesian trending + niche, bukan global.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{hook_line}` | ya | 10 karakter pertama harus pull attention. Contoh: "Lo wajib tau", "Jakarta lagi", "Kalo kamu suka" |
| `{value_payoff}` | ya | Inti value 1-2 kalimat. Casual, conversational |
| `{cta_follow}` | ya | CTA harus mengarah ke "follow buat tips serupa", bukan "subscribe to my channel" |
| `{trending_tag_id[]}` | ya | 2-4 hashtag trending Indonesia (`#fyp`, `#fypシ`, `#xyzbca`, `#tipsharian`, `#jakartainfo`) |
| `{niche_tag_id[]}` | ya | 2-3 hashtag niche Indonesia spesifik topic (`#kulinerjakarta`, `#bisnisumkm`, `#tipskerja`) |
| `{micro_local_tag}` | tidak | Optional 1 tag kota-spesifik (`#jakartapusat`, `#bandungfood`, `#suryabaya`) |

---

## Template

```
{hook_line} — {one_word_tease}.

{value_payoff_line_1}.
{value_payoff_line_2}.

Follow buat tips serupa, ya kak.

{trending_tag_id_joined} {niche_tag_id_joined} {micro_local_tag}
```

### Contoh terisi (topic: tips voice profile untuk brand UMKM, audience Jakarta)

```
Lo wajib tau hal ini — caption brand kamu flat.

Caption ganti-ganti tone bikin audience bingung.
Lock voice dulu dari 20 sample, baru draft konsisten.

Follow buat tips serupa, ya kak.

#fyp #fypシ #tipsharian #brandvoiceid #captionwriter #umkmindonesia #jakartainfo
```

### Contoh kedua (topic: food review warteg, audience Jakarta foodie)

```
Jakarta lagi rame banget warteg satu ini.

Sambel terasinya bikin nagih, harga di bawah 25rb seporsi.
Lokasi di Tebet Timur, buka jam 9 pagi sampe 9 malam.

Follow buat tips serupa, ya kak.

#fyp #fypシ #kulinerjakarta #wartegjakarta #foodjakarta #tebetfoodie
```

---

## Reference packet — TikTok Indonesia awareness

### Trend cycle (per 2026 awareness — verifikasi via TikTok Discover sebelum post)

- **Joget challenge:** durasi pendek (≤15 detik), sound trending TikTok ID, biasanya cover dance dari lagu viral atau audio Indonesia spesifik
- **Ngobrolin politik / sosial:** carousel atau talking-head, register sopan tapi tegas, hindari personal attack — auto-flag TikTok Indonesia moderasi
- **Food review Jakarta / kota lain:** B-roll makanan + voice-over harga, format "POV: nyobain X di Y" sering viral
- **Tutorial harian:** "Cara X dalam 30 detik" — productivity, masak, hijab, makeup tutorial dominan di FYP Indonesia
- **Curhat / storytime:** talking-head dengan caption singkat di hook, audience Indonesia engage tinggi di format relatable

### Hashtag mix wajib (Indonesia-localized)

- 2-4 trending: `#fyp`, `#fypシ`, `#xyzbca`, `#viral`, `#tipsharian`, `#beranda`
- 2-3 niche topic Indonesia: `#kulinerjakarta`, `#bisnisumkm`, `#tipskerja`, `#brandvoiceid`, `#hijabstyle`, `#tutorial`
- 0-1 micro-local: `#jakartapusat`, `#bandungfood`, `#suryabaya`, `#bali`, `#yogyakarta`

**Jangan pakai sebagai primary:** `#tiktokviral`, `#foryoupage`, `#trending` (English-only global tag, reach Indonesia lemah)

---

## Tone guide — TikTok-id

- **7-second attention window:** 10 karakter pertama caption wajib hook. Kalau hook lemah, scroll-pass. Statement, bukan introduction
- **Register casual diperbolehkan:** "nggak", "banget", "lagi viral", "kak", "min", "gue" (kalau cocok brand) — TikTok-id audience ekspektasi conversational
- **Tetap zero exclamation marks:** calm-premium register survives even casual platform. Bukan over-energetic
- **CTA wajib "follow buat tips serupa":** bukan "subscribe", bukan "klik link di bio" (TikTok prioritize follow-action). Variant boleh: "Save buat dipake nanti", "Komen kalo mau detail"
- **Sapaan "ya kak" / "ya min":** Indonesia-deep, natural di TikTok-id. Bukan "guys", bukan "everyone"
- **Hashtag posisi akhir caption:** TikTok-id audience ekspektasi tag di bottom. Bukan inline di body
- **Mix bahasa OK terbatas:** "tips & trick", "POV", "fyp" pinjam English boleh. Tapi body text dominan BI

---

## BANNED di caption TikTok-id (jangan pakai sama sekali)

- `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`
- Exclamation marks (zero, termasuk hook)
- "Subscribe to my channel" (salah platform — itu YouTube)
- Hashtag global-only sebagai primary (`#trending`, `#foryou`)

---

## Validation rules (skill-side)

- Caption ≤150 karakter (TikTok recommended cap)
- 10 karakter pertama harus mengandung hook word
- Hashtag count 5-8 total, mix wajib trending + niche
- CTA harus mengandung kata "follow" atau "save" atau "komen" (TikTok-actionable)
- Skor voice-fit terhadap locked voice profile sebelum kirim
