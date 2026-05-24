# Template — End card CTA Bahasa Indonesia

Template untuk end card video — 3-5 detik penutup yang punya CTA explicit, sound outro, dan brand callout. Disesuaikan untuk feed TikTok-ID / IG Reels / YouTube Shorts Indonesia. **BUKAN** "Subscribe + Like + Notification Bell" — itu register YouTube long-form US yang nggak fit ke vertical feed-based platform.

End card di Indonesia harus jadi **engagement asset**, bukan obligasi closing.

---

## Variables

- `{video_topic}` — string. Topik video utama (untuk CTA context).
- `{platform}` — enum. `TikTok` | `Instagram Reels` | `YouTube Shorts` | `multi-platform`.
- `{cta_intent}` — enum. `save` | `share` | `comment` | `follow` | `link-in-bio` | `dm`.
- `{brand_handle}` — string. @username brand.
- `{creator_handle}` — string. @username creator (kalau UGC / partnership).
- `{duration_sec}` — int. 3 / 5 (default 3 untuk short-form, 5 untuk YouTube Shorts panjang).
- `{tone_register}` — enum. `calm-warm` | `playful` | `urgent-helpful` | `mentoring`.

---

## Production notes

### Library CTA Indonesia (per intent)

| Intent | CTA primary | CTA varian | Konteks pakai |
|--------|-------------|------------|---------------|
| Save | "Save buat nanti" | "Save dulu, baca pas free" / "Save sebelum lupa" | Konten edukasi, list, framework, tutorial step-by-step |
| Save (specific use-case) | "Save buat reminder pas gajian" | "Save buat ditunjukin ke partner" / "Save buat sharing meeting" | Konten dengan trigger waktu / orang spesifik |
| Share | "Share ke teman yang butuh ini" | "Share ke grup keluarga" / "Tag temen yang lagi cari ini" | Konten yang punya pain-point relate-able |
| Comment | "Komen 'YA' kalau mau lanjutan" | "Komen pengalaman lo di bawah" / "Komen 'IKUT' buat join challenge" | Konten yang openings untuk Part 2 / community |
| Comment (poll style) | "Komen Tim A atau Tim B" | "Komen angka pilihan lo: 1, 2, atau 3" | Konten dengan choice / preference |
| Follow | "Follow buat lebih banyak [topic]" | "Follow buat update mingguan" / "Follow buat tips kayak gini tiap hari" | Konten yang punya seri / cadence jelas |
| Link in bio | "Link di bio buat detail" | "Cek bio buat dapetin [thing]" / "Klik link profil, gratis" | Konten dengan asset off-platform (eBook, registrasi, product page) |
| DM | "DM 'INFO' buat detail" | "DM kalau mau coba" / "DM gratis konsultasi 15 menit" | Konten dengan personal-touch offer |

### Anti-pattern (jangan dipake di Indonesia)

- "Subscribe + Like + Notification Bell" — register YouTube long-form US. TikTok/Reels/Shorts pakai feed algoritmic, notification bell nggak relevan.
- "Smash that like button" — tone agresi yang feel out-of-place di kebanyakan brand voice Indonesia.
- "Drop a like and subscribe" — generic, low engagement signal.
- "Don't forget to follow" — passive-pleading. Direct CTA lebih effective.
- "Comment your thoughts" — terlalu generic. Specific prompt > open prompt.

### Engagement signal per platform

| Platform | Sinyal terkuat | Sinyal kedua | Catatan |
|----------|----------------|--------------|---------|
| TikTok | Save | Komen | Follow lebih lambat trigger algoritma daripada save+komen |
| Instagram Reels | Share to story | Save | Reels algoritma kuat ke share, terutama ke story |
| YouTube Shorts | Komen | Follow / Subscribe (di Shorts beda dari long-form) | Like + dwell time juga kuat — pastikan video re-watchable |

End card CTA harus match platform — kalau cross-post, **rebuild end card per platform**, bukan re-use.

### Brand callout convention

- **Audio**: brand mention di-VO di end card, bukan cuma di-text. Voice = trust signal.
- **Visual**: logo + handle di end card, ukuran proporsional (10-15% dari frame area, bukan dominant).
- **Position**: bottom-center atau center, bukan corner — corner ke-crop di reels frame.
- **Color**: kontras tinggi dengan background. Brand color sebagai background dengan teks putih = aman.

### Audio outro

- **Length**: 3-5 detik, sync dengan visual.
- **Sound choice**: drop ke quieter version dari sound utama, atau silence + sound effect minimal (notification chime, soft swoosh).
- **Hindari**: trending sound full-volume di end card — audience auto-skip karena overload.

---

## Template

```
END CARD — {video_topic}
Platform: {platform}
Duration: {duration_sec}s
CTA intent: {cta_intent}
Tone: {tone_register}

────────────────────────────────────────
VISUAL (full {duration_sec} detik)
────────────────────────────────────────
Frame:           Solid color background OR last frame video dengan blur overlay
Logo position:   <center / bottom-center>
Logo size:       <10-15% frame area>
Handle text:     @{brand_handle}
                 (kalau UGC: + @{creator_handle} dibawah)
Handle font:     Sans-serif, white atau brand color, kontras tinggi
CTA text:        <pilih dari library berdasarkan {cta_intent}>
CTA position:    Center, di atas atau di bawah logo
Animation:       Simple fade-in atau slide-up. Hindari motion graphic kompleks di 3 detik.

────────────────────────────────────────
AUDIO
────────────────────────────────────────
VO line:         <1 kalimat, register sesuai {tone_register}. Contoh: "Save buat reminder pas gajian, ya.">
VO duration:     2-3 detik (dari total {duration_sec})
Sound bed:       <drop sound utama ke -12dB, atau swap ke outro signature>
SFX:             <optional — soft swoosh saat logo masuk, notification chime saat CTA muncul>

────────────────────────────────────────
CTA OPTIONS — pilih satu (jangan compound)
────────────────────────────────────────
SAVE
- Primary:     "Save buat nanti"
- Specific:    "Save buat [reminder spesifik]"

SHARE
- Primary:     "Share ke teman yang butuh ini"
- Specific:    "Tag temen lo yang lagi [konteks]"

COMMENT
- Primary:     "Komen 'YA' kalau mau lanjutan"
- Poll:        "Komen [opsi 1] atau [opsi 2]"

FOLLOW
- Primary:     "Follow buat lebih banyak [topic]"
- Cadence:     "Follow, update tiap [hari / minggu]"

LINK IN BIO
- Primary:     "Link di bio buat detail"
- Specific:    "Klik bio, [asset name] gratis"

DM
- Primary:     "DM 'INFO' buat detail"
- Specific:    "DM kalau mau coba [product]"

────────────────────────────────────────
COMPOUND CTA (hanya kalau >5 detik end card)
────────────────────────────────────────
- "Save dulu, follow buat update". Max 2 actions.
- 3+ actions di compound = audience pilih 0.

────────────────────────────────────────
DISCLOSURE (kalau paid / partnership)
────────────────────────────────────────
- Text small di frame: "dalam kerjasama dengan {brand_handle}"
- Atau hashtag #ads di caption — disebut juga di-VO end card kalau partnership formal
```

---

## Tone guide

- CTA **spesifik > generic**. "Save buat reminder pas gajian" 3-4× engagement rate dari "Save video ini".
- 1 action per end card. "Save + Share + Follow" = audience pilih 0.
- VO di end card lebih kuat daripada text-only. Audience yang scroll cepet kena dari telinga, bukan mata.
- Brand callout di end card, **bukan** di hook. Hook punya brand callout = audience curiga iklan, skip cepat.
- End card 3 detik aman untuk TikTok/Reels. 5 detik untuk YouTube Shorts panjang. Lebih dari 5 detik = retention loss di tail.
- Hindari "klik link di bio" sebagai CTA default — link bio cuma kuat kalau konten content punya hook yang bikin audience mau action off-platform. Kalau konten edukasi murni, CTA save / comment lebih realistic.
- Cross-platform = rebuild end card per platform. TikTok save-friendly, IG share-to-story-friendly, YouTube Shorts comment-friendly.
- Banned: `basically`, `just`, `literally`, `honestly`, `kind of`, `pretty much`, `revolutionary`, `disrupt`, `10x`, `game-changer`, `next-level`.
- Zero exclamation mark di CTA copy. Direct verbs cukup tegas tanpa tanda seru.
