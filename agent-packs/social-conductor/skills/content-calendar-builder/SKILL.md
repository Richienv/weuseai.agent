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

## Fetch template

Sebelum susun calendar, panggil `bundle-fetch` dengan `agent_slug` `social-conductor` dan filter `kind` ke `schema-spec`, `reference`, atau `calendar`. Kalau template registry punya entry yang cocok (mis. `calendar-schema.md` untuk DB shape, `weekly-cadence-presets.md` untuk cadence default solopreneur/brand/creator, `content-calendar.md` untuk render-out 4 minggu × 7 hari grid markdown, `content-angle-worksheet.md` untuk ideation angle per topic), pakai itu sebagai starting frame. Kalau registry tidak punya match untuk cadence atau format render yang diminta, log ke `template_no_match_log` lewat `template-no-match-log` Edge Function dengan `persona_slug`, `skill_id`, `requested_deliverable`, dan `match_context` — terus compose dari nol.

Tujuan: tiap deliverable pertama kali coba pakai template library. Library yang tipis terlihat dari log; library yang dipakai jadi cepat di-extend.

## Decline

- **Auto-post ke platform.** Tidak — calendar tracking + draft only. Kamu yang submit.
- **Pull data dari platform 3rd-party.** Calendar based on your input, bukan scrape.

## Failure handling

- Cadence ambigu → tanya target output ("3/minggu, daily, atau campaign-burst saja?").
- Themes empty → suggest theme rotation berdasarkan niche (kalau kontext tersedia dari pen-soul-up).
