# Template — Caption Instagram-id feed

> Dipakai `post-drafter` saat platform = `instagram` (feed post, bukan story / reel). Indonesian creator standard: first line hook (visible di feed tanpa user tap "more"), 3-paragraph structure (hook + value + CTA), hashtag mix 5 trending Indonesian + 5 niche Indonesian + 5 micro-local kota-spesifik. Register calm-premium, bukan influencer-shouting.

---

## Variables

| Variable | Wajib | Notes |
|---|---|---|
| `{hook_line}` | ya | First line yang muncul di feed sebelum "more" — pull attention. Max 125 karakter |
| `{value_paragraph}` | ya | Body 2-3 kalimat. Deliver insight, story, atau pengamatan |
| `{cta_line}` | ya | Soft CTA — "Save buat dipake nanti", "Komen pengalaman kamu", "Tap dua kali kalau setuju" |
| `{trending_id_tags[]}` | ya | 5 hashtag trending Indonesia (`#tipsharian`, `#inspirasiindonesia`, `#bisnisindonesia`) |
| `{niche_id_tags[]}` | ya | 5 hashtag niche Indonesia topic-spesifik (`#brandvoice`, `#copywriting`, `#umkm`) |
| `{micro_local_tags[]}` | ya | 5 hashtag kota-spesifik (`#jakartainfo`, `#bandungkreatif`, `#suryabayahits`) |

---

## Template

```
{hook_line}

{value_paragraph_line_1}.
{value_paragraph_line_2}.
{value_paragraph_line_3}.

{cta_line}.

.
.
.

{trending_id_tags_joined}
{niche_id_tags_joined}
{micro_local_tags_joined}
```

### Contoh terisi (topic: brand voice locking, audience UMKM Indonesia)

```
Caption brand kamu flat karena satu hal ini.

Voice yang ganti-ganti tone tiap minggu bikin audience bingung.
Senin formal, Rabu casual, Jumat promo — pola yang nggak ke-baca.
Lock voice dulu dari 20 sample lama, baru draft konsisten tiap minggu.

Save buat dipake nanti, ya kak.

.
.
.

#tipsharian #inspirasiindonesia #bisnisindonesia #umkmindonesia #brandindonesia
#brandvoice #copywriting #captionwriter #socialmediatips #marketingdigital
#jakartainfo #bandungkreatif #suryabayahits #yogyakarta #balidigital
```

### Contoh kedua (topic: konsistensi posting jadwal, audience creator Jakarta)

```
Konsistensi bikin algoritma IG sayang sama kamu.

Posting 3x seminggu tetap di jam yang sama beat posting random 7x sehari.
Algoritma reward predictability. Audience juga ngebiasain check kamu di slot itu.
Cobain 2 minggu, lihat metrics reach kamu sebelum vs sesudah.

Komen pengalaman kamu, ya min.

.
.
.

#tipsharian #inspirasiindonesia #bisnisindonesia #creatorindonesia #kontenkreator
#instagramtips #socialmediatips #contentcreator #brandbuilder #personalbranding
#jakartainfo #jakartapusat #bandung #yogyakarta #suryabaya
```

---

## Reference packet — Instagram-id awareness

### Feed convention 2026

- **Caption hook visible:** ~125 karakter pertama muncul di feed sebelum "more". Hook wajib lengkap di window ini
- **Paragraph break dengan baris kosong:** IG feed tidak render markdown. Pakai blank line untuk pisah paragraf
- **Hashtag dot-spacer:** 3 baris dot (`.\n.\n.`) sebelum hashtag block — bikin hashtag tidak nempel ke CTA, terlihat profesional
- **Hashtag posisi:** akhir caption (bukan komen pertama — kontroversial 2024-2026, IG admit di-pertimbangkan sama). Default: akhir caption
- **Hashtag count 15 optimal:** Indonesia engagement sweet spot. 5-trending + 5-niche + 5-micro-local

### Hashtag mix wajib (Indonesia-localized)

**Tier 1 — Trending Indonesia umum (5):**
- `#tipsharian`, `#inspirasiindonesia`, `#bisnisindonesia`, `#umkmindonesia`, `#brandindonesia`, `#kontenindonesia`, `#creatorindonesia`

**Tier 2 — Niche topic Indonesia (5):**
- Marketing: `#marketingdigital`, `#socialmediatips`, `#brandvoice`, `#copywriting`, `#captionwriter`
- Lifestyle: `#hijabstyle`, `#fashionindonesia`, `#kulinerindonesia`, `#travelingindonesia`
- Bisnis: `#bisnisumkm`, `#startupindonesia`, `#entrepreneurindonesia`

**Tier 3 — Micro-local kota (5):**
- `#jakartainfo`, `#jakartapusat`, `#bandungkreatif`, `#bandungfood`, `#suryabayahits`, `#yogyakarta`, `#balidigital`, `#medanhits`, `#semaranghits`

**Jangan pakai sebagai primary:** `#instagood`, `#photooftheday`, `#love` (global generic, reach Indonesia lemah, brand-bench feel)

### Posting time recommendation (Indonesia WIB)

- Senin-Jumat: 11:00, 17:00, 19:30 WIB (jam istirahat + after-work)
- Sabtu-Minggu: 09:00, 14:00, 20:00 WIB (weekend leisure)

---

## Tone guide — Instagram-id feed

- **Calm-premium register:** bukan influencer-shouting, bukan Duolingo-perky. Hook menarik tanpa caps lock, tanpa exclamation
- **Mid-formal:** "kamu" (bukan "Anda" / "lo"). Sapaan "kak" / "min" boleh di CTA, bukan di body
- **Paragraph structure ketat:** hook (1 baris) → value (2-3 kalimat) → CTA (1 baris). Bukan stream of consciousness
- **CTA soft, bukan demanding:** "Save buat dipake nanti" beat "DOWNLOAD SEKARANG". "Komen pengalaman kamu" beat "TAG TEMEN YANG WAJIB BACA INI"
- **Mix bahasa terbatas:** technical term boleh inggris ("algoritma", "engagement", "reach"). Body dominan BI
- **Hashtag block visual:** 3 baris dot pemisah → 3 baris hashtag (5 per baris). Bukan satu blok besar campur aduk

---

## BANNED di caption Instagram-id (jangan pakai sama sekali)

- `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`
- Exclamation marks (zero — calm-premium register)
- Caps lock di hook atau body (terbaca shouting)
- "DM us for collab", "LINK IN BIO" all-caps (over-eager, kurang premium)
- Generic global hashtag sebagai primary (`#instagood`, `#love`, `#happy`)

---

## Validation rules (skill-side)

- Hook line ≤125 karakter (IG feed cutoff)
- Caption total ≤2200 karakter (IG hard limit)
- Hashtag total 15, mix 5-trending + 5-niche + 5-micro-local
- Min 1 micro-local tag wajib (Indonesia-deep signal)
- CTA harus mengandung action verb: save / komen / tap / follow / share
- Skor voice-fit terhadap locked voice profile sebelum kirim
