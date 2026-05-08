# template-deck-builder — Hermes skill

Bundle: slide-master (v2)
Tier: starter+
Handler: `hermes-skill:template-deck-builder` (Hermes fills the chosen template locally on the customer's VPS)

## Kapan dipakai

Customer eksplisit minta template — bukan story-arc. Trigger phrases:

- "deck dari template"
- "pakai template [nama]"
- "presentasi tugas template"
- "template defense skripsi"
- "weekly report template"
- "project update template"

Juga: ketika customer cerita konteks yang exactly cocok dengan salah satu template (mis. "Senin ini sidang skripsi" → tawarkan thesis-defense template).

## Yang harus diekstrak dari pesan customer

| Field | Type | Wajib | Catatan |
|---|---|---|---|
| `template_id` | enum: assignment-presentation \| thesis-defense \| lecture-recap \| weekly-report \| project-update \| training-onboarding | ya | Tunjukkan opsi kalau customer belum pilih |
| `topic` | string | ya | Topik / project / skripsi-judul |
| `duration_minutes` | int | tidak | Default per template (lihat manifest description) |
| `audience` | string | tidak | Default per template (mis. dosen penguji untuk thesis-defense, manager + team untuk weekly-report) |
| `data_points` | array | tidak | Customer kasih kalau ada — buat metrics / chart |

Kalau "deck dari template" tanpa nama template — tampilkan opsi:

> "Aku punya 6 template: 3 student (presentasi tugas, defense skripsi, recap kuliah), 3 worker (weekly report, project update, training). Mau yang mana?"

## Yang dilakukan

1. Apply defaults dari `template_id`.
2. Resolve template dari `agent-pack/templates/deck/<student|worker>/<template_id>.md`.
3. Substitute placeholders dengan content yang customer kasih atau yang aku susun (untuk content-heavy slides, pakai customer's BYOK LLM).
4. Output markdown ke `/tmp/slide-master-out/deck-<template_id>-<slug>-<timestamp>.md`.
5. Tunjukkan slide-by-slide preview di Telegram (slide titles + key visual brief), tawarkan adjustment.

## Output yang dikembalikan ke customer

Persona-voice wrapper (template-mode):

> "Aku susun [template_id] dengan topic [topic]. Total [N] slide. Markdown ada di [path]. Slide-slide yang butuh data kamu (metrics, chart) udah aku tag dengan [DATA_NEEDED] — kasih tahu kalau mau aku isi. Convert ke PowerPoint / Keynote / Google Slides bisa via Pandoc."

## Decline criteria

- Sama seperti narrative-arc-deck-builder — no data fabrication, no misleading claims.
- Template yang tidak ada di inventory → tawarkan extend-capabilities skill (generate template baru, simpan ke customer-grown).

## Decline kalau missing context

Kalau "deck dari template" tanpa context lain — pakai template-picker prompt di atas.
