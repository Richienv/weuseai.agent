# content-calendar-builder — Hermes skill

Bundle: social-conductor (v2)
Tier: pro+
Handler: `hermes-skill:content-calendar-builder`

## Kapan dipakai

- "susun calendar"
- "schedule post bulan depan"
- "kasih plan content"
- "weekly cadence"
- "content theme per week"

## Yang harus diekstrak

| Field | Wajib | Notes |
|---|---|---|
| `mode` | ya | enum: build-new \| extend-existing \| weekly-review |
| `platforms` | ya | Array dari [tiktok, reels, x, linkedin, blog, threads]. Customer pilih yang dia fokus. |
| `cadence` | tidak | Preset name (solopreneur, brand, creator) atau custom freq per platform |
| `weeks` | tidak | Default 4 (next month) |
| `themes` | tidak | List tema mingguan dari customer |

## Yang dilakukan

Load `templates/calendar-schema.md` + `templates/weekly-cadence-presets.md`.

### build-new mode
1. Resolve cadence → output count per platform per week.
2. Slot tiap entry ke calendar DB (`/var/lib/weuseai/customer-grown/content-calendar.sqlite` atau JSON):
   ```
   { id, customer_id, platform, slot_date, slot_time, theme, content_type, status: 'planned', draft_id: null, posted_at: null }
   ```
3. Per week, suggest tema kalau customer ngga input.
4. Output: 4-week table + DB persisted.
5. Optional: export `.ics` untuk import ke Google Calendar manual.

### extend-existing mode
Read existing calendar, extend N weeks ke depan dengan pattern yang sudah established.

### weekly-review mode
Surface this-week status:
- Slot terjadwal vs draft ready vs posted
- Gap kalau ada (mis. Wednesday slot belum draft)
- Suggest priority drafting

## Output

Persona-voice wrapper untuk build-new:

> "Calendar 4 minggu ke depan untuk **TikTok + LinkedIn** (cadence solopreneur, 3/week):
>
> | Week | Tema | Mon (TikTok) | Wed (LinkedIn) | Fri (TikTok) |
> |---|---|---|---|---|
> | W1 | Tips budgeting basics | Hook video | Long-form post | Story-format |
> | W2 | Common mistakes | Comedic skit | Listicle | Behind-the-scenes |
> | W3 | Tools / app review | Demo video | Compare table | Q&A |
> | W4 | Audience Q&A | Address-question | Reflection post | Recap |
>
> Calendar persisted local. Aku kasih reminder H-2 untuk draft setiap slot. Mau aku export ke `.ics` biar import ke Google Calendar kamu?"

## Decline

- **Auto-post ke platform.** Tidak — calendar tracking + draft only. Kamu yang submit.
- **Pull data dari platform 3rd-party.** Calendar based on your input, bukan scrape.

## Failure handling

- Cadence ambigu → tanya target output ("3/minggu, daily, atau campaign-burst saja?").
- Themes empty → suggest theme rotation berdasarkan niche (kalau kontext tersedia dari pen-soul-up).
