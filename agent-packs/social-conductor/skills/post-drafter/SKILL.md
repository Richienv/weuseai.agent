# post-drafter — Hermes skill

Bundle: social-conductor (v2)
Tier: pro+
Handler: `hermes-skill:post-drafter`

## Kapan dipakai

- "draft post LinkedIn"
- "caption Instagram"
- "thread X tentang topic Y"
- "tulis blog snippet"
- "iterate draft yang ini"

Sering dipanggil **setelah** content-calendar-builder slot didefinisikan, tapi bisa juga ad-hoc.

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `platform` | ya | tiktok \| reels \| x \| linkedin \| blog \| threads \| facebook |
| `topic_or_outline` | ya | Topic singkat atau bullet outline dari customer |
| `length_target` | tidak | "short" / "medium" / "long" relative ke platform |
| `cta_type` | tidak | save / comment / share / link / no-cta |
| `slot_id` | tidak | Reference ke content-calendar entry kalau pre-planned |

## Yang dilakukan

Load `templates/platform-length-rules.md`. Load voice profile dari voice-locker.

Per platform, length budget + structure:

| Platform | Char budget | Structure |
|---|---|---|
| TikTok | 100-150 | Hook + 1-2 body line + CTA + hashtags |
| Reels | 80-125 | Hook + body + CTA + hashtags |
| X | 250-280 (single) / thread | Punchy, 1 idea per tweet |
| LinkedIn | 600-1300 | Hook line + paragraphs + CTA + hashtags |
| Blog | 800-2000+ | H1 + intro + sections + closing |
| Threads | 250-500 | Conversational, story-arc |
| Facebook | 200-500 | Personal-style, less formal |

Voice rules applied per voice profile + CLAUDE.md global.

Output: draft + voice-fit-score (high/medium/low) + slot_id reference kalau ada.

## Output

Persona-voice wrapper:

> "Draft LinkedIn post (topic: 'lessons learned launching produk pertama', length medium ~700 char, CTA comment):
>
> ---
> Pernah pikir produk siap, tapi market bilang lain.
>
> 3 bulan ke belakang aku launch [product]. Hipotesis awal: small business owner butuh fitur X. Realita: mereka peduli fitur Y, dan X cuma bonus.
>
> Yang aku ubah:
> 1. Re-survey 10 pelanggan pertama, fokus pertanyaan ke pain real, bukan feature wishlist.
> 2. Pivot landing page — fitur X di-demote, fitur Y jadi headline.
> 3. Onboarding email re-write: lead dengan use case Y, bukan tour fitur.
>
> Result minggu ke-1 setelah pivot: trial conversion naik 3x.
>
> Kalau kamu juga pernah miss-read pasar di awal, share di komen — penasaran pattern-nya.
>
> #productlaunch #startupId #lessonslearned
> ---
>
> **Voice-fit: high** (calm-reflective, kamu form, zero exclamation, em-dash natural).
> Length: 738 char, fit LinkedIn sweet spot.
>
> Kamu copy-paste ke LinkedIn manual, atau mau aku iterate?"

## Decline

- **Draft post untuk topic yang violate platform policy.** Aku flag.
- **Draft post atas voice yang belum locked.** Output outline-only sampai voice locker selesai.

## Failure handling

- Voice fit medium/low → output draft + flag dimensi yang ngga match + suggest tweak.
- Topic too vague → tanya 1-2 follow-up: "Audience target siapa? Tone yang kamu mau lebih edukasi atau personal-reflektif?"
